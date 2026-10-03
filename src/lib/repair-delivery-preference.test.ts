import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  getPublicRepairDeliveryPreference,
  parseDeliveryPreferenceInput,
  RepairDeliveryPreferenceError,
  savePublicRepairDeliveryPreference,
} from "./repair-delivery-preference";

const token = "abcdefghijklmnopqrstuvwx12345678";
const now = new Date("2026-10-03T07:00:00.000Z");

function shipment(id: number, repairIds = [1], extra: Record<string, unknown> = {}) {
  return {
    id, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
    requestedDeliveryDate: null as Date | null, requestedDeliveryTimeSlot: null as string | null,
    repairs: repairIds.map(repairId => ({ repairId })), ...extra,
  };
}

type FakeOptions = {
  shipments?: ReturnType<typeof shipment>[];
  completionIntent?: boolean;
  customerType?: "individual" | "business";
};
function fakeDb(options: FakeOptions = {}) {
  const state: any = {
    preference: null,
    writes: 0,
    shipmentWrites: 0,
    shipments: options.shipments ?? [],
  };
  const repairRow = () => ({
    id: 1,
    customer: { type: options.customerType ?? "individual" },
    deliveryPreference: state.preference,
    lineManagerSendOutboxes: options.completionIntent === false ? [] : [
      { idempotencyKey: "repair-completion-notice:1", status: "APPROVED" },
    ],
    shipmentRepairs: state.shipments.map((item: any) => ({ shipment: item })),
  });
  const client: any = {
    repair: {
      findUnique: async ({ where }: any) => where.publicToken === token || where.id === 1 ? repairRow() : null,
      findUniqueOrThrow: async () => repairRow(),
    },
    repairDeliveryPreference: {
      upsert: async ({ create, update }: any) => {
        state.writes++;
        const values = state.preference ? update : create;
        state.preference = {
          requestedDeliveryDate: values.requestedDeliveryDate,
          requestedDeliveryTimeSlot: values.requestedDeliveryTimeSlot,
          respondedAt: values.respondedAt,
        };
        return state.preference;
      },
    },
    shipment: {
      updateMany: async ({ where, data }: any) => {
        const target = state.shipments.find((item: any) =>
          item.id === where.id && item.status === "DRAFT" && item.actualShippedAt === null);
        if (!target) return { count: 0 };
        state.shipmentWrites++;
        Object.assign(target, data);
        return { count: 1 };
      },
    },
  };
  client.$transaction = async (fn: (tx: any) => Promise<unknown>) => fn(client);
  return { client: client as PrismaClient, state };
}

test("delivery preference modes normalize to Shipment-compatible values", () => {
  assert.deepEqual(parseDeliveryPreferenceInput({ mode: "NONE", date: "", timeSlot: "" }, now), {
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: "指定なし",
  });
  assert.equal(parseDeliveryPreferenceInput({ mode: "DATE", date: "2026-10-04", timeSlot: "" }, now).requestedDeliveryTimeSlot, "指定なし");
  assert.equal(parseDeliveryPreferenceInput({ mode: "TIME", date: "", timeSlot: "午前中" }, now).requestedDeliveryTimeSlot, "午前中");
  const both = parseDeliveryPreferenceInput({ mode: "DATE_TIME", date: "2026-10-05", timeSlot: "19時～21時" }, now);
  assert.equal(both.requestedDeliveryDate?.toISOString().slice(0, 10), "2026-10-05");
  assert.equal(both.requestedDeliveryTimeSlot, "19時～21時");
});

test("delivery preference parser rejects past, unsupported, and inconsistent answers", () => {
  for (const input of [
    { mode: "DATE", date: "2026-10-02", timeSlot: "" },
    { mode: "TIME", date: "", timeSlot: "10時～12時" },
    { mode: "NONE", date: "2026-10-04", timeSlot: "" },
    { mode: "DATE_TIME", date: "2026-10-04", timeSlot: "" },
  ]) assert.throws(() => parseDeliveryPreferenceInput(input, now), RepairDeliveryPreferenceError);
});

test("public page is gated by B2C and a completion notice intent", async () => {
  for (const instance of [
    fakeDb({ completionIntent: false }),
    fakeDb({ customerType: "business" }),
  ]) {
    await assert.rejects(getPublicRepairDeliveryPreference(instance.client, token),
      (error: RepairDeliveryPreferenceError) => error.status === 404);
  }
});

test("response is retained without a Shipment and reports pending", async () => {
  const instance = fakeDb();
  const result = await savePublicRepairDeliveryPreference(instance.client, token,
    { mode: "DATE", date: "2026-10-04", timeSlot: "" }, now);
  assert.equal(instance.state.writes, 1);
  assert.equal(instance.state.shipmentWrites, 0);
  assert.equal(result.applicationStatus, "PENDING_NO_SHIPMENT");
  assert.equal(result.preference?.requestedDeliveryDate, "2026-10-04");
});

test("exactly one DRAFT single-Repair Shipment receives the answer atomically", async () => {
  const target = shipment(10);
  const instance = fakeDb({ shipments: [target] });
  const result = await savePublicRepairDeliveryPreference(instance.client, token,
    { mode: "TIME", date: "", timeSlot: "午前中" }, now);
  assert.equal(instance.state.shipmentWrites, 1);
  assert.equal(target.requestedDeliveryTimeSlot, "午前中");
  assert.equal(result.applicationStatus, "APPLIED");
});

test("multiple or multi-Repair Shipments never auto-select a parcel", async () => {
  for (const shipments of [[shipment(10), shipment(11)], [shipment(10, [1, 2])]]) {
    const instance = fakeDb({ shipments });
    const result = await savePublicRepairDeliveryPreference(instance.client, token,
      { mode: "NONE", date: "", timeSlot: "" }, now);
    assert.equal(instance.state.writes, 1);
    assert.equal(instance.state.shipmentWrites, 0);
    assert.match(result.applicationStatus, /^PENDING_/);
  }
});

test("historical shipped parcel does not lock a current DRAFT parcel", async () => {
  const historical = shipment(10, [1], { status: "SHIPPED", actualShippedAt: new Date("2026-10-01T00:00:00Z") });
  const current = shipment(11);
  const instance = fakeDb({ shipments: [historical, current] });
  const result = await savePublicRepairDeliveryPreference(instance.client, token,
    { mode: "TIME", date: "", timeSlot: "午前中" }, now);
  assert.equal(instance.state.shipmentWrites, 1);
  assert.equal(current.requestedDeliveryTimeSlot, "午前中");
  assert.equal(historical.requestedDeliveryTimeSlot, null);
  assert.equal(result.applicationStatus, "APPLIED");
});

test("progressed outbound Shipment locks public changes before preference mutation", async () => {
  const instance = fakeDb({ shipments: [shipment(10, [1], { status: "READY" })] });
  await assert.rejects(savePublicRepairDeliveryPreference(instance.client, token,
    { mode: "NONE", date: "", timeSlot: "" }, now),
  (error: RepairDeliveryPreferenceError) => error.status === 409);
  assert.equal(instance.state.writes, 0);
  assert.equal(instance.state.shipmentWrites, 0);
});
