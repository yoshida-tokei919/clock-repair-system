import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadProcurementLeadTimeFeedback } from "@/lib/procurement-lead-time-feedback";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json(await loadProcurementLeadTimeFeedback(prisma)); }
  catch (error) {
    console.error("Procurement lead-time feedback failed", error);
    return NextResponse.json({ error: "調達リードタイム実績を読み込めませんでした。" }, { status: 500 });
  }
}
