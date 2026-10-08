import type { PrismaClient } from "@prisma/client";
import { effectiveAllocation, refundTotals } from "./payment-accounting";
import { releaseAllocation } from "./allocation-release";

export class InvoiceVoidError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function voidInvoice(db: PrismaClient, invoiceId: number, adminId: number) {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new InvoiceVoidError("請求書IDが不正です", 400);
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: number; lineSendStartedAt: Date | null }[]>`
      SELECT "id", "lineSendStartedAt" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
    if (rows.length !== 1) throw new InvoiceVoidError("請求書が見つかりません", 404);
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true,
      paymentAllocations: { select: { id: true, paymentId: true, allocatedAmount: true,
        releases: { select: { amount: true } }, payment: { select: { kind: true, status: true, amount: true,
          refunds: { select: { amount: true, status: true } } } } } } } });
    if (!invoice || !["issued", "paid"].includes(invoice.status)) throw new InvoiceVoidError("発行済み請求書のみ取消できます");
    if (rows[0].lineSendStartedAt) throw new InvoiceVoidError("LINE送信結果が未確定のため請求書を取消できません");
    const ids = [...new Set(invoice.paymentAllocations.map(a => a.paymentId))].sort((a, b) => a - b);
    // Lock every contributing Payment before evaluating refund and release histories.
    for (const id of ids) await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${id} FOR UPDATE`;
    const allocations = await tx.paymentAllocation.findMany({ where: { invoiceId },
      include: { releases: true, payment: { include: { refunds: true } } } });
    if (allocations.length !== invoice.paymentAllocations.length) throw new InvoiceVoidError("請求書の配賦が変わりました");
    for (const row of allocations) {
      if (row.payment.status === "PENDING" || row.payment.refunds.some(r => r.status === "PENDING")) {
        throw new InvoiceVoidError("処理中の入金または返金があるため請求書を取消できません");
      }
      if (row.payment.kind === "INVOICE" && row.payment.status === "SUCCEEDED"
        && refundTotals(row.payment.refunds).succeeded !== row.payment.amount) {
        throw new InvoiceVoidError("請求入金に未返金額があります。返金完了後に取消してください");
      }
    }
    let releasedAmount = 0;
    for (const row of allocations) {
      const remaining = effectiveAllocation(row);
      if (remaining > 0) {
        await releaseAllocation(tx, row.id, remaining, "請求書取消", adminId);
        releasedAmount += remaining;
      }
    }
    const updated = await tx.invoice.update({ where: { id: invoiceId }, data: { status: "void" },
      select: { id: true, invoiceNumber: true, status: true } });
    const repairs = await tx.repair.updateMany({ where: { invoiceId }, data: { invoiceId: null } });
    return { invoice: updated, releasedAmount, releasedRepairCount: repairs.count };
  });
}
