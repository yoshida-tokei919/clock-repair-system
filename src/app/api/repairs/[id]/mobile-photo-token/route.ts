import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { createMobileRepairPhotoToken } from "@/lib/mobile-repair-photo-token";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
  const repair = await prisma.repair.findUnique({ where: { id }, select: { id: true } });
  if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
  return NextResponse.json({ token: createMobileRepairPhotoToken(id) }, { headers: { "Cache-Control": "no-store" } });
}
