import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  queueShipmentShippingNotice,
  shipmentShippingNoticeKey,
  syncJapanPostTrackingCsvWithNotices,
} from "./japan-post-shipping-notice";

function noticeFixture(options: { business?: boolean; invite?: boolean; accepted?: boolean } = {}) {
  const customerId = 7;
  const shipmentId = 42;
  const lineUserId = 11;
  const inquiryId = 13;
  const lineManagerChatId = 17;
  let createCalls = 0;
  let lockCalls = 0;
  const fullShipment = {
    id: shipmentId,
    customerId,
    direction: "OUTBOUND",
    carrierCode: "JAPAN_POST",
    status: "SHIPPED",
    trackingNumber: "193715301010",
    actualShippedAt: options.accepted === false ? null : new Date("2026-10-13T00:00:00Z"),
    customer: { type: options.business ? "business" : "individual" },
    repairs: [{ repair: {
      customerId,
      repairIntakeInviteId: options.invite === false ? null : 9,
      inquiryWatchPromotion: options.invite === false ? { inquiryId } : null,
    } }],
  };
  const shipment = {
    findUnique: async ({ select }: any) => Object.keys(select ?? {}).length === 1 && select.customerId
      ? { customerId }
      : fullShipment,
  };
  const tx = {
    shipment,
    repairIntakeInvite: { findUnique: async () => ({
      usedAt: new Date(), revokedAt: null, customerId, inquiryId, lineUserId,
      inquiry: { lineUserId },
      lineUser: { linkedCustomerId: customerId, lineManagerChat: { id: lineManagerChatId, verifiedAt: new Date() } },
    }) },
    inquiry: { findUnique: async () => ({
      id: inquiryId, lineUserId,
      lineUser: { linkedCustomerId: customerId, lineManagerChat: { id: lineManagerChatId, verifiedAt: new Date() } },
    }) },
    $queryRaw: async () => ++lockCalls === 1 ? [{ id: customerId }] : [{ linkedCustomerId: customerId }],
  };
  const db = {
    shipment,
    $transaction: async (action: (tx: any) => Promise<any>) => action(tx),
  } as unknown as Pick<PrismaClient, "$transaction" | "shipment">;
  const createApproved = async (_tx: any, input: any) => {
    createCalls++;
    assert.equal(input.inquiryId, inquiryId);
    assert.equal(input.lineManagerChatId, lineManagerChatId);
    assert.equal(input.idempotencyKey, shipmentShippingNoticeKey(shipmentId));
    assert.equal(input.text, "修理品を発送しました。\n日本郵便の追跡番号：193715301010\n配送状況は、先にご案内している修理状況ページからもご確認いただけます。");
    return { status: "APPROVED" };
  };
  return { db, createApproved, createCalls: () => createCalls };
}

test("accepted individual Shipment queues one stable idempotent notice from intake source", async () => {
  const f = noticeFixture();
  const result = await queueShipmentShippingNotice(f.db, 42, f.createApproved as never);
  assert.deepEqual(result, { shipmentId: 42, outcome: "READY", outboxStatus: "APPROVED" });
  assert.equal(f.createCalls(), 1);
});

test("promotion inquiry is a safe fallback when the Shipment has no intake invite", async () => {
  const f = noticeFixture({ invite: false });
  const result = await queueShipmentShippingNotice(f.db, 42, f.createApproved as never);
  assert.equal(result.outcome, "READY");
  assert.equal(f.createCalls(), 1);
});

test("B2B or pre-acceptance Shipment never creates a shipping LINE outbox", async () => {
  for (const options of [{ business: true }, { accepted: false }]) {
    const f = noticeFixture(options);
    const result = await queueShipmentShippingNotice(f.db, 42, f.createApproved as never);
    assert.equal(result.outcome, "SKIPPED");
    assert.equal(result.reason, "shipment_not_eligible");
    assert.equal(f.createCalls(), 0);
  }
});

test("LINE queue failure is isolated from successful tracking synchronization", async () => {
  const sync = async () => [{
    shipmentId: 42, state: "SHIPPED" as const, outcome: "UPDATED" as const,
    actualShippedAt: "2026-10-13T00:00:00.000Z", deliveredAt: null, errors: [],
  }];
  const queue = async () => { throw new Error("synthetic LINE failure"); };
  const result = await syncJapanPostTrackingCsvWithNotices({} as never, Buffer.from("csv"), queue as never, sync as never);
  assert.equal(result.tracking[0].outcome, "UPDATED");
  assert.deepEqual(result.notices, [{ shipmentId: 42, outcome: "ERROR", reason: "notice_queue_failed" }]);
});
