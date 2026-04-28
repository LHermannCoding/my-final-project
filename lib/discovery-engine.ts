import { MOCK_TRACKS } from "@/lib/mock-data";
import { resolveGenreInput } from "@/lib/providers/genre";
import { getLastFmArtistListeners, getLastFmTrackInfo } from "@/lib/providers/lastfm";
import { getSpotifyAppToken, searchSpotifyTracks } from "@/lib/providers/spotify";
import {
  DiscoveryFilters,
  DiscoveryResponse,
  DiscoverySelectionStrategy,
  TrackCandidate
} from "@/lib/types";
import { inRange, sanitizeFilters } from "@/lib/utils";

function hasLiveProviders(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.LASTFM_API_KEY
  );
}

function hasRange(range: DiscoveryFilters["bpm"]): boolean {
  return typeof range.min === "number" || typeof range.max === "number";
}

type CandidateEvaluation = {
  track: TrackCandidate;
  exactMatch: boolean;
  matchedFilters: number;
  totalActiveFilters: number;
  closenessScore: number;
  obscurityScore: number;
  totalScore: number;
};

function genreMatches(track: TrackCandidate, genre: string): boolean {
  return !genre || !track.genreHint || track.genreHint.toLowerCase().includes(genre.toLowerCase());
}

function rangeDistance(value: number | undefined, range: DiscoveryFilters["bpm"]): number {
  if (!hasRange(range)) {
    return 0;
  }

  if (typeof value !== "number") {
    return 1;
  }

  if (inRange(value, range)) {
    return 0;
  }

  if (typeof range.min === "number" && value < range.min) {
    const divisor = Math.max(range.min, 1);
    return (range.min - value) / divisor;
  }

  if (typeof range.max === "number" && value > range.max) {
    const divisor = Math.max(range.max, 1);
    return (value - range.max) / divisor;
  }

  return 1;
}

function activeFilterCount(filters: DiscoveryFilters): number {
  return Number(Boolean(filters.genre)) +
    Number(hasRange(filters.trackPlayCount)) +
    Number(hasRange(filters.artistListeners)) +
    Number(hasRange(filters.bpm));
}

function evaluateTrack(track: TrackCandidate, filters: DiscoveryFilters): CandidateEvaluation {
  const checks = [
    {
      active: Boolean(filters.genre),
      match: genreMatches(track, filters.genre),
      distance: genreMatches(track, filters.genre) ? 0 : 1
    },
    {
      active: hasRange(filters.trackPlayCount),
      match: !hasRange(filters.trackPlayCount) || inRange(track.playCount, filters.trackPlayCount),
      distance: rangeDistance(track.playCount, filters.trackPlayCount)
    },
    {
      active: hasRange(filters.artistListeners),
      match:
        !hasRange(filters.artistListeners) ||
        inRange(track.artistListeners, filters.artistListeners),
      distance: rangeDistance(track.artistListeners, filters.artistListeners)
    },
    {
      active: hasRange(filters.bpm),
      match: !hasRange(filters.bpm) || inRange(track.bpm, filters.bpm),
      distance: rangeDistance(track.bpm, filters.bpm)
    }
  ];

  const totalActiveFilters = checks.filter((item) => item.active).length;
  const matchedFilters = checks.filter((item) => !item.active || item.match).length;
  const totalDistance = checks.reduce(
    (sum, item) => sum + (item.active ? Math.min(item.distance, 1.5) : 0),
    0
  );
  const closenessScore = totalActiveFilters === 0 ? 1 : Math.max(0, 1 - totalDistance / totalActiveFilters);
  const obscurityInputs = [track.playCount, track.artistListeners].filter(
    (value): value is number => typeof value === "number"
  );
  const obscurityScore =
    obscurityInputs.length === 0
      ? 0.45
      : obscurityInputs
          .map((value) => 1 / (1 + Math.log10(Math.max(value, 10))))
          .reduce((sum, value) => sum + value, 0) / obscurityInputs.length;
  const totalScore = closenessScore * 0.8 + obscurityScore * 0.2;

  return {
    track,
    exactMatch: totalActiveFilters === 0 || checks.every((item) => !item.active || item.match),
    matchedFilters,
    totalActiveFilters,
    closenessScore,
    obscurityScore,
    totalScore
  };
}

function pickRandomTrack<T>(tracks: T[]): T {
  return tracks[Math.floor(Math.random() * tracks.length)];
}

