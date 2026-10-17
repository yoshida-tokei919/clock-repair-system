import assert from "node:assert/strict";
import test from "node:test";
import { finalizeDeliveredShipmentRepairs, syncJapanPostTrackingDeliveryFlow } from "./japan-post-delivery-completion";

const d1 = new Date("2026-10-13T01:00:00.000Z");
const d2 = new Date("2026-10-14T02:00:00.000Z");

type RepairState = {
  id: number;
  status: string;
  deliveryDateActual: Date | null;
  shipments: Array<{ direction: string; status: string; deliveredAt: Date | null }>;
};

function fixture(repairOverrides: Partial<RepairState> = {}, shipmentOverrides: Record<string, unknown> = {}) {
  const repair: RepairState = {
    id: 10,
    status: "作業完了",
    deliveryDateActual: null,
    shipments: [{ direction: "OUTBOUND", status: "DELIVERED", deliveredAt: d1 }],
    ...repairOverrides,
  };
  const shipment = {
    id: 7,
    direction: "OUTBOUND",
    status: "DELIVERED",
    deliveredAt: d1,
    repairs: [{ repairId: repair.id }],
    ...shipmentOverrides,
  };
  const updates: any[] = [];
  const logs: any[] = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 1 }],
    shipment: { findUnique: async ({ where }: any) => where.id === shipment.id ? shipment : null },
    repair: {
      findUnique: async ({ where }: any) => where.id === repair.id ? {
        id: repair.id,
        status: repair.status,
        deliveryDateActual: repair.deliveryDateActual,
        shipmentRepairs: repair.shipments.map(value => ({ shipment: value })),
      } : null,
      update: async ({ data }: any) => {
        updates.push(data);
        repair.status = data.status;
        repair.deliveryDateActual = data.deliveryDateActual;
        return repair;
      },
    },
    repairStatusLog: { create: async ({ data }: any) => { logs.push(data); return data; } },
  };
  const db: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  return { db, repair, shipment, updates, logs };
}

test("final delivered outbound Shipment marks a completed Repair delivered with audit log", async () => {
  const f = fixture();
  const result = await finalizeDeliveredShipmentRepairs(f.db, 7);
  assert.deepEqual(result, [{ shipmentId: 7, repairId: 10, outcome: "UPDATED", deliveryDateActual: d1.toISOString() }]);
  assert.equal(f.repair.status, "納品済み");
  assert.equal(f.repair.deliveryDateActual?.toISOString(), d1.toISOString());
  assert.equal(f.updates.length, 1);
  assert.deepEqual(f.logs, [{ repairId: 10, status: "納品済み", changedBy: null }]);
});

test("delivered outbound return Shipment closes dedicated return statuses as delivered", async () => {
  for (const status of ["修理不可返却", "キャンセル返却"]) {
    const f = fixture({ status });
    const result = await finalizeDeliveredShipmentRepairs(f.db, 7);
    assert.equal(result[0]?.outcome, "UPDATED");
    assert.equal(f.repair.status, "納品済み");
    assert.equal(f.repair.deliveryDateActual?.toISOString(), d1.toISOString());
    assert.deepEqual(f.logs, [{ repairId: 10, status: "納品済み", changedBy: null }]);
  }
});

test("Repair waits until every non-cancelled outbound Shipment is delivered", async () => {
  const f = fixture({
    shipments: [
      { direction: "OUTBOUND", status: "DELIVERED", deliveredAt: d1 },
      { direction: "OUTBOUND", status: "IN_TRANSIT", deliveredAt: null },
    ],
  });
  assert.deepEqual(await finalizeDeliveredShipmentRepairs(f.db, 7), [
    { shipmentId: 7, repairId: 10, outcome: "SKIPPED", reason: "outstanding_shipments" },
  ]);
  assert.equal(f.updates.length, 0);
  assert.equal(f.logs.length, 0);
});

test("cancelled and inbound history do not block, and latest deliveredAt becomes deliveryDateActual", async () => {
  const f = fixture({
    shipments: [
      { direction: "OUTBOUND", status: "DELIVERED", deliveredAt: d1 },
      { direction: "OUTBOUND", status: "DELIVERED", deliveredAt: d2 },
      { direction: "OUTBOUND", status: "CANCELLED", deliveredAt: null },
      { direction: "INBOUND", status: "SHIPPED", deliveredAt: null },
    ],
  });
  const result = await finalizeDeliveredShipmentRepairs(f.db, 7);
  assert.equal(result[0]?.outcome, "UPDATED");
  assert.equal(result[0]?.deliveryDateActual, d2.toISOString());
});

test("non-completed Repair is never overwritten and already delivered Repair is idempotent", async () => {
  const changed = fixture({ status: "作業中" });
  assert.deepEqual(await finalizeDeliveredShipmentRepairs(changed.db, 7), [
    { shipmentId: 7, repairId: 10, outcome: "SKIPPED", reason: "repair_status_changed" },
  ]);
  assert.equal(changed.updates.length, 0);

  const done = fixture({ status: "納品済み", deliveryDateActual: d1 });
  assert.deepEqual(await finalizeDeliveredShipmentRepairs(done.db, 7), [
    { shipmentId: 7, repairId: 10, outcome: "NO_CHANGE", deliveryDateActual: d1.toISOString() },
  ]);
  assert.equal(done.updates.length, 0);
  assert.equal(done.logs.length, 0);
});

test("tracking flow finalizes only confirmed DELIVERED rows and surfaces finalize failure", async () => {
  const tracking: any[] = [
    { shipmentId: 7, state: "DELIVERED", outcome: "UPDATED", deliveredAt: d1.toISOString() },
    { shipmentId: 8, state: "IN_TRANSIT", outcome: "UPDATED", deliveredAt: null },
    { shipmentId: 9, state: "DELIVERED", outcome: "SKIPPED", deliveredAt: d1.toISOString() },
  ];
  const calls: number[] = [];
  const sync = async () => ({ tracking, notices: [] });
  const finalize = async (_db: any, shipmentId: number) => {
    calls.push(shipmentId);
    throw new Error("synthetic failure");
  };
  await assert.rejects(
    syncJapanPostTrackingDeliveryFlow({} as any, Buffer.from("csv"), sync as any, finalize as any),
    /synthetic failure/,
  );
  assert.deepEqual(calls, [7]);
});
