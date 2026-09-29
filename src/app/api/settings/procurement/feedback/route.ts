import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProcurementLeadTimeFeedback } from "@/lib/procurement-lead-time-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getServerSession(authOptions))?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await loadProcurementLeadTimeFeedback(prisma)); }
  catch (error) {
    console.error("Procurement lead-time feedback failed", error);
    return NextResponse.json({ error: "調達リードタイム実績を読み込めませんでした。" }, { status: 500 });
  }
}
