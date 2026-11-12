import assert from "node:assert/strict";
import test from "node:test";
import { registerHistoricalRefund, validateHistoricalRefund } from "./b2b-historical-refund";
import { unsettledHistoricalRefundAmount } from "../components/documents/HistoricalRefundPanel";
import type { PrismaClient } from "@prisma/client";

const input = validateHistoricalRefund({ repairId: 7, originalSaleReference: "legacy-7", originalSaleSource: "LEGACY",
  originalSaleGrossAmount: 20000, amount: 14014, reason: "返品", method: "OFFSET", idempotencyKey: "operation-key-123456" });

test("validates historical sale and refund bounds", () => {
  assert.equal(input.amount, 14014);
  assert.throws(() => validateHistoricalRefund({ ...input, amount: 20001 }), /返金額/);
  assert.throws(() => validateHistoricalRefund({ ...input, reason: "" }), /reason/);
  assert.throws(() => validateHistoricalRefund({ ...input, method: "CASH" }), /返金方法/);
  assert.throws(() => validateHistoricalRefund({ ...input, originalSaleSource: "CURRENT" }), /現システムの入金は照合が必要/);
  assert.throws(() => validateHistoricalRefund({ ...input, originalSaleGrossAmount: 2147483648 }), /元売上額/);
  assert.throws(() => validateHistoricalRefund({ ...input, amount: 2147483648 }), /返金額/);
  assert.throws(() => validateHistoricalRefund({ ...input, originalSaleDate: "2026-02-30" }), /元売上日/);
  assert.equal(validateHistoricalRefund({ ...input, originalSaleDate: "2024-02-29" }).originalSaleDate, "2024-02-29");
});

test("unsettled liability is the registered refund until settlement", () => {
  for (const status of ["PLANNED", "AWAITING_OFFSET"]) assert.equal(unsettledHistoricalRefundAmount(14014, status), 14014);
  for (const status of ["OFFSET_SETTLED", "BANK_SETTLED", "CANCELLED"]) assert.equal(unsettledHistoricalRefundAmount(14014, status), 0);
});

function fakeDb(repair: { customerId: number; deliveryNoteId: number }, existing: unknown = null, type = "business", paymentRefund: unknown = null) {
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => parts.join("?").includes("DeliveryNote")
      ? [{ id: 3, customerId: 1, type }] : [{ id: 7, ...repair }],
    b2BHistoricalRefund: { findUnique: async () => existing, create: async () => ({ id: 10 }) },
    paymentRefund: { findFirst: async () => paymentRefund },
  };
  return { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
}

test("rejects customer and delivery membership mismatch", async () => {
  await assert.rejects(registerHistoricalRefund(3, input, fakeDb({ customerId: 2, deliveryNoteId: 3 })), /一致しません/);
  await assert.rejects(registerHistoricalRefund(3, input, fakeDb({ customerId: 1, deliveryNoteId: 4 })), /一致しません/);
});

test("rejects duplicate repair refund", async () => {
  await assert.rejects(registerHistoricalRefund(3, input, fakeDb({ customerId: 1, deliveryNoteId: 3 }, { idempotencyKey: "different" })), /登録済み/);
});

test("rejects B2C and an existing payment refund", async () => {
  await assert.rejects(registerHistoricalRefund(3, input, fakeDb({ customerId: 1, deliveryNoteId: 3 }, null, "individual")), /法人/);
  await assert.rejects(registerHistoricalRefund(3, input, fakeDb({ customerId: 1, deliveryNoteId: 3 }, null, "business", { id: 9 })), /重複/);
});
