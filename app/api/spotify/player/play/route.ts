import { NextRequest, NextResponse } from "next/server";

import { getSpotifySession } from "@/lib/spotify-auth";

export async function POST(request: NextRequest) {
  const session = await getSpotifySession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Spotify session not connected." }, { status: 401 });
  }

  const body = (await request.json()) as {
    deviceId?: string;
    spotifyUri?: string;
  };

  if (!body.deviceId || !body.spotifyUri) {
    return NextResponse.json(
      { error: "Missing deviceId or spotifyUri." },
      { status: 400 }
    );
  }

  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(body.deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uris: [body.spotifyUri]
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: "Spotify play failed.", details: errorBody },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true });
}
