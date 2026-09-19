import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  InquiryAiAnalysisIdempotencyConflictError,
  InquiryAiAnalysisInputError,
  InquiryAiAnalysisNotFoundError,
  InquiryAiAnalysisStaleError,
  saveInquiryAiAnalysis,
} from "@/lib/inquiry-ai-analysis";
import { isN8nAuthorized } from "../../../slack-notifications/_auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!/^[1-9]\d*$/.test(params.id)) return NextResponse.json({ ok: false, error: "Inquiry not found" }, { status: 404 });
  const inquiryId = Number(params.id);
  if (!Number.isSafeInteger(inquiryId)) return NextResponse.json({ ok: false, error: "Inquiry not found" }, { status: 404 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await saveInquiryAiAnalysis(prisma, inquiryId, payload);
    return NextResponse.json({ ok: true, analysis: result.analysis, deduplicated: result.deduplicated });
  } catch (error) {
    if (error instanceof InquiryAiAnalysisInputError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (error instanceof InquiryAiAnalysisStaleError) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    if (error instanceof InquiryAiAnalysisIdempotencyConflictError) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    if (error instanceof InquiryAiAnalysisNotFoundError) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    throw error;
  }
}
