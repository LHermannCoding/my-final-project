import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  clearSpotifySession,
  getSpotifyAuthCookies,
  getSpotifySessionCookieOptions
} from "@/lib/spotify-auth";

function getAppRedirectUrl(path: string, requestUrl: string): URL {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (baseUrl) {
    return new URL(path, baseUrl);
  }

  return new URL(path, requestUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    const response = NextResponse.redirect(
      getAppRedirectUrl(`/?spotify=${encodeURIComponent(error)}`, request.url)
    );
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(VERIFIER_COOKIE);
    return response;
  }

  const auth = await getSpotifyAuthCookies();
  if (!code || !state || !auth.state || !auth.verifier || state !== auth.state) {
    await clearSpotifySession();
    return NextResponse.redirect(getAppRedirectUrl("/?spotify=invalid_state", request.url));
  }

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "";

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: auth.verifier
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
    console.error("Spotify token exchange failed", {
        status: response.status,
        body: errorBody
      });
      await clearSpotifySession();
      const redirectResponse = NextResponse.redirect(
        getAppRedirectUrl("/?spotify=token_exchange_failed", request.url)
      );
      redirectResponse.cookies.delete(STATE_COOKIE);
      redirectResponse.cookies.delete(VERIFIER_COOKIE);
      return redirectResponse;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const redirectResponse = NextResponse.redirect(
      getAppRedirectUrl("/?spotify=connected", request.url)
    );
    redirectResponse.cookies.set(
      SESSION_COOKIE,
      JSON.stringify({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000
      }),
      getSpotifySessionCookieOptions()
    );
    redirectResponse.cookies.delete(STATE_COOKIE);
    redirectResponse.cookies.delete(VERIFIER_COOKIE);

    return redirectResponse;
  } catch (error) {
    console.error("Spotify callback failed", error);
    await clearSpotifySession();
    const response = NextResponse.redirect(
      getAppRedirectUrl("/?spotify=callback_failed", request.url)
    );
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(VERIFIER_COOKIE);
    return response;
  }
}
