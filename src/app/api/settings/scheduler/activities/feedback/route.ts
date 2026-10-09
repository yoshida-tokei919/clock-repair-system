import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadActivityReservationFeedback } from "@/lib/activity-reservation-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await loadActivityReservationFeedback(prisma)); }
  catch (error) {
    console.error("Activity reservation feedback failed", error);
    return NextResponse.json({ error: "共通業務の実績を読み込めませんでした。" }, { status: 500 });
  }
}
