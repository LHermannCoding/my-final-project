import { KNOWN_GENRES, resolveGenreInput } from "@/lib/providers/genre";
import {
  getLastFmArtistListeners,
  getLastFmTopTracksForTag,
  getLastFmTrackInfo
} from "@/lib/providers/lastfm";
import {
  findSpotifyTrack,
  getSpotifyAppToken,
  searchSpotifyTracksByGenre
} from "@/lib/providers/spotify";
import {
  DiscoveryFilters,
  DiscoveryQueueSnapshot,
  DiscoveryResponse,
  DiscoveryStatusResponse,
  TrackCandidate
} from "@/lib/types";
import { inRange, sanitizeFilters } from "@/lib/utils";

const TARGET_QUEUE_SIZE = 4;
const MAX_QUEUE_SIZE = 8;
const FILL_INTERVAL_MS = 2500;
const WAIT_FOR_TRACK_MS = 45000;
const POLL_WAIT_MS = 800;
const LASTFM_PAGE_LIMIT = 30;
const SEED_ATTEMPTS_PER_FILL = 10;
const SPOTIFY_GENRE_ATTEMPTS_PER_FILL = 4;

type QueueState = {
  key: string;
  filters: DiscoveryFilters;
  resolvedGenre?: string;
  diagnostics: string[];
  tracks: TrackCandidate[];
  seenTrackIds: Set<string>;
  fillPromise: Promise<void> | null;
  lastFillStartedAt: number;
  lastTouchedAt: number;
  lastError?: string;
};

type DiscoverySession = {
  key: string;
  filters: DiscoveryFilters;
  resolvedGenre?: string;
  diagnostics: string[];
  queue: QueueState;
};

type DiscoveryOptions = {
  spotifyAccessToken?: string;
};

type DiscoveryEngineGlobal = typeof globalThis & {
  __audioObscuraQueues__?: Map<string, QueueState>;
  __audioObscuraLastFmPages__?: Map<string, number>;
};

function hasLiveProviders(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.LASTFM_API_KEY
  );
}

function getQueueStore(): Map<string, QueueState> {
  const scope = globalThis as DiscoveryEngineGlobal;
  scope.__audioObscuraQueues__ ??= new Map<string, QueueState>();
  return scope.__audioObscuraQueues__;
}

