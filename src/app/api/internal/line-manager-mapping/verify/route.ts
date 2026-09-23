import { NextRequest, NextResponse } from "next/server";
import { isN8nAuthorized } from "../../slack-notifications/_auth";
import { prisma } from "@/lib/prisma";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { LineManagerMappingInputError, verifyLineManagerMapping } from "@/lib/line-manager-mapping-internal";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid mapping verification request" }, { status: 400 });
  }
  try {
    const item = await verifyLineManagerMapping(prisma, body);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof LineManagerMappingInputError) return NextResponse.json({ ok: false, error: "Invalid mapping verification request" }, { status: 400 });
    if (error instanceof LineManagerSendOutboxError) return NextResponse.json({ ok: false, error: "Mapping evidence conflict" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Mapping verification failed" }, { status: 500 });
  }
}
