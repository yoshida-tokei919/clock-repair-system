import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const repairId = Number(params.id);
  if (!Number.isInteger(repairId)) {
    return NextResponse.json({ error: "修理IDが不正です。" }, { status: 400 });
  }

  const count = await prisma.$executeRaw`
    UPDATE "RepairCustomerMessage"
    SET "readAt" = NOW()
    WHERE "repairId" = ${repairId}
      AND "readAt" IS NULL
  `;

  return NextResponse.json({ success: true, count });
}
