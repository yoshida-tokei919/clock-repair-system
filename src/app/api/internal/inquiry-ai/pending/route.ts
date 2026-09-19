import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listPendingInquiryAiContexts } from "@/lib/inquiry-ai-context";
import { isN8nAuthorized } from "../../slack-notifications/_auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorized = isN8nAuthorized(request);
  if (authorized === null) {
    return NextResponse.json({ ok: false, error: "N8N internal token is not configured" }, { status: 503 });
  }
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rawLimit = request.nextUrl.searchParams.get("limit");
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) {
    return NextResponse.json({ ok: false, error: "Invalid limit" }, { status: 400 });
  }
  const parsedLimit = rawLimit === null ? undefined : Number(rawLimit);
  const inquiries = await listPendingInquiryAiContexts(prisma, {
    limit: parsedLimit,
  });
  return NextResponse.json({ ok: true, inquiries });
}
