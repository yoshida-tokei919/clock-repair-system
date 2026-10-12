import assert from "node:assert/strict";
import test from "node:test";
import { getPublicIntakeShippingDecision, IntakeShippingDecisionError, requestIntakeShippingDecision, respondIntakeShippingDecision } from "./intake-shipping-decision";

const usedAt = new Date("2026-10-12T10:00:00Z");
function fixture() {
  const repairs = [
    { id: 10, inquiryNumber: "T-10", customerId: 3, status: "作業完了", publicToken: "opaque-10", publicTokenCreatedAt: usedAt, customer: { type: "individual" }, shipmentRepairs: [] },
    { id: 11, inquiryNumber: "T-11", customerId: 3, status: "部品待ち(注文済み)", publicToken: "opaque-11", publicTokenCreatedAt: usedAt, customer: { type: "individual" }, shipmentRepairs: [] },
  ];
  const invite: any = {
    id: 7, usedAt, revokedAt: null, customerId: 3, lineUserId: 4, inquiryId: 5,
    inquiry: { lineUserId: 4 }, lineUser: { linkedCustomerId: 3, lineManagerChat: { id: 6, verifiedAt: usedAt } }, repairs,
    inquiryWatches: repairs.map(r => ({ inquiryWatch: { inquiryId: 5, promotedRepairId: r.id } })),
  };
  let decision: any = null;
  let outbox: any = null;
  let outboxWrites = 0;
  let shipmentWrites = 0;
  const db: any = {
    repair: { findUnique: async ({ where }: any) => {
      const row = repairs.find(r => r.id === where.id || r.publicToken === where.publicToken);
      return row ? { id: row.id, customerId: row.customerId, repairIntakeInviteId: 7, customer: row.customer } : null;
    } },
    repairIntakeInvite: { findUnique: async () => invite },
    repairIntakeShippingDecision: {
      findUnique: async () => decision,
      create: async ({ data }: any) => {
        decision = { ...data, choice: null, requestedAt: usedAt, respondedAt: null,
          repairs: data.repairs.create.map((r: any) => ({ ...r, repairIntakeInviteId: 7 })), requestOutbox: outbox };
        return decision;
      },
      update: async ({ data }: any) => { decision = { ...decision, ...data }; return decision; },
    },
    repairIntakeDeliveryPreference: { findFirst: async () => null },
    inquiry: { findUnique: async () => ({ id: 5, lineUserId: 4 }) },
    lineManagerChat: { findUnique: async () => ({ id: 6, lineUserId: 4, managerBotId: "bot", managerChatId: "chat" }) },
    lineManagerSendOutbox: { upsert: async ({ create }: any) => {
      if (!outbox) { outboxWrites++; outbox = { id: 8, status: "APPROVED", ...create }; }
      return outbox;
    } },
    shipment: { create: async () => { shipmentWrites++; } },
    $queryRaw: async () => [{ id: 3 }],
    $transaction: async (fn: any) => fn(db),
  };
  return { db, invite, repairs, get decision() { return decision; }, get outbox() { return outbox; }, get outboxWrites() { return outboxWrites; }, get shipmentWrites() { return shipmentWrites; } };
}

test("one intake request freezes both Repair rows and queues one grouped outbox", async () => {
  const f = fixture();
  await requestIntakeShippingDecision(f.db, 10, "https://example.test");
  await requestIntakeShippingDecision(f.db, 11, "https://example.test");
  assert.equal(f.outboxWrites, 1);
  assert.equal(f.outbox.idempotencyKey, "intake-shipping-decision-request:7");
  assert.equal(f.outbox.sourceRepairId, null);
  assert.match(f.outbox.text, /\/customer\/repairs\/opaque-10/);
  assert.deepEqual(f.decision.repairs.map((r: any) => [r.repairId, r.completedAtRequest]), [[10, true], [11, false]]);
  assert.equal(f.shipmentWrites, 0);
});

test("customer response is token-bound, one-time and does not create Shipment", async () => {
  const f = fixture();
  await requestIntakeShippingDecision(f.db, 10, "https://example.test");
  assert.equal((await getPublicIntakeShippingDecision(f.db, "opaque-11")).choice, null);
  assert.equal((await respondIntakeShippingDecision(f.db, "opaque-11", "SHIP_COMPLETED")).choice, "SHIP_COMPLETED");
  assert.equal((await respondIntakeShippingDecision(f.db, "opaque-10", "SHIP_COMPLETED")).choice, "SHIP_COMPLETED");
  await assert.rejects(respondIntakeShippingDecision(f.db, "opaque-10", "WAIT_ALL"), IntakeShippingDecisionError);
  await assert.rejects(getPublicIntakeShippingDecision(f.db, "10"), IntakeShippingDecisionError);
  assert.equal(f.shipmentWrites, 0);
});

