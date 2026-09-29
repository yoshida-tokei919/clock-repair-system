import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCapacityObservationFeedback } from "@/lib/capacity-observation-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try { return NextResponse.json(await loadCapacityObservationFeedback(prisma)); }
  catch (error) {
    console.error("Capacity observation feedback failed", error);
    return NextResponse.json({ error: "容量比較の計測実績を読み込めませんでした。" }, { status: 500 });
  }
}
