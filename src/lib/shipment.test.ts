import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createShipment, parseShipmentCreate, parseShipmentUpdate, readShipment, ShipmentError, updateShipment } from "./shipment";

const address = {
  returnRecipientName: "山田 太郎", returnPostalCode: "1000001", returnPrefecture: "東京都",
  returnCity: "千代田区", returnStreet: "千代田1-1", returnBuilding: null, returnPhone: "0312345678",
};
const repair = (id: number, extra = {}) => ({
  id, customerId: 4, customer: { type: "individual" }, ...address, shipmentRepairs: [], ...extra,
});

function fakeDb(rows = [repair(1), repair(2)]) {
  const writes: unknown[] = [];
  const client = {
    repair: { findMany: async () => rows },
    shipment: {
      create: async (args: unknown) => { writes.push(args); return { id: 10 }; },
      findUnique: async () => null as unknown,
      findUniqueOrThrow: async () => ({ id: 10 }),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { client: client as unknown as PrismaClient, writes };
}

test("create input requires explicit confirmation and never accepts customer or status", () => {
  assert.throws(() => parseShipmentCreate({ repairIds: [1] }), ShipmentError);
  assert.throws(() => parseShipmentCreate({ repairIds: [], confirmed: true }), ShipmentError);
  assert.throws(() => parseShipmentCreate({ repairIds: [1], confirmed: true, customerId: 4 }), ShipmentError);
  assert.throws(() => parseShipmentCreate({ repairIds: [1], confirmed: true, status: "SHIPPED" }), ShipmentError);
  assert.deepEqual(parseShipmentCreate({ repairIds: [1, 1, 2], confirmed: true }), { repairIds: [1, 2], confirmed: true });
});

test("create validates selected Repairs and return snapshots before writing", async () => {
  const input = parseShipmentCreate({ repairIds: [1, 2], confirmed: true });
  await assert.rejects(createShipment(fakeDb([repair(1)]).client, input), (error: ShipmentError) => error.status === 404);
  await assert.rejects(createShipment(fakeDb([repair(1), repair(2, { customerId: 5 })]).client, input),
    (error: ShipmentError) => error.status === 409);
  await assert.rejects(createShipment(fakeDb([repair(1), repair(2, { returnStreet: "別住所" })]).client, input),
    (error: ShipmentError) => error.status === 409);
  await assert.rejects(createShipment(fakeDb([repair(1), repair(2, { returnPhone: null })]).client, input),
    (error: ShipmentError) => error.status === 409);
  const missingBusinessAddress = fakeDb([
    repair(1, { customer: { type: "business" }, returnStreet: null }),
    repair(2, { customer: { type: "business" } }),
  ]);
  await assert.rejects(createShipment(missingBusinessAddress.client, input),
    (error: ShipmentError) => error.status === 409);
  assert.equal(missingBusinessAddress.writes.length, 0);
  const incompleteBusinessAddress = fakeDb([
    repair(1, { customer: { type: "business" } }),
    repair(2, { customer: { type: "business" }, returnPostalCode: "invalid" }),
  ]);
  await assert.rejects(createShipment(incompleteBusinessAddress.client, input),
    (error: ShipmentError) => error.status === 409);
  assert.equal(incompleteBusinessAddress.writes.length, 0);
});

test("business Repairs with complete matching return snapshots can be shipped", async () => {
  const instance = fakeDb([repair(1, { customer: { type: "business" } }), repair(2, { customer: { type: "business" } })]);
  const input = parseShipmentCreate({ repairIds: [1, 2], confirmed: true });
  assert.deepEqual(await createShipment(instance.client, input), { id: 10 });
  assert.equal(instance.writes.length, 1);
  const created = instance.writes[0] as { data: Record<string, unknown> };
  assert.equal(created.data.customerId, 4);
  assert.equal(created.data.destinationRecipientName, address.returnRecipientName);
  assert.equal(created.data.destinationPostalCode, address.returnPostalCode);
  assert.equal(created.data.destinationPhone, address.returnPhone);
});

test("create saves one OUTBOUND DRAFT parcel and both joins in one transaction", async () => {
  const instance = fakeDb();
  const input = parseShipmentCreate({ repairIds: [1, 2], confirmed: true });
  await assert.rejects(createShipment(instance.client, { ...input, confirmed: false as true }),
    (error: ShipmentError) => error.status === 400);
  assert.equal(instance.writes.length, 0);
  assert.deepEqual(await createShipment(instance.client, input), { id: 10 });
  const created = instance.writes[0] as { data: Record<string, any> };
  assert.equal(created.data.customerId, 4);
  assert.equal(created.data.direction, "OUTBOUND");
  assert.equal(created.data.status, "DRAFT");
  assert.equal(created.data.destinationRecipientName, "山田 太郎");
  assert.deepEqual(created.data.repairs.create, [
    { repair: { connect: { id: 1 } } }, { repair: { connect: { id: 2 } } },
  ]);
});

test("single-Repair Shipment inherits a stored customer delivery preference", async () => {
  const preference = {
    requestedDeliveryDate: new Date("2026-10-06T00:00:00.000Z"),
    requestedDeliveryTimeSlot: "午前中",
  };
  const instance = fakeDb([repair(1, { deliveryPreference: preference })]);
  await createShipment(instance.client, parseShipmentCreate({ repairIds: [1], confirmed: true }), new Date("2026-10-03T01:00:00Z"));
  const created = instance.writes[0] as { data: Record<string, any> };
  assert.equal(created.data.requestedDeliveryDate, preference.requestedDeliveryDate);
  assert.equal(created.data.requestedDeliveryTimeSlot, "午前中");
});

test("single-Repair Shipment does not inherit an expired stored delivery date", async () => {
  const preference = {
    requestedDeliveryDate: new Date("2026-10-02T00:00:00.000Z"),
    requestedDeliveryTimeSlot: "午前中",
  };
  const instance = fakeDb([repair(1, { deliveryPreference: preference })]);
  await createShipment(instance.client, parseShipmentCreate({ repairIds: [1], confirmed: true }), new Date("2026-10-03T01:00:00Z"));
  const created = instance.writes[0] as { data: Record<string, any> };
  assert.equal(created.data.requestedDeliveryDate, null);
  assert.equal(created.data.requestedDeliveryTimeSlot, null);
});

test("single-Repair Shipment does not inherit a preference when another active outbound parcel already exists", async () => {
  const preference = {
    requestedDeliveryDate: new Date("2026-10-06T00:00:00.000Z"),
    requestedDeliveryTimeSlot: "午前中",
  };
  const instance = fakeDb([repair(1, {
    deliveryPreference: preference,
    shipmentRepairs: [{ shipment: { direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null } }],
  })]);
  await createShipment(instance.client, parseShipmentCreate({ repairIds: [1], confirmed: true }));
  const created = instance.writes[0] as { data: Record<string, any> };
  assert.equal(created.data.requestedDeliveryDate, null);
  assert.equal(created.data.requestedDeliveryTimeSlot, null);
});

test("cancelled or already-shipped historical parcels do not block a later single-Repair preference", async () => {
  const preference = { requestedDeliveryDate: null, requestedDeliveryTimeSlot: "午前中" };
  for (const shipment of [
    { direction: "OUTBOUND", status: "CANCELLED", actualShippedAt: null },
    { direction: "OUTBOUND", status: "SHIPPED", actualShippedAt: new Date("2026-10-01T00:00:00Z") },
    { direction: "INBOUND", status: "DRAFT", actualShippedAt: null },
  ]) {
    const instance = fakeDb([repair(1, { deliveryPreference: preference, shipmentRepairs: [{ shipment }] })]);
    await createShipment(instance.client, parseShipmentCreate({ repairIds: [1], confirmed: true }));
    const created = instance.writes[0] as { data: Record<string, any> };
    assert.equal(created.data.requestedDeliveryTimeSlot, "午前中");
  }
});

test("multi-Repair Shipment never auto-applies Repair-specific delivery preferences", async () => {
  const preference = { requestedDeliveryDate: null, requestedDeliveryTimeSlot: "午前中" };
  const instance = fakeDb([
    repair(1, { deliveryPreference: preference }),
    repair(2, { deliveryPreference: preference }),
  ]);
  await createShipment(instance.client, parseShipmentCreate({ repairIds: [1, 2], confirmed: true }));
  const created = instance.writes[0] as { data: Record<string, any> };
  assert.equal(created.data.requestedDeliveryDate, null);
  assert.equal(created.data.requestedDeliveryTimeSlot, null);
});

test("read includes relations; update only permits planning fields on DRAFT", async () => {
  assert.throws(() => parseShipmentUpdate({ trackingNumber: "x" }), ShipmentError);
  assert.throws(() => parseShipmentUpdate({ status: "SHIPPED" }), ShipmentError);
  assert.throws(() => parseShipmentUpdate({ plannedShipDate: "2026-02-30" }), ShipmentError);
  const data = parseShipmentUpdate({ plannedShipDate: "2026-10-03", carrierCode: "JP" });
  const instance = fakeDb();
  let where: unknown;
  instance.client.shipment.updateMany = (async (args: { where: unknown }) => {
    where = args.where; return { count: 0 };
  }) as unknown as typeof instance.client.shipment.updateMany;
  await assert.rejects(updateShipment(instance.client, 10, data), (error: ShipmentError) => error.status === 404);
  assert.deepEqual(where, { id: 10, status: "DRAFT" });
  instance.client.shipment.findUnique = (async () => ({ id: 10 })) as unknown as typeof instance.client.shipment.findUnique;
  await assert.rejects(updateShipment(instance.client, 10, data), (error: ShipmentError) => error.status === 409);
  const detail = { id: 10, customer: { id: 4 }, repairs: [{ repairId: 1 }] };
  instance.client.shipment.findUnique = (async () => detail) as unknown as typeof instance.client.shipment.findUnique;
  assert.deepEqual(await readShipment(instance.client, 10), detail);
});

test("planning update accepts clearing optional fields and rejects malformed input", () => {
  assert.deepEqual(parseShipmentUpdate({
    plannedShipDate: null, carrierCode: null, serviceCode: null, handoffMethod: null,
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
  }), {
    plannedShipDate: null, carrierCode: null, serviceCode: null, handoffMethod: null,
    requestedDeliveryDate: null, requestedDeliveryTimeSlot: null,
  });
  for (const input of [
    {}, { plannedShipDate: "2026-13-01" }, { plannedShipDate: "" },
    { handoffMethod: "INVALID" }, { carrierCode: " " }, { requestedDeliveryTimeSlot: 123 },
  ]) {
    assert.throws(() => parseShipmentUpdate(input), (error: ShipmentError) => error.status === 400);
  }
});
