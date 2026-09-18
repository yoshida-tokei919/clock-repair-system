import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleLineInquiryImage } from "@/lib/line-inquiry-image";
import {
  claimLineWebhookInboxBatch,
  processLineWebhookInboxItem,
} from "@/lib/line-inquiry-processor";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const token = process.env.N8N_INTERNAL_TOKEN;
  if (!token) return null;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(request: NextRequest) {
  const authorized = isAuthorized(request);
  if (authorized === null) {
    return NextResponse.json(
      { ok: false, error: "N8N internal token is not configured" },
      { status: 503 },
    );
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const claimedIds = await claimLineWebhookInboxBatch(prisma, { take: 20 });

  let processed = 0;
  let skipped = 0;
  const failed: Array<{ id: number; error: string }> = [];

  for (const inboxId of claimedIds) {
    try {
      const result = await processLineWebhookInboxItem(prisma, inboxId, {
        handleImage: (input) => handleLineInquiryImage(prisma, input),
      });
      if (result === "processed") processed += 1;
      else skipped += 1;
    } catch (error: unknown) {
      failed.push({
        id: inboxId,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    scanned: claimedIds.length,
    processed,
    skipped,
    failed,
  });
}
