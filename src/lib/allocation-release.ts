import type { Prisma } from "@prisma/client";
import { effectiveAllocation } from "./payment-accounting";

/** Caller owns its transaction. Serialize release/refund/allocation changes on Payment. */
export async function releaseAllocation(tx: Prisma.TransactionClient, allocationId: number,
  amount: number, reason: string, adminId: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !reason.trim()) throw new Error("解除額と理由が不正です");
  const parent = await tx.paymentAllocation.findUnique({ where: { id: allocationId }, select: { paymentId: true } });
  if (!parent) throw new Error("配賦が見つかりません");
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${parent.paymentId} FOR UPDATE`;
  const row = await tx.paymentAllocation.findUnique({ where: { id: allocationId },
    include: { releases: { select: { amount: true } } } });
  if (!row || amount > effectiveAllocation(row)) throw new Error("解除額が有効配賦額を超えています");
  return tx.paymentAllocationRelease.create({ data: { allocationId, amount, reason, releasedBy: adminId } });
}
