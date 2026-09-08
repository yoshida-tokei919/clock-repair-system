import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { enforceRepairPhotoPostingOptOut } from "@/lib/repair-photo-posting-opt-out";
import { findRepairIdByIdOrToken } from "../_workflow";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const repairId = await findRepairIdByIdOrToken(params.id);
  if (!repairId) return NextResponse.json({ error: "Repair not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.photoPostingOptOut !== "boolean") {
    return NextResponse.json({ error: "photoPostingOptOut must be boolean" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.repair.update({ where: { id: repairId }, data: { photoPostingOptOut: body.photoPostingOptOut } });
    await enforceRepairPhotoPostingOptOut(tx, repairId, body.photoPostingOptOut);
  });

  return NextResponse.json({ success: true, photoPostingOptOut: body.photoPostingOptOut });
}
