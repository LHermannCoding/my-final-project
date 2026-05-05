import { NextRequest, NextResponse } from "next/server";

import { discoverTrack } from "@/lib/discovery-engine";
import { getSpotifySession } from "@/lib/spotify-auth";
import { DiscoveryFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<DiscoveryFilters>;
  const spotifySession = await getSpotifySession();
  const result = await discoverTrack(body, {
    spotifyAccessToken: spotifySession?.accessToken
  });
  return NextResponse.json(result);
}
