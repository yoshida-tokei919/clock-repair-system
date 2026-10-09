import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import { queueEstimateLineSend, EstimateLineNotFoundError, EstimateLineUnavailableError } from "@/lib/estimate-line-send";
import { LineManagerSendOutboxError } from "@/lib/line-manager-send-outbox";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const documentId = Number((await params).id);
  if (!Number.isSafeInteger(documentId) || documentId <= 0) {
    return NextResponse.json({ success: false, error: "見積書IDが不正です。" }, { status: 400 });
  }
  try {
    return NextResponse.json({ success: true, queued: true, ...await queueEstimateLineSend(prisma, documentId, request.url) });
  } catch (error) {
    if (error instanceof EstimateLineNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof EstimateLineUnavailableError || error instanceof LineManagerSendOutboxError ||
        (error && typeof error === "object" && "code" in error && error.code === "P2034")) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "見積書の状態が変更されました。" }, { status: 409 });
    }
    console.error("LINE estimate queue failed", error);
    return NextResponse.json({ success: false, error: "LINE送信の受付に失敗しました。" }, { status: 500 });
  }
}
