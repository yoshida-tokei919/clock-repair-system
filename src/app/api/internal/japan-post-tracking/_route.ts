import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollJapanPostShipments } from "@/lib/japan-post-tracking";
import { isN8nAuthorized } from "../slack-notifications/_auth";

export async function japanPostTrackingRoute(
  request: NextRequest, poll: typeof pollJapanPostShipments = pollJapanPostShipments,
) {
  const headers = { "Cache-Control": "no-store" };
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    return NextResponse.json({ results: await poll(prisma) }, { headers });
  } catch {
    console.error("Japan Post tracking poll failed");
    return NextResponse.json({ error: "poll_failed" }, { status: 500, headers });
  }
}
