import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimLineManagerSenderWork } from "@/lib/line-manager-sender-internal";
import { isN8nAuthorized } from "../../slack-notifications/_auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, item: await claimLineManagerSenderWork(prisma) });
}
