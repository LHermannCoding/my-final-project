import { NextRequest, NextResponse } from "next/server";

import { discoverTrack } from "@/lib/discovery-engine";
import { DiscoveryFilters } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<DiscoveryFilters>;
  const result = await discoverTrack(body);
  return NextResponse.json(result);
}
