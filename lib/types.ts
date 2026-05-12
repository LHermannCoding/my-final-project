export type RangeValue = {
  min?: number;
  max?: number;
};

export type DiscoveryFilters = {
  genre: string;
  trackPlayCount: RangeValue;
  artistListeners: RangeValue;
  bpm: RangeValue;
  strictness: "exact" | "balanced" | "adventurous";
};

export type DiscoverySelectionStrategy = "queued";

export type TrackSource = "mock" | "spotify";

export type TrackCandidate = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  releaseDate?: string;
  genreHint?: string;
  spotifyUri?: string;
  previewUrl?: string;
  externalUrl?: string;
  playCount?: number;
  artistListeners?: number;
  bpm?: number;
  source: TrackSource;
};

export type DiscoveryResponse = {
  track: TrackCandidate;
  resolvedGenre?: string;
  mode: "live";
  diagnostics: string[];
  selection: {
    strategy: DiscoverySelectionStrategy;
    candidateCount: number;
    exactCandidateCount: number;
    sampledFromTop: number;
  };
  queue: DiscoveryQueueSnapshot;
};

export type DiscoveryQueueSnapshot = {
  key: string;
  queueSize: number;
  targetSize: number;
  isFilling: boolean;
  isWaitingForTrack: boolean;
  lastError?: string;
};

export type DiscoveryStatusResponse = {
  configured: boolean;
  resolvedGenre?: string;
  diagnostics: string[];
  queue: DiscoveryQueueSnapshot;
};

export type SpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};
