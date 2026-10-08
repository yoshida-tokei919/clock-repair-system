import { Prisma, type PrismaClient } from "@prisma/client";

const NONTERMINAL_LINE_STATUSES = ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] as const;

export class CustomerDeletionBlockedError extends Error {}

/** Keep Customer ownership stable until all sendable LINE intents have been checked. */
export async function deleteCustomerSafely(db: PrismaClient, customerId: number) {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new CustomerDeletionBlockedError("顧客IDが不正です。");

  await db.$transaction(async (tx) => {
    // Customer-level LINE reply creation takes this same lock before reading LineUser.
    const customers = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE
    `;
    if (customers.length !== 1) throw new CustomerDeletionBlockedError("顧客が見つかりません。");

    const repairCount = await tx.repair.count({ where: { customerId } });
    if (repairCount > 0) throw new CustomerDeletionBlockedError("修理履歴がある顧客は削除できません。");

    const linkedUsers = await tx.lineUser.findMany({
      where: { linkedCustomerId: customerId },
      select: { id: true },
    });
    const lineUserIds = linkedUsers.map((user) => user.id);
    if (lineUserIds.length > 0) {
      const pendingSend = await tx.lineManagerSendOutbox.findFirst({
        where: {
          status: { in: [...NONTERMINAL_LINE_STATUSES] },
          OR: [
            { inquiry: { lineUserId: { in: lineUserIds } } },
            { lineManagerChat: { lineUserId: { in: lineUserIds } } },
          ],
        },
        select: { id: true },
      });
      if (pendingSend) throw new CustomerDeletionBlockedError("LINE送信待ち・結果確認中の内容があるため、この顧客は削除できません。");
    }

    await tx.customer.delete({ where: { id: customerId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
