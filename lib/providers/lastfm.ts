type LastFmTrackInfo = {
  playCount?: number;
  listeners?: number;
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
      next: { revalidate: 3600 }
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
      next: { revalidate: 3600 }
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
