import { Prisma, type B2BHistoricalRefundMethod, type B2BHistoricalRefundSaleSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class HistoricalRefundError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type HistoricalRefundInput = {
  repairId: number;
  originalSaleReference: string;
  originalSaleSource: B2BHistoricalRefundSaleSource;
  originalSaleDate?: string | null;
  originalSaleGrossAmount: number;
  amount: number;
  reason: string;
  method: B2BHistoricalRefundMethod;
  internalNotes?: string | null;
  idempotencyKey: string;
};

export function validateHistoricalRefund(value: unknown): HistoricalRefundInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HistoricalRefundError("入力を確認してください");
  const v = value as Record<string, unknown>;
  const allowed = new Set(["repairId", "originalSaleReference", "originalSaleSource", "originalSaleDate", "originalSaleGrossAmount", "amount", "reason", "method", "internalNotes", "idempotencyKey"]);
  if (Object.keys(v).some(key => !allowed.has(key))) throw new HistoricalRefundError("入力項目を確認してください");
  if (!Number.isSafeInteger(v.repairId) || (v.repairId as number) <= 0 || (v.repairId as number) > 2147483647) throw new HistoricalRefundError("案件を選択してください");
  if (!Number.isSafeInteger(v.originalSaleGrossAmount) || (v.originalSaleGrossAmount as number) <= 0 || (v.originalSaleGrossAmount as number) > 2147483647) throw new HistoricalRefundError("元売上額を確認してください");
  if (!Number.isSafeInteger(v.amount) || (v.amount as number) <= 0 || (v.amount as number) > 2147483647 || (v.amount as number) > (v.originalSaleGrossAmount as number)) throw new HistoricalRefundError("返金額を確認してください");
  for (const key of ["originalSaleReference", "reason"] as const) {
    if (typeof v[key] !== "string" || !v[key].trim() || v[key].length > 500) throw new HistoricalRefundError(`${key}を入力してください`);
  }
  if (v.method !== "OFFSET" && v.method !== "BANK") throw new HistoricalRefundError("返金方法を選択してください");
  if (v.originalSaleSource === "CURRENT") throw new HistoricalRefundError("現システムの入金は照合が必要です。別Taskで対応するまで登録できません");
  if (v.originalSaleSource !== "LEGACY") throw new HistoricalRefundError("元売上の記録元を選択してください");
  if (typeof v.idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(v.idempotencyKey)) throw new HistoricalRefundError("操作キーを確認してください");
  if (v.internalNotes != null && (typeof v.internalNotes !== "string" || v.internalNotes.length > 2000)) throw new HistoricalRefundError("内部メモを確認してください");
  if (v.originalSaleDate != null) {
    const parsed = typeof v.originalSaleDate === "string" ? Date.parse(`${v.originalSaleDate}T00:00:00.000Z`) : NaN;
    if (typeof v.originalSaleDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.originalSaleDate) ||
      Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== v.originalSaleDate) {
      throw new HistoricalRefundError("元売上日を確認してください");
    }
  }
  return {
    repairId: v.repairId as number, originalSaleReference: (v.originalSaleReference as string).trim(), originalSaleSource: v.originalSaleSource,
    originalSaleDate: v.originalSaleDate as string | null | undefined,
    originalSaleGrossAmount: v.originalSaleGrossAmount as number, amount: v.amount as number,
    reason: (v.reason as string).trim(), method: v.method,
    internalNotes: (v.internalNotes as string | null | undefined)?.trim() || null,
    idempotencyKey: v.idempotencyKey,
  };
}

export async function registerHistoricalRefund(deliveryNoteId: number, input: HistoricalRefundInput, db: typeof prisma = prisma) {
  if (input.originalSaleSource !== "LEGACY") throw new HistoricalRefundError("現システムの入金は照合が必要です。別Taskで対応するまで登録できません");
  try {
    return await db.$transaction(async tx => {
      const [note] = await tx.$queryRaw<{ id: number; customerId: number; type: string }[]>`
        SELECT d."id", d."customerId", c."type" FROM "DeliveryNote" d
        JOIN "Customer" c ON c."id" = d."customerId" WHERE d."id" = ${deliveryNoteId} FOR UPDATE OF d`;
      if (!note) throw new HistoricalRefundError("納品書が見つかりません", 404);
      if (note.type !== "business") throw new HistoricalRefundError("法人納品書のみ登録できます", 403);
      const [repair] = await tx.$queryRaw<{ id: number; customerId: number; deliveryNoteId: number | null }[]>`
        SELECT "id", "customerId", "deliveryNoteId" FROM "Repair" WHERE "id" = ${input.repairId} FOR UPDATE`;
      if (!repair || repair.customerId !== note.customerId || repair.deliveryNoteId !== deliveryNoteId) {
        throw new HistoricalRefundError("納品書の案件と顧客が一致しません", 409);
      }
      const existing = await tx.b2BHistoricalRefund.findUnique({ where: { repairId: input.repairId } });
      if (existing) {
        if (existing.idempotencyKey === input.idempotencyKey && existing.amount === input.amount &&
          existing.originalSaleGrossAmount === input.originalSaleGrossAmount && existing.originalSaleReference === input.originalSaleReference && existing.originalSaleSource === input.originalSaleSource &&
          existing.reason === input.reason && existing.method === input.method && existing.internalNotes === input.internalNotes &&
          (existing.originalSaleDate?.toISOString().slice(0, 10) ?? null) === (input.originalSaleDate ?? null)) return existing;
        throw new HistoricalRefundError("この案件の履歴返金は登録済みです", 409);
      }
      const paymentRefund = await tx.paymentRefund.findFirst({ where: {
        payment: { OR: [
          { repairId: input.repairId },
          { allocations: { some: { invoice: { repairs: { some: { id: input.repairId } } } } } },
        ] }, status: { in: ["PENDING", "SUCCEEDED"] },
      }, select: { id: true } });
      if (paymentRefund) throw new HistoricalRefundError("既存の入金返金と重複します", 409);
      return tx.b2BHistoricalRefund.create({ data: {
        customerId: note.customerId, deliveryNoteId, repairId: input.repairId,
        originalSaleReference: input.originalSaleReference, originalSaleSource: input.originalSaleSource,
        originalSaleDate: input.originalSaleDate ? new Date(`${input.originalSaleDate}T00:00:00.000Z`) : null,
        originalSaleGrossAmount: input.originalSaleGrossAmount, amount: input.amount, reason: input.reason,
        method: input.method, status: input.method === "OFFSET" ? "AWAITING_OFFSET" : "PLANNED",
        taxStatus: "PENDING", internalNotes: input.internalNotes, idempotencyKey: input.idempotencyKey,
      } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HistoricalRefundError("この返金は登録済みです", 409);
    throw error;
  }
}
