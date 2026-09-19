import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markSlackNotificationFailed } from "@/lib/slack-notification-outbox";
import { isN8nAuthorized } from "../../_auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const body = await request.json().catch(() => null);
  if (!Number.isInteger(id) || id < 1 || typeof body?.claimToken !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid acknowledgement" }, { status: 400 });
  }
  const acknowledged = await markSlackNotificationFailed(prisma, {
    id,
    claimToken: body.claimToken,
    error: typeof body?.error === "string" ? body.error : "Slack delivery failed",
  });
  return NextResponse.json({ ok: acknowledged }, { status: acknowledged ? 200 : 409 });
}
