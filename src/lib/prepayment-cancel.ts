import type { PrismaClient } from "@prisma/client";

export class PrepaymentCancelError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type CancelCheckoutGateway = {
  retrieve(id: string): Promise<{ id: string; status: string | null; payment_status: string }>;
  expire(id: string): Promise<{ id: string; status: string | null; payment_status: string }>;
};

export async function cancelPendingPrepayment(db: PrismaClient, gateway: CancelCheckoutGateway,
  paymentId: number, reason: string, adminId: number) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(adminId) || adminId <= 0
    || typeof reason !== "string" || !reason.trim()) throw new PrepaymentCancelError("取消理由が必要です", 400);
  const payment = await db.payment.findUnique({ where: { id: paymentId },
    include: { attempts: { orderBy: { id: "asc" } }, allocations: true } });
  if (!payment || payment.kind !== "REPAIR_PREPAYMENT" || payment.status !== "PENDING"
    || payment.provider !== "STRIPE" || payment.allocations.length) {
    throw new PrepaymentCancelError("未決済の前受金依頼ではありません", 409);
  }
  if (payment.attempts.some(a => a.status === "SUCCEEDED" || !a.checkoutSessionId)) {
    throw new PrepaymentCancelError("Checkout結果が不明です。取消前に照合してください", 409);
  }
  const pending = payment.attempts.filter(a => a.status === "PENDING");
  if (pending.length > 1) throw new PrepaymentCancelError("Checkout履歴が不整合です", 409);
  const attempt = pending[0];
  for (const sessionAttempt of payment.attempts) {
    try {
      let session = await gateway.retrieve(sessionAttempt.checkoutSessionId!);
      if (session.id !== sessionAttempt.checkoutSessionId || session.payment_status === "paid" || session.status === "complete") {
        throw new PrepaymentCancelError("決済済みまたは決済処理中のため取消できません", 409);
      }
      if (session.status === "open") session = await gateway.expire(sessionAttempt.checkoutSessionId!);
      if (session.id !== sessionAttempt.checkoutSessionId || session.status !== "expired" || session.payment_status === "paid") {
        throw new PrepaymentCancelError("Checkout終了を確認できません。取消できません", 409);
      }
    } catch (error) {
      if (error instanceof PrepaymentCancelError) throw error;
      throw new PrepaymentCancelError("Stripe Checkout結果が不明です。取消できません", 502);
    }
  }
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: paymentId },
      include: { attempts: { orderBy: { id: "asc" } }, allocations: true } });
    if (!current || current.status !== "PENDING" || current.kind !== "REPAIR_PREPAYMENT" || current.allocations.length
      || current.attempts.length !== payment.attempts.length
      || current.attempts.some((a, i) => a.id !== payment.attempts[i]?.id
        || a.status !== payment.attempts[i]?.status || a.checkoutSessionId !== payment.attempts[i]?.checkoutSessionId)) {
      throw new PrepaymentCancelError("前受金の状態が変わりました。取消できません", 409);
    }
    if (attempt) await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "CANCELED" } });
    return tx.payment.update({ where: { id: paymentId }, data: {
      status: "CANCELED", canceledAt: new Date(), cancelReason: reason.trim(), canceledBy: adminId,
    } });
  });
}
