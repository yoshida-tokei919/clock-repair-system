import { NextRequest, NextResponse } from "next/server";
import { processVerifiedLineWebhook } from "@/lib/line-webhook";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Read the unmodified body before parsing: LINE signs these exact bytes.
  const rawBody = await request.text();
  const result = await processVerifiedLineWebhook({
    rawBody,
    signature: request.headers.get("x-line-signature"),
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    db: prisma,
  });

  if (result.status === 503) {
    return NextResponse.json({ ok: false, error: "LINE webhook is not configured" }, { status: 503 });
  }
  if (result.status === 401) {
    return NextResponse.json({ ok: false, error: "Invalid LINE signature" }, { status: 401 });
  }
  if (result.status === 400) {
    return NextResponse.json({ ok: false, error: "Invalid LINE webhook payload" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
