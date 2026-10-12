import assert from "node:assert/strict";
import test from "node:test";
import { completionDeliveryPath, getPublicIntakeDeliveryPreference, IntakeDeliveryPreferenceError, isGroupedDeliveryApplicable, savePublicIntakeDeliveryPreference } from "./intake-delivery-preference";
import { getPublicRepairDeliveryPreference, RepairDeliveryPreferenceError } from "./repair-delivery-preference";

const now = new Date("2026-10-12T10:00:00Z");
const tokenA = "abcdefghijklmnopqrstuvwx12345678";
const tokenB = "zyxwvutsrqponmlkjihgfedcb87654321";
function fixture(choice: "SHIP_COMPLETED" | "WAIT_ALL" | null = null) {
  const repairs: any[] = [
    { id: 10, customerId: 3, inquiryNumber: "T-10", status: "作業完了", publicToken: tokenA, publicTokenCreatedAt: now, customer: { type: "individual" }, shipmentRepairs: [] },
    { id: 11, customerId: 3, inquiryNumber: "T-11", status: choice ? "部品待ち(注文済み)" : "作業完了", publicToken: tokenB, publicTokenCreatedAt: now, customer: { type: "individual" }, shipmentRepairs: [] },
  ];
  const decision: any = choice ? {
    customerId: 3, choice, requestOutbox: { status: "APPROVED", idempotencyKey: "intake-shipping-decision-request:7", inquiryId: 5, sourceRepairId: null },
    repairs: [{ repairId: 10, repairIntakeInviteId: 7, completedAtRequest: true }, { repairId: 11, repairIntakeInviteId: 7, completedAtRequest: false }],
  } : null;
  const invite: any = {
    id: 7, usedAt: now, revokedAt: null, customerId: 3, lineUserId: 4, inquiryId: 5,
    inquiry: { lineUserId: 4 }, lineUser: { linkedCustomerId: 3 },
    inquiryWatches: repairs.map(r => ({ inquiryWatch: { inquiryId: 5, promotedRepairId: r.id } })),
    repairs, shippingDecision: decision, deliveryPreferences: [] as any[],
  };
  let preferenceWrites = 0;
  let shipmentWrites = 0;
  const db: any = {
    repair: {
      findUnique: async ({ where }: any) => {
        const r = repairs.find(r => r.id === where.id || r.publicToken === where.publicToken);
        return r ? { ...r, repairIntakeInviteId: 7 } : null;
      },
      findMany: async () => repairs.map(r => ({ id: r.id })),
    },
    repairIntakeInvite: { findUnique: async () => invite },
    repairIntakeDeliveryPreference: { create: async ({ data }: any) => {
      preferenceWrites++;
      const preference = { ...data, repairs: data.repairs.create.map((r: any) => ({ ...r, repairIntakeInviteId: 7 })) };
      invite.deliveryPreferences.push(preference);
      return preference;
    } },
    shipment: { create: async () => { shipmentWrites++; }, update: async () => { shipmentWrites++; }, updateMany: async () => { shipmentWrites++; } },
    shipmentRepair: { create: async () => { shipmentWrites++; }, update: async () => { shipmentWrites++; } },
    $queryRaw: async () => [{ id: 3 }],
    $transaction: async (fn: any) => fn(db),
  };
  return { db, invite, repairs, decision, get preferenceWrites() { return preferenceWrites; }, get shipmentWrites() { return shipmentWrites; } };
}

test("SHIP_COMPLETED freezes only the request-time completed subset and does not write Shipment", async () => {
  const f = fixture("SHIP_COMPLETED");
  const shown = await getPublicIntakeDeliveryPreference(f.db, tokenB);
  assert.equal(shown.groupKind, "COMPLETED_AT_REQUEST");
  assert.deepEqual(shown.repairs, [{ inquiryNumber: "T-10" }]);
  const result = await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: shown.groupKind, mode: "NONE" }, now);
  assert.equal(result.groupKind, "COMPLETED_AT_REQUEST");
  assert.deepEqual(result.repairs, [{ inquiryNumber: "T-10" }]);
  assert.deepEqual(f.invite.deliveryPreferences[0].repairs.map((r: any) => r.repairId), [10]);
  assert.equal(f.preferenceWrites, 1);
  assert.equal(f.shipmentWrites, 0);
});

