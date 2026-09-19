import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInquiryAiContext } from "@/lib/inquiry-ai-context";
import { getInquiryFileSignedReadUrl } from "@/lib/r2-inquiry-files";
import { isN8nAuthorized } from "../../slack-notifications/_auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) {
    return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  }
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!/^[1-9]\d*$/.test(params.id)) {
    return NextResponse.json({ ok: false, error: "Inquiry not found" }, { status: 404 });
  }
  const inquiryId = Number(params.id);
  if (!Number.isSafeInteger(inquiryId)) {
    return NextResponse.json({ ok: false, error: "Inquiry not found" }, { status: 404 });
  }
  const inquiry = await getInquiryAiContext(prisma, inquiryId, getInquiryFileSignedReadUrl);
  if (!inquiry) return NextResponse.json({ ok: false, error: "Inquiry not found" }, { status: 404 });
  return NextResponse.json({ ok: true, inquiry });
}
