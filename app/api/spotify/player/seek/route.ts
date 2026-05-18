import { NextRequest, NextResponse } from "next/server";

import { getSpotifySession } from "@/lib/spotify-auth";

export async function POST(request: NextRequest) {
  const session = await getSpotifySession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Spotify session not connected." }, { status: 401 });
  }

  const body = (await request.json()) as {
    deviceId?: string;
    positionMs?: number;
  };

  if (!body.deviceId || typeof body.positionMs !== "number" || !Number.isFinite(body.positionMs)) {
    return NextResponse.json(
      { error: "Missing deviceId or positionMs." },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    position_ms: String(Math.max(0, Math.round(body.positionMs))),
    device_id: body.deviceId
  });

  const response = await fetch(`https://api.spotify.com/v1/me/player/seek?${params.toString()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: "Spotify seek failed.", details: errorBody },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}