test("SHIP_COMPLETED saves a second disjoint group after remaining Repairs complete", async () => {
  const f = fixture("SHIP_COMPLETED");
  await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "COMPLETED_AT_REQUEST", mode: "NONE" }, now);
  const waiting = await getPublicIntakeDeliveryPreference(f.db, tokenB);
  assert.equal(waiting.groupKind, "REMAINING");
  assert.deepEqual(waiting.repairs, [{ inquiryNumber: "T-11" }]);
  assert.equal(waiting.available, false);
  f.repairs[1].status = "作業完了";
  const second = await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "REMAINING", mode: "TIME", timeSlot: "午前中" }, now);
  assert.deepEqual(second.repairs, [{ inquiryNumber: "T-11" }]);
  assert.equal(f.preferenceWrites, 2);
  assert.deepEqual(f.invite.deliveryPreferences.map((p: any) => [p.kind, p.repairs.map((r: any) => r.repairId)]),
    [["COMPLETED_AT_REQUEST", [10]], ["REMAINING", [11]]]);
  assert.equal(new Set(f.invite.deliveryPreferences.flatMap((p: any) => p.repairs.map((r: any) => r.repairId))).size, 2);
  await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "REMAINING", mode: "TIME", timeSlot: "午前中" }, now);
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "REMAINING", mode: "NONE" }, now),
    (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(f.preferenceWrites, 2);
  assert.equal(f.shipmentWrites, 0);
});

test("first-group retry cannot answer already complete remaining group", async () => {
  const f = fixture("SHIP_COMPLETED");
  f.repairs[1].status = "作業完了";
  const first = { groupKind: "COMPLETED_AT_REQUEST", mode: "NONE" };
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "REMAINING", mode: "NONE" }, now),
    (error: IntakeDeliveryPreferenceError) => error.status === 409);
  const saved = await savePublicIntakeDeliveryPreference(f.db, tokenA, first, now);
  assert.equal(saved.groupKind, "COMPLETED_AT_REQUEST");
  assert.deepEqual(saved.repairs, [{ inquiryNumber: "T-10" }]);
  assert.equal((await getPublicIntakeDeliveryPreference(f.db, tokenA)).groupKind, "REMAINING");
  const retried = await savePublicIntakeDeliveryPreference(f.db, tokenB, first, now);
  assert.equal(retried.groupKind, "COMPLETED_AT_REQUEST");
  assert.deepEqual(retried.repairs, [{ inquiryNumber: "T-10" }]);
  assert.equal(f.preferenceWrites, 1);
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA,
    { groupKind: "COMPLETED_AT_REQUEST", mode: "TIME", timeSlot: "午前中" }, now),
    (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(f.preferenceWrites, 1);
  const second = await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "REMAINING", mode: "NONE" }, now);
  assert.equal(second.groupKind, "REMAINING");
  assert.equal(f.preferenceWrites, 2);
  assert.equal(f.shipmentWrites, 0);
});

test("grouped POST requires a valid group selector and strict body", async () => {
  const f = fixture("SHIP_COMPLETED");
  for (const body of [{ mode: "NONE" }, { groupKind: "BOGUS", mode: "NONE" },
    { groupKind: "COMPLETED_AT_REQUEST", mode: "NONE", repairIds: [11] }]) {
    await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, body, now),
      (error: RepairDeliveryPreferenceError) => error.status === 400);
  }
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now),
    (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(f.preferenceWrites, 0);
});

