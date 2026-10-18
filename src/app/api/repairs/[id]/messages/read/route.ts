import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseRepairCommentId } from "@/lib/repair-comments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const repairId = parseRepairCommentId((await params).id);
  if (repairId === null) {
    return NextResponse.json({ error: "修理IDが不正です。" }, { status: 400 });
  }

  const input = await request.json().catch(() => null);
  const messageIds = input?.messageIds;
  if (!Array.isArray(messageIds) || messageIds.length < 1 || messageIds.length > 200 ||
      messageIds.some((id: unknown) => !Number.isSafeInteger(id) || (id as number) <= 0)) {
    return NextResponse.json({ error: "表示したコメントIDが不正です。" }, { status: 400 });
  }

  const count = await prisma.$executeRaw`
    UPDATE "RepairCustomerMessage"
    SET "readAt" = NOW()
    WHERE "repairId" = ${repairId}
      AND "readAt" IS NULL
      AND "senderType" = 'partner'
      AND "id" IN (${Prisma.join(messageIds)})
  `;

  return NextResponse.json({ success: true, count });
}
