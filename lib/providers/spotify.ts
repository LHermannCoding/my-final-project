import { cookies } from "next/headers";

import { SpotifySession, TrackCandidate } from "@/lib/types";

type SpotifySearchTrack = {
  id: string;
  name: string;
  uri: string;
  external_urls?: { spotify?: string };
  album?: {
    name?: string;
    release_date?: string;
    images?: Array<{ url: string }>;
  };
  artists?: Array<{ name: string }>;
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
      body: new URLSearchParams({ grant_type: "client_credentials" })
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
  accessToken: string
): Promise<TrackCandidate[]> {
  const params = new URLSearchParams({
    q: query || "genre:indie",
    type: "track",
    limit: "12",
    market: "US"
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    tracks?: { items?: SpotifySearchTrack[] };
  };

  return (data.tracks?.items ?? []).map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: track.album?.name || "Unknown album",
    albumArtUrl: track.album?.images?.[0]?.url || "",
    releaseDate: track.album?.release_date,
    spotifyUri: track.uri,
    externalUrl: track.external_urls?.spotify,
    source: "spotify"
  }));
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
