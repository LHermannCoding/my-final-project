import { cookies } from "next/headers";

import { SpotifySession, TrackCandidate } from "@/lib/types";

type SpotifySearchTrack = {
  id: string;
  name: string;
  uri: string;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  album?: {
    name?: string;
    release_date?: string;
    images?: Array<{ url: string }>;
  };
  artists?: Array<{ name: string }>;
};

type SpotifySearchArtist = {
  id: string;
  name: string;
};

function hasSpotifyAppConfig(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export async function getSpotifyAppToken(): Promise<string | null> {
  if (!hasSpotifyAppConfig()) {
    return null;
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function searchSpotifyTracks(
  query: string,
  accessToken: string,
  offsets: number[] = [0, 50]
): Promise<TrackCandidate[]> {
  const responses = await Promise.all(
    offsets.map(async (offset) => {
      const params = new URLSearchParams({
        q: query || "genre:indie",
        type: "track",
        limit: "50",
        offset: String(offset),
        market: "US"
      });

      const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        tracks?: { items?: SpotifySearchTrack[] };
      };

      return data.tracks?.items ?? [];
    })
  );

  const uniqueTracks = new Map<string, SpotifySearchTrack>();
  for (const track of responses.flat()) {
    uniqueTracks.set(track.id, track);
  }

  return Array.from(uniqueTracks.values()).map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: track.album?.name || "Unknown album",
    albumArtUrl: track.album?.images?.[0]?.url || "",
    releaseDate: track.album?.release_date,
    spotifyUri: track.uri,
    previewUrl: track.preview_url ?? undefined,
    externalUrl: track.external_urls?.spotify,
    source: "spotify"
  }));
}

export async function findSpotifyTrack(
  title: string,
  artist: string,
  accessToken: string
): Promise<TrackCandidate | null> {
  const params = new URLSearchParams({
    q: `track:"${title}" artist:"${artist}"`,
    type: "track",
    limit: "5",
    market: "US"
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    tracks?: { items?: SpotifySearchTrack[] };
  };

  const track = data.tracks?.items?.[0];
  if (!track) {
    return null;
  }

  return {
    id: track.id,
    title: track.name,
    artist: track.artists?.map((item) => item.name).join(", ") || "Unknown artist",
    album: track.album?.name || "Unknown album",
    albumArtUrl: track.album?.images?.[0]?.url || "",
    releaseDate: track.album?.release_date,
    spotifyUri: track.uri,
    previewUrl: track.preview_url ?? undefined,
    externalUrl: track.external_urls?.spotify,
    source: "spotify"
  };
}

export async function searchSpotifyArtistsByGenre(
  genre: string,
  accessToken: string,
  offsets: number[] = [0],
  limit = 50
): Promise<SpotifySearchArtist[]> {
  const responses = await Promise.all(
    offsets.map(async (offset) => {
      const params = new URLSearchParams({
        q: `genre:"${genre}"`,
        type: "artist",
        limit: String(limit),
        offset: String(offset),
        market: "US"
      });

      const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        artists?: { items?: SpotifySearchArtist[] };
      };

      return data.artists?.items ?? [];
    })
  );

  const uniqueArtists = new Map<string, SpotifySearchArtist>();
  for (const artist of responses.flat()) {
    uniqueArtists.set(artist.id, artist);
  }

  return Array.from(uniqueArtists.values());
}

async function getArtistTopTracks(
  artistId: string,
  accessToken: string
): Promise<TrackCandidate[]> {
  const params = new URLSearchParams({ market: "US" });
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/top-tracks?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { tracks?: SpotifySearchTrack[] };

  return (data.tracks ?? []).map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: track.album?.name || "Unknown album",
    albumArtUrl: track.album?.images?.[0]?.url || "",
    releaseDate: track.album?.release_date,
    spotifyUri: track.uri,
    previewUrl: track.preview_url ?? undefined,
    externalUrl: track.external_urls?.spotify,
    source: "spotify"
  }));
}

export async function discoverSpotifyTracksByGenre(
  genre: string,
  accessToken: string
): Promise<TrackCandidate[]> {
  const artists = await searchSpotifyArtistsByGenre(genre, accessToken);
  if (artists.length === 0) {
    return [];
  }

  const trackGroups = await Promise.all(
    artists.slice(0, 6).map((artist) => getArtistTopTracks(artist.id, accessToken))
  );

  const uniqueTracks = new Map<string, TrackCandidate>();
  for (const track of trackGroups.flat()) {
    if (!uniqueTracks.has(track.id)) {
      uniqueTracks.set(track.id, track);
    }
  }

  return Array.from(uniqueTracks.values());
}

export async function discoverSpotifyTracksFromGenreArtists(
  genre: string,
  accessToken: string
): Promise<TrackCandidate[]> {
  const artists = await searchSpotifyArtistsByGenre(genre, accessToken);
  if (artists.length === 0) {
    return [];
  }

  const trackGroups = await Promise.all(
    artists.slice(0, 10).map((artist) =>
      searchSpotifyTracks(`artist:"${artist.name}"`, accessToken)
    )
  );

  const uniqueTracks = new Map<string, TrackCandidate>();
  for (const track of trackGroups.flat()) {
    uniqueTracks.set(track.id, track);
  }

  return Array.from(uniqueTracks.values());
}

export async function searchSpotifyTracksByGenre(
  genre: string,
  accessToken: string,
  offsets?: number[]
): Promise<TrackCandidate[]> {
  return searchSpotifyTracks(`genre:"${genre}"`, accessToken, offsets);
}

export async function getSpotifySessionFromCookies(): Promise<SpotifySession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("spotify_session")?.value;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SpotifySession;
    return parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export function createSpotifyAuthUrl(state: string, verifier: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    scope: "streaming user-read-email user-read-private user-modify-playback-state",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? "",
    state,
    code_challenge_method: "S256",
    code_challenge: verifier
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
