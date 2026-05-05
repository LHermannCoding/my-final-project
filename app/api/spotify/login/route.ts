import { NextResponse } from "next/server";

import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  createCodeChallenge,
  createRandomString,
  getSpotifyAuthCookieOptions
} from "@/lib/spotify-auth";

export async function GET() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_REDIRECT_URI) {
    return NextResponse.json(
      { error: "Spotify OAuth is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI." },
      { status: 500 }
    );
  }

  const state = createRandomString();
  const verifier = createRandomString(48);
  const challenge = createCodeChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "streaming user-read-email user-read-private user-modify-playback-state",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
  const cookieOptions = getSpotifyAuthCookieOptions();
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}
