import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { findRepairIdByPublicToken } from "../_workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const repairId = await findRepairIdByPublicToken((await params).id);

  const body = await request.json().catch(() => null);
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";

  if (!messageBody) {
    return NextResponse.json({ error: "コメントを入力してください。" }, { status: 400 });
  }

  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  const [message] = await prisma.$queryRaw<
    { id: number; body: string; createdAt: Date }[]
  >`
    INSERT INTO "RepairCustomerMessage" ("repairId", "body", "senderType")
    VALUES (${repairId}, ${messageBody}, 'partner')
    RETURNING "id", "body", "createdAt"
  `;

  return NextResponse.json({ success: true, message });
}
