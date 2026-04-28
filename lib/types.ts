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

export type DiscoverySelectionStrategy = "exact" | "relaxed" | "fallback";

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
  mode: "mock" | "live";
  diagnostics: string[];
  selection: {
    strategy: DiscoverySelectionStrategy;
    candidateCount: number;
    exactCandidateCount: number;
    sampledFromTop: number;
  };
};

export type SpotifySession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};
