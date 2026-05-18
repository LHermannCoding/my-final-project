import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/spotify-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
