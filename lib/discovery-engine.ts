import { MOCK_TRACKS } from "@/lib/mock-data";
import { KNOWN_GENRES, resolveGenreInput } from "@/lib/providers/genre";
import {
  getLastFmArtistListeners,
  getLastFmTrackInfo
} from "@/lib/providers/lastfm";
import {
  getSpotifyAppToken,
  searchSpotifyArtistsByGenre,
  searchSpotifyTracks,
  searchSpotifyTracksByGenre
} from "@/lib/providers/spotify";
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

const BROAD_RANDOM_TAGS = ["pop", "electronic", "indie rock", "jazz", "ambient", "soul"];
const BROAD_SPOTIFY_GENRES = new Set(BROAD_RANDOM_TAGS);

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

function primaryArtistName(value: string): string {
  return value
    .split(",")[0]
    .replace(/\s+feat\..*$/i, "")
    .replace(/\s+ft\..*$/i, "")
    .trim();
}

function sampleRandomItems<T>(items: T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, Math.min(count, pool.length));
}

async function buildSpotifyCandidatePool(
  resolvedGenre: string | undefined,
  filters: DiscoveryFilters,
  spotifyToken: string,
  spotifyAccessToken?: string
): Promise<{ tracks: TrackCandidate[]; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const requiresHeavierSampling =
    hasRange(filters.trackPlayCount) || hasRange(filters.artistListeners) || hasRange(filters.bpm);

  const trackOffsets = requiresHeavierSampling ? [0, 50] : [0];
  const artistSampleCount = requiresHeavierSampling ? 4 : 2;
  const useGenreTrackQuery = resolvedGenre ? !BROAD_SPOTIFY_GENRES.has(resolvedGenre) : false;

  const genreQueries = resolvedGenre
    ? [resolvedGenre]
    : sampleRandomItems([...KNOWN_GENRES, ...BROAD_RANDOM_TAGS], 2);

  async function gatherWithToken(token: string) {
    return Promise.all(
      genreQueries.map(async (genreQuery) => {
        const [genreTracks, plainTextTracks, genreArtists] = await Promise.all([
          useGenreTrackQuery
            ? searchSpotifyTracksByGenre(genreQuery, token, [0])
            : Promise.resolve([]),
          searchSpotifyTracks(genreQuery, token, trackOffsets),
          searchSpotifyArtistsByGenre(genreQuery, token, [0], 20)
        ]);

        const sampledArtists = sampleRandomItems(genreArtists, artistSampleCount);
        const artistTrackBatches = await Promise.all(
          sampledArtists.map((artist) =>
            searchSpotifyTracks(`artist:"${primaryArtistName(artist.name)}"`, token, [0])
          )
        );

        return [...genreTracks, ...plainTextTracks, ...artistTrackBatches.flat()];
      })
    );
  }

  const preferredToken = spotifyAccessToken ?? spotifyToken;
  let candidateBatches = await gatherWithToken(preferredToken);

  if (candidateBatches.flat().length === 0 && preferredToken !== spotifyToken) {
    diagnostics.push("User Spotify search came up empty, retrying with the app token.");
    candidateBatches = await gatherWithToken(spotifyToken);
  }

  const uniqueTracks = new Map<string, TrackCandidate>();
  for (const track of candidateBatches.flat()) {
    uniqueTracks.set(track.id, track);
  }

  if (resolvedGenre) {
    diagnostics.push(`Built the live pool directly from Spotify search for "${resolvedGenre}".`);
  } else {
    diagnostics.push("Built the live pool directly from Spotify search across sampled genres.");
  }

  return {
    tracks: Array.from(uniqueTracks.values()),
    diagnostics
  };
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
    const exactTracks = exact.map((item) => item.track);
    const exactTopSize = exactTracks.length;
    return {
      selected: pickRandomTrack(exactTracks.slice(0, exactTopSize)),
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
    const topPool = relaxed
      .slice(0, Math.min(Math.max(relaxedWindow * 3, 8), relaxed.length))
      .map((item) => item.track);
    diagnostics.push(
      `No exact matches found, selecting from ${topPool.length} high-scoring near matches.`
    );
    return {
      selected: pickRandomTrack(topPool),
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
  const fallbackPool = evaluations
    .slice(0, Math.min(Math.max(fallbackWindow * 4, 10), evaluations.length))
    .map((item) => item.track);
  diagnostics.push("No close candidates found, widening to the strongest fallback pool.");
  return {
    selected: pickRandomTrack(fallbackPool),
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
  resolvedGenre?: string,
  spotifyAccessToken?: string
): Promise<DiscoveryResponse> {
  const spotifyToken = await getSpotifyAppToken();
  if (!spotifyToken) {
    diagnostics.push("Spotify app token unavailable, falling back to mock mode.");
    return discoverMock(filters, diagnostics, resolvedGenre);
  }

  const livePool = await buildSpotifyCandidatePool(
    resolvedGenre,
    filters,
    spotifyToken,
    spotifyAccessToken
  );
  diagnostics.push(...livePool.diagnostics);
  let rawTracks = livePool.tracks;

  if (rawTracks.length > 0) {
    rawTracks = sampleRandomItems(rawTracks, Math.min(rawTracks.length, hasRange(filters.trackPlayCount) || hasRange(filters.artistListeners) ? 60 : 30));
  }

  if (rawTracks.length === 0) {
    diagnostics.push("Primary Spotify search came up empty, widening to a broader Spotify pool.");
    rawTracks = (
      await buildSpotifyCandidatePool(
        undefined,
        { ...filters, genre: "" },
        spotifyToken,
        spotifyAccessToken
      )
    ).tracks;

    if (rawTracks.length > 0) {
      rawTracks = sampleRandomItems(rawTracks, Math.min(rawTracks.length, 40));
    }
  }

  if (rawTracks.length === 0) {
    throw new Error("Spotify search returned no compatible live tracks.");
  }

  const enriched = await Promise.all(
    rawTracks.map(async (track) => {
      const [trackInfo, artistListeners] = await Promise.all([
        getLastFmTrackInfo(primaryArtistName(track.artist), track.title),
        getLastFmArtistListeners(primaryArtistName(track.artist))
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

export async function discoverTrack(
  input: Partial<DiscoveryFilters>,
  options?: { spotifyAccessToken?: string }
): Promise<DiscoveryResponse> {
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
