import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRepairWorkTimePreviewRequest } from "@/lib/repair-work-time-preview-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const repairId = Number((await params).id);
  if (!/^\d+$/.test((await params).id) || !Number.isSafeInteger(repairId) || repairId <= 0)
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
