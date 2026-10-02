import assert from "node:assert/strict";
import test from "node:test";
import { shipmentRepairSummary, shipmentScheduleGroup, tokyoDateKey } from "./shipment-schedule";

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
