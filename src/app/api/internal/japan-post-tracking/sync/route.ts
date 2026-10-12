import { NextRequest } from "next/server";
import { japanPostTrackingSyncRoute } from "./_route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return japanPostTrackingSyncRoute(request);
}
