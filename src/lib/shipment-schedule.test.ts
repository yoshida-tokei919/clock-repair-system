import assert from "node:assert/strict";
import test from "node:test";
import { activePhysicalTag, activeStorageLocation, sameCustomerShipmentContext, shipmentRepairSummary, shipmentScheduleGroup, tokyoDateKey } from "./shipment-schedule";

test("Tokyo date changes at local midnight", () => {
  assert.equal(tokyoDateKey(new Date("2026-10-01T14:59:59Z")), "2026-10-01");
  assert.equal(tokyoDateKey(new Date("2026-10-01T15:00:00Z")), "2026-10-02");
});

test("schedule groups respect Monday week boundaries and priority of tomorrow", () => {
  const group = (date: string | null, today = "2026-10-02") => shipmentScheduleGroup(date, today, "DRAFT", null);
  assert.equal(group("2026-10-01"), "OVERDUE");
  assert.equal(group("2026-10-02"), "TODAY");
  assert.equal(group("2026-10-03"), "TOMORROW");
  assert.equal(group("2026-10-04"), "THIS_WEEK");
  assert.equal(group("2026-10-05"), "NEXT_WEEK");
  assert.equal(group("2026-10-12"), "LATER");
  assert.equal(group(null), "UNPLANNED");
  assert.equal(group("2026-10-05", "2026-10-04"), "TOMORROW");
});

test("cancelled and actually shipped parcels are excluded from schedule and overdue", () => {
  assert.equal(shipmentScheduleGroup("2026-09-30", "2026-10-02", "CANCELLED", null), null);
  assert.equal(shipmentScheduleGroup("2026-09-30", "2026-10-02", "SHIPPED", "2026-10-01T12:00:00Z"), null);
  assert.equal(shipmentScheduleGroup("2026-09-30", "2026-10-02", "DRAFT", null), "OVERDUE");
});

test("Repair and delivery-note aggregate states retain partial completion", () => {
  const repair = (status: string, deliveryNoteId: number | null) => ({ repair: { status, deliveryNoteId } });
  assert.deepEqual(shipmentRepairSummary([repair("作業完了", 3), repair("作業中", null)]), {
    total: 2, workCompleted: 1, notesIssued: 1, deliveryNoteState: "一部発行済み",
  });
  assert.equal(shipmentRepairSummary([repair("作業完了", 3)]).deliveryNoteState, "全件発行済み");
  assert.equal(shipmentRepairSummary([repair("作業中", null)]).deliveryNoteState, "未発行");
});

test("only active location and PhysicalTag assignments supply preparation context", () => {
  const releasedAt = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(activeStorageLocation([
    { releasedAt, storageLocation: { name: "旧棚", shortCode: "OLD", locationType: "SHELF" } },
    { releasedAt: null, storageLocation: { name: "発送・引渡し待ち", shortCode: "SHIP", locationType: "ZONE" } },
  ]), { name: "発送・引渡し待ち", shortCode: "SHIP", locationType: "ZONE" });
  assert.deepEqual(activePhysicalTag([
    { releasedAt, physicalTag: { shortCode: "PT-000001" } },
    { releasedAt: null, physicalTag: { shortCode: "PT-000002" } },
  ]), { shortCode: "PT-000002" });
  assert.equal(activeStorageLocation([{ releasedAt, storageLocation: { name: "旧棚" } }]), null);
  assert.equal(activePhysicalTag([]), null);
});

test("same-customer context excludes self, other customers, inbound, cancelled, and shipped parcels", () => {
  const row = (id: number, customerId: number, plannedShipDate: string | null, overrides = {}) => ({
    id, customer: { id: customerId }, direction: "OUTBOUND" as const, status: "DRAFT" as const,
    actualShippedAt: null as string | null, plannedShipDate, ...overrides,
  });
  const current = row(1, 5, "2026-10-02");
  const context = sameCustomerShipmentContext(current, [
    current, row(2, 6, "2026-10-03"), row(3, 5, "2026-10-03", { direction: "INBOUND" }),
    row(4, 5, "2026-10-03", { status: "CANCELLED" }),
    row(5, 5, "2026-10-03", { actualShippedAt: "2026-10-03T00:00:00Z" }),
    row(6, 5, "2026-10-03"),
  ]);
  assert.deepEqual(context.map(({ shipment }) => shipment.id), [6]);
});

test("calendar date differences are neutral context with no distance threshold or ranking", () => {
  const row = (id: number, plannedShipDate: string | null) => ({
    id, customer: { id: 5 }, direction: "OUTBOUND" as const, status: "DRAFT" as const,
    actualShippedAt: null, plannedShipDate,
  });
  const current = row(1, "2024-02-28");
  const context = sameCustomerShipmentContext(current, [
    row(2, "2024-03-01"), row(3, "2023-01-01"), row(4, null), row(5, "2024-02-29"),
  ]);
  assert.deepEqual(context.map(({ shipment, dayDifference }) => [shipment.id, dayDifference]), [
    [2, 2], [3, -423], [4, null], [5, 1],
  ]);
  assert.equal(sameCustomerShipmentContext(row(6, null), [row(7, "2024-03-01")])[0].dayDifference, null);
});
