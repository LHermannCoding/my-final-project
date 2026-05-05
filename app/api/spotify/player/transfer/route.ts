import { NextRequest, NextResponse } from "next/server";

import { getSpotifySession } from "@/lib/spotify-auth";

export async function POST(request: NextRequest) {
  const session = await getSpotifySession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Spotify session not connected." }, { status: 401 });
  }

  const body = (await request.json()) as { deviceId?: string };
  if (!body.deviceId) {
    return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
  }

  const response = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_ids: [body.deviceId],
      play: false
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: "Spotify transfer failed.", details: errorBody },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}
