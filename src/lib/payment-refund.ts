import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { refundableAmount } from "./payment-accounting";

export class PaymentRefundError extends Error {
  constructor(message: string, readonly status: number, readonly reconciliationNeeded = false) { super(message); }
}

type GatewayRefund = { id: string; status: string | null; created: number };
export type RefundGateway = {
  create(params: { payment_intent: string; amount: number; metadata: { paymentRefundId: string } }, key: string): Promise<GatewayRefund>;
  retrieve(id: string): Promise<GatewayRefund>;
};

function providerState(status: string | null) {
  if (status === "succeeded") return "SUCCEEDED" as const;
  if (status === "failed") return "FAILED" as const;
  if (status === "canceled") return "CANCELED" as const;
  return "PENDING" as const;
}

function validRequest(amount: number, reason: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    throw new PaymentRefundError("返金額は正の整数円で指定してください", 400);
  }
  if (typeof reason !== "string" || !reason.trim()) throw new PaymentRefundError("返金理由を入力してください", 400);
  return reason.trim();
}

async function lockPayment(tx: Prisma.TransactionClient, paymentId: number) {
  // All refund reservations and allocation changes serialize on the parent Payment.
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  if (rows.length !== 1) throw new PaymentRefundError("支払いが見つかりません", 404);
}

const refundPaymentInclude = {
  allocations: { include: { releases: true } }, refunds: true,
  attempts: { where: { status: "SUCCEEDED" as const, provider: "STRIPE" as const } },
};

async function reserveRefund(db: PrismaClient, paymentId: number, amount: number, reason: string, adminId: number,
  mode: "STRIPE" | "MANUAL", manualOperationKey?: string) {
  return db.$transaction(async tx => {
    const parent = await tx.payment.findUnique({ where: { id: paymentId }, select: { kind: true,
      allocations: { select: { invoiceId: true } } } });
    if (!parent) throw new PaymentRefundError("支払いが見つかりません", 404);
    const invoiceId = parent.kind === "INVOICE" && parent.allocations.length === 1
      ? parent.allocations[0].invoiceId : null;
    if (parent.kind === "INVOICE" && invoiceId === null) throw new PaymentRefundError("請求入金の配賦が不整合です", 409);
    if (invoiceId !== null) await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
    await lockPayment(tx, paymentId);
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: refundPaymentInclude });
    if (!payment || payment.status !== "SUCCEEDED" || payment.provider !== mode || payment.currency !== "JPY") {
      throw new PaymentRefundError("この支払いは返金対象ではありません", 409);
    }
    if (mode === "MANUAL" && (payment.kind !== "INVOICE" || payment.method !== "BANK_TRANSFER")) {
      throw new PaymentRefundError("銀行振込の請求入金のみ手動返金を記録できます", 409);
    }
    const idempotencyKey = mode === "MANUAL" ? `manual-refund:${manualOperationKey}` : randomUUID();
    if (mode === "MANUAL") {
      const existing = await tx.paymentRefund.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.paymentId !== paymentId || existing.amount !== amount || existing.reason !== reason
          || existing.provider !== mode || existing.status !== "SUCCEEDED") {
          throw new PaymentRefundError("この手動返金操作キーは別の返金記録に使用されています", 409);
        }
        return { refund: existing, paymentIntentId: null };
      }
    }
    if (mode === "STRIPE" && (payment.method !== "CARD" || payment.attempts.length !== 1
      || !payment.attempts[0].paymentIntentId)) {
      throw new PaymentRefundError("Stripe入金のPaymentIntentを一意に確認できません", 409);
    }
    if (payment.refunds.some(refund => refund.status === "PENDING")) {
      throw new PaymentRefundError("返金処理中です。先に既存の返金結果を照合してください", 409, true);
    }
    if (invoiceId !== null) {
      if (payment.allocations.length !== 1 || payment.allocations[0].invoiceId !== invoiceId) {
        throw new PaymentRefundError("請求入金の配賦が変わりました", 409);
      }
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true,
        paymentAllocations: { select: { payment: { select: { status: true } } } } } });
      if (!invoice || !["issued", "paid"].includes(invoice.status)
        || invoice.paymentAllocations.some(row => row.payment.status === "PENDING")) {
        throw new PaymentRefundError("請求書に処理中の支払いがあります。先に決済結果を照合してください", 409);
      }
    }
    if (amount > refundableAmount(payment)) throw new PaymentRefundError("返金可能額を超えています", 409);
    const refund = await tx.paymentRefund.create({ data: {
      paymentId, amount, reason, provider: mode, requestedBy: adminId, idempotencyKey,
      status: mode === "MANUAL" ? "SUCCEEDED" : "PENDING", refundedAt: mode === "MANUAL" ? new Date() : null,
    } });
    return { refund, paymentIntentId: payment.attempts[0]?.paymentIntentId ?? null };
  });
}

