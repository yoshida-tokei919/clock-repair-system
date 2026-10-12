import { NextRequest } from "next/server";
import { japanPostTrackingRoute } from "./_route";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return japanPostTrackingRoute(request);
}
