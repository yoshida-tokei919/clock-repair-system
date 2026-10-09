import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadDeadlineFeedbackReadiness } from "@/lib/deadline-feedback-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await loadDeadlineFeedbackReadiness(prisma)); }
  catch (error) {
    console.error("Deadline feedback readiness failed", error);
    return NextResponse.json({ error: "納期フィードバックのデータ状況を読み込めませんでした。" }, { status: 500 });
  }
}