test("new request requires a current mixed group and rejects customer or Shipment conflicts", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.repairs[1].customerId = 99; },
    (f: ReturnType<typeof fixture>) => { f.repairs.splice(1, 1); },
    (f: ReturnType<typeof fixture>) => { f.repairs[1].status = "作業完了"; },
    (f: ReturnType<typeof fixture>) => { (f.repairs[0].shipmentRepairs as any[]).push({ shipment: { direction: "OUTBOUND", status: "DRAFT" } }); },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(requestIntakeShippingDecision(f.db, 10, "https://example.test"), IntakeShippingDecisionError);
    assert.equal(f.outboxWrites, 0);
  }
  const f = fixture();
  await requestIntakeShippingDecision(f.db, 10, "https://example.test");
  f.repairs[1].status = "作業完了";
  f.invite.lineUser.lineManagerChat.verifiedAt = null;
  const publicView = await getPublicIntakeShippingDecision(f.db, "opaque-10");
  assert.deepEqual(publicView.repairs, [
    { inquiryNumber: "T-10", completedAtRequest: true },
    { inquiryNumber: "T-11", completedAtRequest: false },
  ]);
  await requestIntakeShippingDecision(f.db, 11, undefined);
  assert.equal(f.outboxWrites, 1);
  assert.deepEqual(f.decision.repairs.map((r: any) => [r.repairId, r.completedAtRequest]), [[10, true], [11, false]]);
  assert.equal((await respondIntakeShippingDecision(f.db, "opaque-10", "WAIT_ALL")).choice, "WAIT_ALL");
  await assert.rejects(respondIntakeShippingDecision(f.db, "opaque-11", "SHIP_COMPLETED"),
    (error: IntakeShippingDecisionError) => error.status === 409);
  assert.equal(f.shipmentWrites, 0);
});

test("existing request rejects membership and outbound Shipment conflicts after status drift", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.repairs[1].customerId = 99; },
    (f: ReturnType<typeof fixture>) => { (f.repairs[0].shipmentRepairs as any[]).push({ shipment: { direction: "OUTBOUND", status: "DRAFT" } }); },
    (f: ReturnType<typeof fixture>) => { f.invite.inquiryWatches[1].inquiryWatch.promotedRepairId = 99; },
    (f: ReturnType<typeof fixture>) => { f.decision.repairs[1].repairIntakeInviteId = 99; },
  ]) {
    const f = fixture();
    await requestIntakeShippingDecision(f.db, 10, "https://example.test");
    f.repairs[1].status = "作業完了";
    change(f);
    await assert.rejects(getPublicIntakeShippingDecision(f.db, "opaque-10"), IntakeShippingDecisionError);
    await assert.rejects(respondIntakeShippingDecision(f.db, "opaque-10", "WAIT_ALL"), IntakeShippingDecisionError);
    assert.equal(f.shipmentWrites, 0);
  }
});

test("public access stays within the B2C intake and a non-cancelled request", async () => {
  const f = fixture();
  await requestIntakeShippingDecision(f.db, 10, "https://example.test");
  await assert.rejects(getPublicIntakeShippingDecision(f.db, "other-token"), IntakeShippingDecisionError);
  f.repairs[0].customer.type = "business";
  await assert.rejects(getPublicIntakeShippingDecision(f.db, "opaque-10"), IntakeShippingDecisionError);
  f.repairs[0].customer.type = "individual";
  f.outbox.status = "CANCELLED";
  await assert.rejects(respondIntakeShippingDecision(f.db, "opaque-11", "WAIT_ALL"), IntakeShippingDecisionError);
});

test("a persisted grouped delivery answer prevents a later incompatible shipping request", async () => {
  const f = fixture();
  f.db.repairIntakeDeliveryPreference.findFirst = async () => ({ repairIntakeInviteId: 7 });
  await assert.rejects(requestIntakeShippingDecision(f.db, 10, "https://example.test"),
    (error: IntakeShippingDecisionError) => error.status === 409);
  assert.equal(f.outboxWrites, 0);
});
