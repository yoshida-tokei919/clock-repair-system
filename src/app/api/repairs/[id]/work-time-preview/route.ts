import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRepairWorkTimePreview } from "@/lib/repair-work-time-preview";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getServerSession(authOptions))?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repairId = Number((await params).id);
  if (!/^\d+$/.test((await params).id) || !Number.isSafeInteger(repairId) || repairId <= 0)
    return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
  try {
    const preview = await getRepairWorkTimePreview(prisma, repairId);
    if (!preview) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && error.message === "SchedulerSetting is missing.")
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Repair work-time preview failed", error);
    return NextResponse.json({ error: "Repair work-time preview failed" }, { status: 500 });
  }
}