test("exact prior-group active Shipment permits remaining answer; mixed and mismatched parcels fail", async () => {
  for (const shape of ["exact", "mixed", "unrelated", "wrongCustomer", "overlap"] as const) {
    const f = fixture("SHIP_COMPLETED");
    await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "COMPLETED_AT_REQUEST", mode: "NONE" }, now);
    f.repairs[1].status = "作業完了";
    const ids = shape === "mixed" ? [10, 11] : shape === "unrelated" ? [10, 99] : [10];
    const parcel = { id: 20, customerId: shape === "wrongCustomer" ? 99 : 3,
      direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null, repairs: ids.map(repairId => ({ repairId })) };
    f.repairs[0].shipmentRepairs.push({ shipment: parcel });
    if (shape === "mixed") f.repairs[1].shipmentRepairs.push({ shipment: parcel });
    if (shape === "overlap") {
      const overlapping = { ...parcel, id: 21, repairs: [{ repairId: 11 }] };
      f.repairs[1].shipmentRepairs.push({ shipment: overlapping });
    }
    if (shape === "exact") {
      await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "REMAINING", mode: "NONE" }, now);
      assert.equal(f.preferenceWrites, 2);
      assert.equal((await getPublicIntakeDeliveryPreference(f.db, tokenB)).available, true);
    } else {
      await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "REMAINING", mode: "NONE" }, now),
        (error: IntakeDeliveryPreferenceError) => error.status === 409);
      assert.equal(f.preferenceWrites, 1);
    }
    assert.equal(f.shipmentWrites, 0);
  }
});

test("strict grouped intake suppresses Task203 while preserving the grouped status path", async () => {
  const f = fixture();
  await assert.rejects(getPublicRepairDeliveryPreference(f.db, tokenA),
    (error: RepairDeliveryPreferenceError) => error.status === 404);
});

test("pending strict shipping decision suppresses Task203; unsupported intake falls back", async () => {
  const f = fixture("WAIT_ALL");
  f.decision.choice = null;
  assert.equal(await isGroupedDeliveryApplicable(f.db, tokenA), true);
  assert.equal((await getPublicIntakeDeliveryPreference(f.db, tokenA)).available, false);
  f.invite.inquiryWatches.pop();
  assert.equal(await isGroupedDeliveryApplicable(f.db, tokenA), false);
});

test("WAIT_ALL waits for every frozen member then records one full-group answer", async () => {
  const f = fixture("WAIT_ALL");
  const before = await getPublicIntakeDeliveryPreference(f.db, tokenA);
  assert.equal(before.visible, true);
  assert.equal(before.available, false);
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now), (error: IntakeDeliveryPreferenceError) => error.status === 409);
  f.repairs[1].status = "作業完了";
  const after = await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "ALL", mode: "TIME", timeSlot: "午前中" }, now);
  assert.equal(after.available, true);
  assert.deepEqual(after.repairs.map(r => r.inquiryNumber), ["T-10", "T-11"]);
  assert.equal(f.invite.deliveryPreferences[0].repairs.length, 2);
  assert.equal(f.shipmentWrites, 0);
});

test("all-complete group without Task210C decision uses one invite preference and grouped notice URL", async () => {
  const f = fixture();
  await assert.rejects(completionDeliveryPath(f.db, 10, null), (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(await completionDeliveryPath(f.db, 10, tokenA), `/customer/repairs/${tokenA}`);
  await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "DATE_TIME", date: "2026-10-13", timeSlot: "19時～21時" }, now);
  assert.deepEqual(f.invite.deliveryPreferences[0].repairs.map((r: any) => r.repairId), [10, 11]);
  assert.equal(f.preferenceWrites, 1);
  assert.equal(f.shipmentWrites, 0);
  assert.equal((await completionDeliveryPath(f.db, 10, tokenA))?.startsWith("/customer/repairs/"), true);
  f.repairs.splice(1, 1);
  assert.equal(await completionDeliveryPath(f.db, 10, tokenA), `/customer/delivery/${tokenA}`);
});

test("same answer is idempotent; different second answer is 409", async () => {
  const f = fixture();
  await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "DATE", date: "2026-10-13" }, now);
  await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "ALL", mode: "DATE", date: "2026-10-13" }, new Date("2026-10-15T10:00:00Z"));
  assert.equal(f.preferenceWrites, 1);
  await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now), (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(f.preferenceWrites, 1);
});

