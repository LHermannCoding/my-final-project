import { NextRequest, NextResponse } from "next/server";

import { getDiscoveryStatus } from "@/lib/discovery-engine";
import { getSpotifySession } from "@/lib/spotify-auth";
import { DiscoveryFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<DiscoveryFilters>;
    const spotifySession = await getSpotifySession();
    const result = await getDiscoveryStatus(body, {
      spotifyAccessToken: spotifySession?.accessToken
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not inspect the discovery queue.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
