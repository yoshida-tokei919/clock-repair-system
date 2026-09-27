import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRepairWorkTimePreviewRequest } from "@/lib/repair-work-time-preview-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await getServerSession(authOptions))?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repairId = Number(params.id);
  if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(repairId) || repairId <= 0)
    return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid work-time preview revision." }, { status: 400 });
  }
  try {
    const result = await applyRepairWorkTimePreviewRequest(prisma, repairId, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Repair work-time preview apply failed", error);
    return NextResponse.json({ error: "Repair work-time preview apply failed" }, { status: 500 });
  }
}