function selectCandidatePool(
  tracks: TrackCandidate[],
  filters: DiscoveryFilters,
  diagnostics: string[]
): { selected: TrackCandidate; strategy: DiscoverySelectionStrategy; candidateCount: number; exactCandidateCount: number; sampledFromTop: number } {
  const evaluations = tracks
    .map((track) => evaluateTrack(track, filters))
    .sort((left, right) => right.totalScore - left.totalScore);
  const exact = evaluations.filter((item) => item.exactMatch);

  if (exact.length > 0) {
    const exactTopSize =
      filters.strictness === "adventurous"
        ? Math.min(6, exact.length)
        : filters.strictness === "balanced"
          ? exact.length
          : exact.length;
    return {
      selected: pickRandomTrack(exact.slice(0, exactTopSize).map((item) => item.track)),
      strategy: "exact",
      candidateCount: exact.length,
      exactCandidateCount: exact.length,
      sampledFromTop: exactTopSize
    };
  }

  const totalActiveFilters = activeFilterCount(filters);
  const relaxed = evaluations.filter((item) => {
    if (totalActiveFilters === 0) {
      return true;
    }

    return item.matchedFilters >= Math.max(1, totalActiveFilters - 1) || item.closenessScore >= 0.68;
  });

  if (relaxed.length > 0) {
    const relaxedWindow =
      filters.strictness === "exact"
        ? 2
        : filters.strictness === "adventurous"
          ? 6
          : 4;
    const topPool = relaxed.slice(0, Math.min(relaxedWindow, relaxed.length));
    diagnostics.push(
      `No exact matches found, selecting from ${topPool.length} high-scoring near matches.`
    );
    return {
      selected: pickRandomTrack(topPool.map((item) => item.track)),
      strategy: "relaxed",
      candidateCount: relaxed.length,
      exactCandidateCount: 0,
      sampledFromTop: topPool.length
    };
  }

  const fallbackWindow =
    filters.strictness === "exact"
      ? 2
      : filters.strictness === "adventurous"
        ? 7
        : 5;
  const fallbackPool = evaluations.slice(0, Math.min(fallbackWindow, evaluations.length));
  diagnostics.push("No close candidates found, widening to the strongest fallback pool.");
  return {
    selected: pickRandomTrack(fallbackPool.map((item) => item.track)),
    strategy: "fallback",
    candidateCount: evaluations.length,
    exactCandidateCount: 0,
    sampledFromTop: fallbackPool.length
  };
}

async function discoverMock(
  filters: DiscoveryFilters,
  diagnostics: string[],
  resolvedGenre?: string
): Promise<DiscoveryResponse> {
  const selection = selectCandidatePool(MOCK_TRACKS, filters, diagnostics);

  return {
    track: selection.selected,
    resolvedGenre,
    mode: "mock",
    diagnostics,
    selection: {
      strategy: selection.strategy,
      candidateCount: selection.candidateCount,
      exactCandidateCount: selection.exactCandidateCount,
      sampledFromTop: selection.sampledFromTop
    }
  };
}

async function discoverLive(
  filters: DiscoveryFilters,
  diagnostics: string[],
  resolvedGenre?: string
): Promise<DiscoveryResponse> {
  const spotifyToken = await getSpotifyAppToken();
  if (!spotifyToken) {
    diagnostics.push("Spotify app token unavailable, falling back to mock mode.");
    return discoverMock(filters, diagnostics, resolvedGenre);
  }

  const query = resolvedGenre ? `genre:"${resolvedGenre}"` : "indie OR alternative";
  const rawTracks = await searchSpotifyTracks(query, spotifyToken);
  if (rawTracks.length === 0) {
    diagnostics.push("Spotify search returned no tracks, falling back to mock mode.");
    return discoverMock(filters, diagnostics, resolvedGenre);
  }

  const enriched = await Promise.all(
    rawTracks.map(async (track) => {
      const [trackInfo, artistListeners] = await Promise.all([
        getLastFmTrackInfo(track.artist, track.title),
        getLastFmArtistListeners(track.artist)
      ]);

      return {
        ...track,
        genreHint: resolvedGenre || filters.genre || track.genreHint,
        playCount: trackInfo?.playCount,
        artistListeners: artistListeners ?? trackInfo?.listeners
      };
    })
  );

  const selection = selectCandidatePool(
    enriched,
    filters,
    diagnostics
  );

  return {
    track: selection.selected,
    resolvedGenre,
    mode: "live",
    diagnostics,
    selection: {
      strategy: selection.strategy,
      candidateCount: selection.candidateCount,
      exactCandidateCount: selection.exactCandidateCount,
      sampledFromTop: selection.sampledFromTop
    }
  };
}

export async function discoverTrack(input: Partial<DiscoveryFilters>): Promise<DiscoveryResponse> {
  const filters = sanitizeFilters(input);
  const diagnostics: string[] = [];
  const mode = process.env.DISCOVERY_MODE ?? "auto";
  const genreResolution = await resolveGenreInput(filters.genre);
  const resolvedGenre = genreResolution.resolvedGenre?.trim();
  diagnostics.push(...genreResolution.diagnostics);
  const resolvedFilters = { ...filters, genre: resolvedGenre || filters.genre };

  if (mode === "mock") {
    diagnostics.push("Discovery mode is forced to mock.");
    return discoverMock(resolvedFilters, diagnostics, resolvedGenre);
  }

  if (mode === "live" || hasLiveProviders()) {
    return discoverLive(resolvedFilters, diagnostics, resolvedGenre);
  }

  diagnostics.push("Live API credentials not fully configured, using mock discovery.");
  return discoverMock(resolvedFilters, diagnostics, resolvedGenre);
}
