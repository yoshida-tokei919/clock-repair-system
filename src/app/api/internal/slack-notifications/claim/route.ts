import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimSlackNotificationBatch } from "@/lib/slack-notification-outbox";
import { isN8nAuthorized } from "../_auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let take: number | undefined;
  try {
    const body = await request.json();
    if (typeof body?.take === "number" && Number.isInteger(body.take)) take = body.take;
  } catch {
    // An empty request body uses the safe default batch size.
  }
  const notifications = await claimSlackNotificationBatch(prisma, { take });
  return NextResponse.json({ ok: true, notifications });
}
