import { NextResponse } from "next/server";

import { getSpotifySession } from "@/lib/spotify-auth";

export async function GET() {
  const session = await getSpotifySession();
  return NextResponse.json({
    configured: Boolean(
      process.env.SPOTIFY_CLIENT_ID &&
        process.env.SPOTIFY_CLIENT_SECRET &&
        process.env.SPOTIFY_REDIRECT_URI
    ),
    connected: Boolean(session?.accessToken),
    accessToken: session?.accessToken ?? null,
    expiresAt: session?.expiresAt ?? null
  });
}
