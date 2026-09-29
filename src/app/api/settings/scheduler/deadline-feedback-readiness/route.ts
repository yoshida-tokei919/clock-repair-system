import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadDeadlineFeedbackReadiness } from "@/lib/deadline-feedback-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try { return NextResponse.json(await loadDeadlineFeedbackReadiness(prisma)); }
  catch (error) {
    console.error("Deadline feedback readiness failed", error);
    return NextResponse.json({ error: "納期フィードバックのデータ状況を読み込めませんでした。" }, { status: 500 });
  }
}
