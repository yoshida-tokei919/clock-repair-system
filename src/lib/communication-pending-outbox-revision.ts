import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

type PendingOutboxDb = Pick<PrismaClient, "lineManagerSendOutbox">;
const PAGE_SIZE = 200;
const PENDING_STATUSES = ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] as const;

type PendingRow = {
  id: number;
  text: string;
  status: string;
  approvedAt: Date;
  inquiry: { lineUserId: number };
  lineManagerChat: { lineUserId: number };
  idempotencyKey?: string;
};

async function hashPendingRows(
  db: PendingOutboxDb,
  where: object,
  belongsToTarget: (row: PendingRow) => boolean,
) {
  const hash = createHash("sha256");
  let afterId = 0;
  while (true) {
    const rows = await db.lineManagerSendOutbox.findMany({
      where: { ...where, id: { gt: afterId } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true, text: true, status: true, approvedAt: true, idempotencyKey: true,
        inquiry: { select: { lineUserId: true } },
        lineManagerChat: { select: { lineUserId: true } },
      },
    });
    for (const row of rows) {
      if (!belongsToTarget(row)) continue;
      hash.update(JSON.stringify({ id: row.id, text: row.text, status: row.status, approvedAt: row.approvedAt }));
      hash.update("\n");
    }
    if (rows.length < PAGE_SIZE) break;
    afterId = rows[rows.length - 1].id;
  }
  return hash.digest("hex");
}

export function getCustomerPendingOutboxRevision(db: PendingOutboxDb, customerId: number) {
  return hashPendingRows(db, {
    idempotencyKey: { startsWith: `customer-line-reply:${customerId}:` },
    sourceRepairId: null,
    status: { in: [...PENDING_STATUSES] },
    inquiry: { lineUser: { linkedCustomerId: customerId } },
    lineManagerChat: { lineUser: { linkedCustomerId: customerId } },
  }, (row) => row.inquiry.lineUserId === row.lineManagerChat.lineUserId &&
    row.idempotencyKey?.startsWith(`customer-line-reply:${customerId}:${row.inquiry.lineUserId}:`) === true);
}

export function getRepairPendingOutboxRevision(db: PendingOutboxDb, repairId: number, customerId: number, sourceInquiryId: number | null) {
  if (sourceInquiryId === null) return createHash("sha256").digest("hex");
  return hashPendingRows(db, {
    inquiryId: sourceInquiryId,
    sourceRepairId: repairId,
    sourceRepair: { customerId },
    status: { in: [...PENDING_STATUSES] },
    inquiry: { lineUser: { linkedCustomerId: customerId } },
    lineManagerChat: { lineUser: { linkedCustomerId: customerId } },
  }, (row) => row.inquiry.lineUserId === row.lineManagerChat.lineUserId);
}