function getLastFmPageCache(): Map<string, number> {
  const scope = globalThis as DiscoveryEngineGlobal;
  scope.__audioObscuraLastFmPages__ ??= new Map<string, number>();
  return scope.__audioObscuraLastFmPages__;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRange(range: DiscoveryFilters["trackPlayCount"]): boolean {
  return typeof range.min === "number" || typeof range.max === "number";
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sampleRandomItems<T>(items: T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, Math.min(count, pool.length));
}

function primaryArtistName(value: string): string {
  return value
    .split(",")[0]
    .replace(/\s+feat\..*$/i, "")
    .replace(/\s+ft\..*$/i, "")
    .trim();
}

function sanitizeForMatching(input: Partial<DiscoveryFilters>): DiscoveryFilters {
  const filters = sanitizeFilters(input);

  if (hasRange(filters.bpm)) {
    filters.bpm = {};
  }

  return filters;
}

function buildQueueKey(filters: DiscoveryFilters): string {
  return JSON.stringify({
    genre: filters.genre,
    trackPlayCount: filters.trackPlayCount,
    artistListeners: filters.artistListeners,
    bpm: filters.bpm
  });
}

function createQueueSnapshot(
  queue: QueueState,
  isWaitingForTrack: boolean
): DiscoveryQueueSnapshot {
  return {
    key: queue.key,
    queueSize: queue.tracks.length,
    targetSize: TARGET_QUEUE_SIZE,
    isFilling: Boolean(queue.fillPromise),
    isWaitingForTrack,
    lastError: queue.lastError
  };
}

function trackMatchesFilters(track: TrackCandidate, filters: DiscoveryFilters): boolean {
  if (filters.genre) {
    const hint = track.genreHint?.toLowerCase() ?? "";
    if (!hint.includes(filters.genre.toLowerCase())) {
      return false;
    }
  }

  if (hasRange(filters.trackPlayCount) && !inRange(track.playCount, filters.trackPlayCount)) {
    return false;
  }

  if (hasRange(filters.artistListeners) && !inRange(track.artistListeners, filters.artistListeners)) {
    return false;
  }

  return true;
}

async function getTagTotalPages(tag: string): Promise<number> {
  const cache = getLastFmPageCache();
  const cached = cache.get(tag);
  if (cached) {
    return cached;
  }

  const seedPage = await getLastFmTopTracksForTag(tag, 1, 1);
  const totalPages = Math.max(seedPage.totalPages || 1, 1);
  cache.set(tag, totalPages);
  return totalPages;
}

async function getRandomLastFmSeeds(tag: string) {
  const totalPages = await getTagTotalPages(tag);
  const cappedPages = Math.max(1, Math.min(totalPages, 250));
  const page = randomInt(1, cappedPages);
  return getLastFmTopTracksForTag(tag, LASTFM_PAGE_LIMIT, page);
}

async function enrichSpotifyTrack(
  track: TrackCandidate,
  filters: DiscoveryFilters,
  resolvedGenre?: string
): Promise<TrackCandidate | null> {
  const artist = primaryArtistName(track.artist);
  const trackInfo = await getLastFmTrackInfo(artist, track.title);

  const enrichedTrack: TrackCandidate = {
    ...track,
    genreHint: resolvedGenre || filters.genre || track.genreHint,
    playCount: trackInfo?.playCount
  };

  if (hasRange(filters.trackPlayCount) && !inRange(enrichedTrack.playCount, filters.trackPlayCount)) {
    return null;
  }

  const needsArtistListeners = hasRange(filters.artistListeners) || typeof enrichedTrack.artistListeners !== "number";
  if (needsArtistListeners) {
    enrichedTrack.artistListeners =
      (await getLastFmArtistListeners(artist)) ?? trackInfo?.listeners;
  }

  if (!trackMatchesFilters(enrichedTrack, filters)) {
    return null;
  }

  return enrichedTrack;
}

async function findMatchFromLastFmSeeds(
  tag: string,
  token: string,
  filters: DiscoveryFilters,
  resolvedGenre?: string
): Promise<TrackCandidate | null> {
  const seedPage = await getRandomLastFmSeeds(tag);
  const seeds = sampleRandomItems(seedPage.tracks, SEED_ATTEMPTS_PER_FILL);

  for (const seed of seeds) {
    const spotifyTrack = await findSpotifyTrack(seed.title, seed.artist, token);
    if (!spotifyTrack) {
      continue;
    }

    const enriched = await enrichSpotifyTrack(spotifyTrack, filters, resolvedGenre);
    if (enriched) {
      return enriched;
    }
  }

  return null;
}

async function findMatchFromSpotifyGenreSearch(
  tag: string,
  token: string,
  filters: DiscoveryFilters,
  resolvedGenre?: string
): Promise<TrackCandidate | null> {
  const offsets = sampleRandomItems(
    [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950],
    SPOTIFY_GENRE_ATTEMPTS_PER_FILL
  );

  for (const offset of offsets) {
    const tracks = await searchSpotifyTracksByGenre(tag, token, [offset]);
    const sampled = sampleRandomItems(tracks, 3);

    for (const track of sampled) {
      const enriched = await enrichSpotifyTrack(track, filters, resolvedGenre);
      if (enriched) {
        return enriched;
      }
    }
  }

  return null;
}

async function findNextMatchingTrack(
  filters: DiscoveryFilters,
  resolvedGenre: string | undefined,
  token: string
): Promise<TrackCandidate | null> {
  const tag = resolvedGenre || sampleRandomItems(KNOWN_GENRES, 1)[0];

  const lastFmMatch = await findMatchFromLastFmSeeds(tag, token, filters, resolvedGenre || tag);
  if (lastFmMatch) {
    return lastFmMatch;
  }

  return findMatchFromSpotifyGenreSearch(tag, token, filters, resolvedGenre || tag);
}

async function fillQueue(queue: QueueState, options?: DiscoveryOptions): Promise<void> {
  if (queue.fillPromise) {
    return queue.fillPromise;
  }

  queue.fillPromise = (async () => {
    queue.lastFillStartedAt = Date.now();
    queue.lastTouchedAt = queue.lastFillStartedAt;
    queue.lastError = undefined;

    const spotifyToken = await getSpotifyAppToken();
    const token = spotifyToken ?? options?.spotifyAccessToken;

    if (!token) {
      queue.lastError = "Spotify app credentials are unavailable.";
      return;
    }

    const nextTrack = await findNextMatchingTrack(queue.filters, queue.resolvedGenre, token);
    if (!nextTrack) {
      queue.lastError = queue.filters.genre
        ? `Still searching for an exact match inside "${queue.filters.genre}".`
        : "Still searching for an exact random match.";
      return;
    }

    if (queue.seenTrackIds.has(nextTrack.id) || queue.tracks.some((track) => track.id === nextTrack.id)) {
      queue.lastError = "Skipped a duplicate match while keeping the queue fresh.";
      return;
    }

    queue.seenTrackIds.add(nextTrack.id);
    queue.tracks.push(nextTrack);
    if (queue.tracks.length > MAX_QUEUE_SIZE) {
      queue.tracks.splice(MAX_QUEUE_SIZE);
    }
  })()
    .catch((error) => {
      queue.lastError = error instanceof Error ? error.message : "Queue fill failed.";
    })
    .finally(() => {
      queue.lastTouchedAt = Date.now();
      queue.fillPromise = null;
    });

  return queue.fillPromise;
}

function pruneQueues() {
  const now = Date.now();
  for (const [key, queue] of getQueueStore()) {
    if (now - queue.lastTouchedAt > 1000 * 60 * 20) {
      getQueueStore().delete(key);
    }
  }
}

function shouldFillQueue(queue: QueueState): boolean {
  return (
    queue.tracks.length < TARGET_QUEUE_SIZE &&
    !queue.fillPromise &&
    Date.now() - queue.lastFillStartedAt >= FILL_INTERVAL_MS
  );
}

async function prepareDiscoverySession(input: Partial<DiscoveryFilters>): Promise<DiscoverySession> {
  const diagnostics: string[] = [];
  const sanitized = sanitizeForMatching(input);
  const genreResolution = await resolveGenreInput(sanitized.genre);
  const resolvedGenre = genreResolution.resolvedGenre?.trim();
  diagnostics.push(...genreResolution.diagnostics);

  if (hasRange(input.bpm ?? {})) {
    diagnostics.push("BPM filtering is currently skipped because the live queue has no dependable BPM source.");
  }

  const filters: DiscoveryFilters = {
    ...sanitized,
    genre: resolvedGenre || sanitized.genre
  };

  const key = buildQueueKey(filters);
  const store = getQueueStore();
  let queue = store.get(key);

  if (!queue) {
    queue = {
      key,
      filters,
      resolvedGenre,
      diagnostics: [],
      tracks: [],
      seenTrackIds: new Set<string>(),
      fillPromise: null,
      lastFillStartedAt: 0,
      lastTouchedAt: Date.now()
    };
    store.set(key, queue);
  } else {
    queue.filters = filters;
    queue.resolvedGenre = resolvedGenre;
    queue.lastTouchedAt = Date.now();
  }

  queue.diagnostics = diagnostics;
  pruneQueues();

  return {
    key,
    filters,
    resolvedGenre,
    diagnostics,
    queue
  };
}

async function ensureQueueWarm(
  queue: QueueState,
  options?: DiscoveryOptions
): Promise<void> {
  if (shouldFillQueue(queue)) {
    await fillQueue(queue, options);
  }
}

export async function getDiscoveryStatus(
  input: Partial<DiscoveryFilters>,
  options?: DiscoveryOptions
): Promise<DiscoveryStatusResponse> {
  const session = await prepareDiscoverySession(input);

  if (!hasLiveProviders()) {
    return {
      configured: false,
      resolvedGenre: session.resolvedGenre,
      diagnostics: [
        ...session.diagnostics,
        "Live providers are not fully configured. Set Spotify and Last.fm credentials to use discovery."
      ],
      queue: createQueueSnapshot(session.queue, false)
    };
  }

  void ensureQueueWarm(session.queue, options);

  return {
    configured: true,
    resolvedGenre: session.resolvedGenre,
    diagnostics: session.queue.lastError
      ? [...session.diagnostics, session.queue.lastError]
      : session.diagnostics,
    queue: createQueueSnapshot(session.queue, false)
  };
}

export async function discoverTrack(
  input: Partial<DiscoveryFilters>,
  options?: DiscoveryOptions
): Promise<DiscoveryResponse> {
  const session = await prepareDiscoverySession(input);

  if (!hasLiveProviders()) {
    throw new Error(
      "Live providers are not fully configured. Set Spotify and Last.fm credentials to use discovery."
    );
  }

  const queue = session.queue;
  queue.lastTouchedAt = Date.now();

  const deadline = Date.now() + WAIT_FOR_TRACK_MS;

  while (Date.now() < deadline) {
    const nextTrack = queue.tracks.shift();
    if (nextTrack) {
      void ensureQueueWarm(queue, options);
      return {
        track: nextTrack,
        resolvedGenre: session.resolvedGenre,
        mode: "live",
        diagnostics: session.diagnostics,
        selection: {
          strategy: "queued",
          candidateCount: queue.tracks.length + 1,
          exactCandidateCount: 1,
          sampledFromTop: 1
        },
        queue: createQueueSnapshot(queue, false)
      };
    }

    if (!queue.fillPromise && shouldFillQueue(queue)) {
      void fillQueue(queue, options);
    }

    if (queue.fillPromise) {
      await Promise.race([queue.fillPromise, sleep(POLL_WAIT_MS)]);
    } else {
      await sleep(POLL_WAIT_MS);
    }
  }

  throw new Error(queue.lastError ?? "Timed out while waiting for a matching live track.");
}