test("group uses Task203 modes and rejects invalid or Tokyo-past values", async () => {
  for (const input of [
    { mode: "NONE" }, { mode: "DATE", date: "2026-10-13" },
    { mode: "TIME", timeSlot: "午前中" }, { mode: "DATE_TIME", date: "2026-10-13", timeSlot: "19時～21時" },
  ]) {
    const f = fixture();
    await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", ...input }, now);
    assert.equal(f.preferenceWrites, 1);
  }
  for (const input of [
    { mode: "DATE", date: "2026-10-11" }, { mode: "TIME", timeSlot: "10時～12時" },
    { mode: "NONE", date: "2026-10-13" }, { mode: "DATE_TIME", date: "2026-10-13" },
  ]) {
    const f = fixture();
    await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", ...input }, now), RepairDeliveryPreferenceError);
    assert.equal(f.preferenceWrites, 0);
  }
});

test("invalid token, B2B, unrelated customer, missing tokens and malformed promotion fail closed", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => { f.repairs[0].customer.type = "business"; },
    (f: ReturnType<typeof fixture>) => { f.repairs[1].customerId = 99; },
    (f: ReturnType<typeof fixture>) => { f.repairs[1].publicToken = null; },
    (f: ReturnType<typeof fixture>) => { f.invite.inquiryWatches[1].inquiryWatch.promotedRepairId = 99; },
    (f: ReturnType<typeof fixture>) => { f.invite.inquiryWatches.pop(); },
    (f: ReturnType<typeof fixture>) => { f.invite.deliveryPreferences.push({ kind: "ALL", customerId: 3, repairs: [] }); },
  ];
  for (const change of cases) {
    const f = fixture(); change(f);
    await assert.rejects(getPublicIntakeDeliveryPreference(f.db, tokenA), IntakeDeliveryPreferenceError);
    await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now), IntakeDeliveryPreferenceError);
    assert.equal(f.preferenceWrites, 0);
    assert.equal(f.shipmentWrites, 0);
  }
  const f = fixture();
  await assert.rejects(getPublicIntakeDeliveryPreference(f.db, "invalid"), (error: IntakeDeliveryPreferenceError) => error.status === 404);
  await assert.rejects(getPublicIntakeDeliveryPreference(f.db, "abcdefghijklmnopqrstuvwx99999999"), (error: IntakeDeliveryPreferenceError) => error.status === 404);
});

test("active outbound Shipment and cancelled Repair block grouped answer", async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.repairs[0].shipmentRepairs.push({ shipment: { id: 20, customerId: 3, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null, repairs: [{ repairId: 10 }] } }); },
    (f: ReturnType<typeof fixture>) => { f.repairs[1].status = "キャンセル"; },
  ]) {
    const f = fixture(); change(f);
    await assert.rejects(savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now), (error: IntakeDeliveryPreferenceError) => error.status === 409);
    assert.equal(f.preferenceWrites, 0);
    assert.equal(f.shipmentWrites, 0);
  }
});

test("saved preference remains readable and duplicate-safe with an exact outbound Shipment", async () => {
  const f = fixture();
  await savePublicIntakeDeliveryPreference(f.db, tokenA, { groupKind: "ALL", mode: "NONE" }, now);
  const parcel = { id: 20, customerId: 3, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null, repairs: [{ repairId: 10 }, { repairId: 11 }] };
  f.repairs[0].shipmentRepairs.push({ shipment: parcel });
  f.repairs[1].shipmentRepairs.push({ shipment: parcel });
  assert.deepEqual((await getPublicIntakeDeliveryPreference(f.db, tokenB)).repairs.map(r => r.inquiryNumber), ["T-10", "T-11"]);
  await savePublicIntakeDeliveryPreference(f.db, tokenB, { groupKind: "ALL", mode: "NONE" }, now);
  assert.equal(f.preferenceWrites, 1);
  parcel.repairs.pop();
  await assert.rejects(getPublicIntakeDeliveryPreference(f.db, tokenA), (error: IntakeDeliveryPreferenceError) => error.status === 409);
  assert.equal(f.shipmentWrites, 0);
});
