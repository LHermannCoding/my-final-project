import { NextRequest, NextResponse } from "next/server";

import {
  clearSpotifyAuthCookies,
  clearSpotifySession,
  getSpotifyAuthCookies,
  setSpotifySession
} from "@/lib/spotify-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?spotify=${encodeURIComponent(error)}`, request.url));
  }

  const auth = await getSpotifyAuthCookies();
  if (!code || !state || !auth.state || !auth.verifier || state !== auth.state) {
    await clearSpotifySession();
    return NextResponse.redirect(new URL("/?spotify=invalid_state", request.url));
  }

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? "",
        client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
        code_verifier: auth.verifier
      })
    });

    if (!response.ok) {
      await clearSpotifySession();
      return NextResponse.redirect(new URL("/?spotify=token_exchange_failed", request.url));
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await setSpotifySession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000
    });
    await clearSpotifyAuthCookies();

    return NextResponse.redirect(new URL("/?spotify=connected", request.url));
  } catch {
    await clearSpotifySession();
    return NextResponse.redirect(new URL("/?spotify=callback_failed", request.url));
  }
}
