import crypto from "node:crypto";

import { cookies } from "next/headers";

import { SpotifySession } from "@/lib/types";

const SESSION_COOKIE = "spotify_session";
const STATE_COOKIE = "spotify_auth_state";
const VERIFIER_COOKIE = "spotify_code_verifier";

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createRandomString(size = 32): string {
  return base64Url(crypto.randomBytes(size));
}

export function createCodeChallenge(verifier: string): string {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

export async function setSpotifyAuthCookies(state: string, verifier: string) {
  const cookieStore = await cookies();

  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });

  cookieStore.set(VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
}

export async function getSpotifyAuthCookies() {
  const cookieStore = await cookies();

  return {
    state: cookieStore.get(STATE_COOKIE)?.value,
    verifier: cookieStore.get(VERIFIER_COOKIE)?.value
  };
}

export async function clearSpotifyAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);
}

export async function setSpotifySession(session: SpotifySession) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function getSpotifySession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SpotifySession;
  } catch {
    return null;
  }
}

export async function clearSpotifySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
