import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const repairId = Number(params.id);
  if (!Number.isInteger(repairId)) {
    return NextResponse.json({ error: "修理IDが不正です。" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";

  if (!messageBody) {
    return NextResponse.json({ error: "コメントを入力してください。" }, { status: 400 });
  }

  const repair = await prisma.repair.findUnique({
    where: { id: repairId },
    select: { id: true },
  });

  if (!repair) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  const [message] = await prisma.$queryRaw<
    { id: number; body: string; createdAt: Date }[]
  >`
    INSERT INTO "RepairCustomerMessage" ("repairId", "body")
    VALUES (${repairId}, ${messageBody})
    RETURNING "id", "body", "createdAt"
  `;

  return NextResponse.json({ success: true, message });
}
