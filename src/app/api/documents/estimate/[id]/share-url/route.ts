import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { issueEstimateShareUrl, parseEstimateDocumentId, EstimateShareNotFoundError, EstimateShareUnavailableError } from "@/lib/estimate-share-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const rawId = (await params).id;
  const documentId = parseEstimateDocumentId(rawId);
  if (documentId === null) {
    return NextResponse.json({ success: false, error: "見積書IDが不正です。" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await issueEstimateShareUrl(prisma, documentId, request.url);
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof EstimateShareNotFoundError ? 404 :
      error instanceof EstimateShareUnavailableError ||
      (error && typeof error === "object" && "code" in error && error.code === "P2034") ? 409 : 500;
    const message = error instanceof EstimateShareNotFoundError || error instanceof EstimateShareUnavailableError
      ? error.message : status === 409 ? "見積書の状態が変更されました。再試行してください。" : "共有URLの発行に失敗しました。";
    if (status === 500) console.error("Estimate share URL issue failed");
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
