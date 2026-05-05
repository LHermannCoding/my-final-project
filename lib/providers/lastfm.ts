type LastFmTrackInfo = {
  playCount?: number;
  listeners?: number;
};

export type LastFmGenreSeedTrack = {
  title: string;
  artist: string;
};

export type LastFmGenreSeedPage = {
  tracks: LastFmGenreSeedTrack[];
  totalPages: number;
};

function hasLastFmConfig(): boolean {
  return Boolean(process.env.LASTFM_API_KEY);
}

export async function getLastFmTrackInfo(
  artist: string,
  track: string
): Promise<LastFmTrackInfo | null> {
  if (!hasLastFmConfig()) {
    return null;
  }

  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: process.env.LASTFM_API_KEY!,
    artist,
    track,
    format: "json"
  });

  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      track?: { playcount?: string; listeners?: string };
    };

    return {
      playCount: data.track?.playcount ? Number(data.track.playcount) : undefined,
      listeners: data.track?.listeners ? Number(data.track.listeners) : undefined
    };
  } catch {
    return null;
  }
}

export async function getLastFmArtistListeners(artist: string): Promise<number | undefined> {
  if (!hasLastFmConfig()) {
    return undefined;
  }

  const params = new URLSearchParams({
    method: "artist.getInfo",
    api_key: process.env.LASTFM_API_KEY!,
    artist,
    format: "json"
  });

  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as {
      artist?: { stats?: { listeners?: string } };
    };

    return data.artist?.stats?.listeners ? Number(data.artist.stats.listeners) : undefined;
  } catch {
    return undefined;
  }
}

export async function getLastFmTopTracksForTag(
  tag: string,
  limit = 16,
  page = 1
): Promise<LastFmGenreSeedPage> {
  if (!hasLastFmConfig() || !tag.trim()) {
    return { tracks: [], totalPages: 0 };
  }

  const params = new URLSearchParams({
    method: "tag.getTopTracks",
    api_key: process.env.LASTFM_API_KEY!,
    tag,
    limit: String(limit),
    page: String(page),
    format: "json"
  });

  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return { tracks: [], totalPages: 0 };
    }

    const data = (await response.json()) as {
      tracks?: {
        "@attr"?: { totalPages?: string };
        track?: Array<{
          name?: string;
          artist?: { name?: string };
        }>;
      };
      error?: number;
    };

    if (data.error) {
      return { tracks: [], totalPages: 0 };
    }

    return {
      tracks: (data.tracks?.track ?? [])
        .map((track) => ({
          title: track.name?.trim() ?? "",
          artist: track.artist?.name?.trim() ?? ""
        }))
        .filter((track) => track.title && track.artist),
      totalPages: data.tracks?.["@attr"]?.totalPages
        ? Number(data.tracks["@attr"].totalPages)
        : 0
    };
  } catch {
    return { tracks: [], totalPages: 0 };
  }
}