async function saveProviderResult(db: PrismaClient, refundId: number, result: GatewayRefund) {
  if (!result.id) throw new PaymentRefundError("Stripe返金結果のIDを確認できません。照合が必要です", 502, true);
  return db.$transaction(async tx => {
    const row = await tx.paymentRefund.findUnique({ where: { id: refundId }, select: { paymentId: true } });
    if (!row) throw new PaymentRefundError("返金履歴が見つかりません", 404);
    await lockPayment(tx, row.paymentId);
    const current = await tx.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    if (current.externalRefundId && current.externalRefundId !== result.id) {
      throw new PaymentRefundError("Stripe返金IDが一致しません。照合が必要です", 409, true);
    }
    if (current.status === "SUCCEEDED" || current.status === "FAILED" || current.status === "CANCELED") return current;
    const status = providerState(result.status);
    return tx.paymentRefund.update({ where: { id: refundId }, data: {
      externalRefundId: result.id, providerStatus: result.status, status,
      refundedAt: status === "SUCCEEDED" ? new Date() : null, lastError: null,
    } });
  });
}

export async function createPaymentRefund(db: PrismaClient, gateway: RefundGateway | null, input: {
  paymentId: number; amount: number; reason: string; adminId: number; mode: "STRIPE" | "MANUAL";
  manualOperationKey?: string;
}) {
  const reason = validRequest(input.amount, input.reason);
  if (!Number.isSafeInteger(input.paymentId) || input.paymentId <= 0 || !Number.isSafeInteger(input.adminId) || input.adminId <= 0) {
    throw new PaymentRefundError("返金指定が不正です", 400);
  }
  if (input.mode === "STRIPE" && !gateway) throw new PaymentRefundError("Stripeを利用できません", 503);
  if (input.mode === "MANUAL" && (typeof input.manualOperationKey !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.manualOperationKey))) {
    throw new PaymentRefundError("手動返金操作キーはUUIDで指定してください", 400);
  }
  if (input.mode === "STRIPE" && input.manualOperationKey !== undefined) throw new PaymentRefundError("返金指定が不正です", 400);
  const { refund, paymentIntentId } = await reserveRefund(db, input.paymentId, input.amount, reason, input.adminId, input.mode,
    input.manualOperationKey?.toLowerCase());
  if (input.mode === "MANUAL") return refund;
  let result: GatewayRefund;
  try {
    result = await gateway!.create({ payment_intent: paymentIntentId!, amount: refund.amount,
      metadata: { paymentRefundId: String(refund.id) } }, refund.idempotencyKey);
  } catch {
    // Another same-key request may already be accepted. Keep the reservation until reconciliation.
    throw new PaymentRefundError("Stripe返金結果が不明です。返金履歴から照合してください", 502, true);
  }
  try {
    return await saveProviderResult(db, refund.id, result);
  } catch (error) {
    if (error instanceof PaymentRefundError) throw error;
    throw new PaymentRefundError("Stripe返金結果が不明です。返金履歴から照合してください", 502, true);
  }
}

export async function reconcilePaymentRefund(db: PrismaClient, gateway: RefundGateway, refundId: number) {
  if (!Number.isSafeInteger(refundId) || refundId <= 0) throw new PaymentRefundError("返金IDが不正です", 400);
  const row = await db.paymentRefund.findUnique({ where: { id: refundId }, include: {
    payment: { include: { attempts: { where: { status: "SUCCEEDED", provider: "STRIPE" } } } },
  } });
  if (!row || row.provider !== "STRIPE") throw new PaymentRefundError("Stripe返金履歴が見つかりません", 404);
  if (row.status !== "PENDING") return row;
  try {
    let result: GatewayRefund;
    if (row.externalRefundId) result = await gateway.retrieve(row.externalRefundId);
    else {
      // Stripe can discard idempotency keys after 24 hours. An unknown old POST cannot be replayed safely.
      if (Date.now() - row.createdAt.getTime() >= 23 * 60 * 60 * 1000) {
        throw new PaymentRefundError("Stripe返金結果の手動照合が必要です", 409, true);
      }
      const attempts = row.payment.attempts;
      if (attempts.length !== 1 || !attempts[0].paymentIntentId) {
        throw new PaymentRefundError("PaymentIntentを確認できません", 409, true);
      }
      try {
        result = await gateway.create({ payment_intent: attempts[0].paymentIntentId, amount: row.amount,
          metadata: { paymentRefundId: String(row.id) } }, row.idempotencyKey);
      } catch {
        throw new PaymentRefundError("Stripe返金結果が不明です。再照合してください", 502, true);
      }
    }
    return await saveProviderResult(db, refundId, result);
  } catch (error) {
    if (error instanceof PaymentRefundError) throw error;
    throw new PaymentRefundError("Stripe返金結果が不明です。再照合してください", 502, true);
  }
}
