import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  canEditDeliveryShipment, deliveryPatchPayload, getRepairDeliveryShipments,
  initialDeliveryShipmentId, RepairDeliveryRequestNotFoundError,
} from "./repair-delivery-request";
import { YUPURI_DELIVERY_TIME_OPTIONS, yupuriTimeCode } from "./yupuri-v3";

function fakeDb(rows: Array<Record<string, unknown>>, exists = true) {
  let query: unknown;
  const db = {
    repair: { findUnique: async () => exists ? { id: 8 } : null },
    shipment: { findMany: async (args: unknown) => { query = args; return rows; } },
  };
  return { db: db as unknown as PrismaClient, getQuery: () => query };
}

const row = (id: number, status = "DRAFT") => ({
  id, status, plannedShipDate: new Date("2026-10-05T00:00:00.000Z"),
  requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
  repairs: [{ repair: { inquiryNumber: `R-${id}` } }],
});

test("missing Repair is 404 and zero shipments is a valid empty state", async () => {
  await assert.rejects(getRepairDeliveryShipments(fakeDb([], false).db, 8), RepairDeliveryRequestNotFoundError);
  assert.deepEqual(await getRepairDeliveryShipments(fakeDb([]).db, 8), []);
});

test("one or multiple shipments retain parcel identity and shared Repair numbers", async () => {
  const single = fakeDb([row(2)]);
  assert.deepEqual(await getRepairDeliveryShipments(single.db, 8), [{
    id: 2, status: "DRAFT", plannedShipDate: "2026-10-05",
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: null, inquiryNumbers: ["R-2"],
  }]);
  const multiple = fakeDb([row(2), { ...row(3, "READY"), repairs: [
    { repair: { inquiryNumber: "R-3" } }, { repair: { inquiryNumber: "R-4" } },
  ] }]);
  const result = await getRepairDeliveryShipments(multiple.db, 8);
  assert.deepEqual(result.map(item => [item.id, item.status, item.inquiryNumbers]), [
    [2, "DRAFT", ["R-2"]], [3, "READY", ["R-3", "R-4"]],
  ]);
});

test("candidate query is linked to the server Repair ID and excludes inbound, shipped, cancelled", async () => {
  const instance = fakeDb([]);
  await getRepairDeliveryShipments(instance.db, 8);
  assert.deepEqual((instance.getQuery() as { where: unknown }).where, {
    direction: "OUTBOUND", actualShippedAt: null,
    status: { not: "CANCELLED" }, repairs: { some: { repairId: 8 } },
  });
});

test("zero or multiple candidates start without a selection; only DRAFT is editable", () => {
  assert.equal(initialDeliveryShipmentId([]), null);
  assert.equal(initialDeliveryShipmentId([{ id: 7 }]), 7);
  assert.equal(initialDeliveryShipmentId([{ id: 7 }, { id: 8 }]), null);
  assert.equal(canEditDeliveryShipment({ status: "DRAFT" }), true);
  assert.equal(canEditDeliveryShipment({ status: "READY" }), false);
});

test("delivery PATCH body contains only the two Shipment delivery fields", () => {
  assert.deepEqual(deliveryPatchPayload("2026-10-07", "午前中"), {
    requestedDeliveryDate: "2026-10-07", requestedDeliveryTimeSlot: "午前中",
  });
  assert.deepEqual(deliveryPatchPayload("", ""), {
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
  });
  assert.equal(YUPURI_DELIVERY_TIME_OPTIONS[0].value, "指定なし");
  for (const option of YUPURI_DELIVERY_TIME_OPTIONS) assert.ok(yupuriTimeCode(option.value));
});