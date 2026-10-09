import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadCapacityObservationFeedback } from "@/lib/capacity-observation-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await loadCapacityObservationFeedback(prisma)); }
  catch (error) {
    console.error("Capacity observation feedback failed", error);
    return NextResponse.json({ error: "容量比較の計測実績を読み込めませんでした。" }, { status: 500 });
  }
}
