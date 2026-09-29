import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadActivityReservationFeedback } from "@/lib/activity-reservation-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await loadActivityReservationFeedback(prisma)); }
  catch (error) {
    console.error("Activity reservation feedback failed", error);
    return NextResponse.json({ error: "共通業務の実績を読み込めませんでした。" }, { status: 500 });
  }
}
