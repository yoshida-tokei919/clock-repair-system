import assert from "node:assert/strict";
import test from "node:test";
import {
  addSelection, combineScanResults, enqueueQueuedScan, MAX_LOCATION_MOVE_REPAIRS, MAX_QUEUED_SCANS,
  nextQueuedScan, scanCandidates, scanPhase, SCAN_DEBOUNCE_MS, shouldDebounceScan, timerDecision, type SelectedRepair,
} from "./scan-session-domain";

const repair: SelectedRepair = {
  repairId: 12, inquiryNumber: "T-12", customerId: 3, physicalTagId: 4, shortCode: "PT-000004",
};

test("raw scan candidates use only approved short code, opaque QR and complete hex-byte grammar", () => {
  assert.deepEqual(scanCandidates(" PT-000004 "), [{ type: "SHORT_CODE", value: "PT-000004" }]);
  assert.deepEqual(scanCandidates(" PT-12345 "), [{ type: "QR_TOKEN", value: "PT-12345" }]);
  assert.deepEqual(scanCandidates(" 04:33:3f "), [
    { type: "QR_TOKEN", value: "04:33:3f" }, { type: "NFC_UID", value: "04333F" },
  ]);
  assert.deepEqual(scanCandidates("04:33:"), [{ type: "QR_TOKEN", value: "04:33:" }]);
  assert.deepEqual(scanCandidates("1234567"), [{ type: "QR_TOKEN", value: "1234567" }]);
  assert.deepEqual(scanCandidates(" "), []);
});

test("scan result combination rejects collisions and inconsistent same-tag statuses", () => {
  const resolved = { status: "RESOLVED" as const, ...repair };
  assert.deepEqual(combineScanResults([{ status: "NOT_FOUND" }, resolved]), resolved);
  assert.deepEqual(combineScanResults([resolved, resolved]), resolved);
  assert.deepEqual(combineScanResults([{ status: "NOT_FOUND" }]), { status: "NOT_FOUND" });
  assert.deepEqual(combineScanResults([resolved, { ...resolved, physicalTagId: 5 }]), { status: "AMBIGUOUS" });
  assert.deepEqual(combineScanResults([resolved, { status: "RETIRED", physicalTagId: 4, shortCode: repair.shortCode }]),
    { status: "AMBIGUOUS" });
  assert.deepEqual(combineScanResults([resolved, { ...resolved, repairId: 99 }]), { status: "AMBIGUOUS" });
});

test("selection guards duplicates and mixed customers only for delivery and shipment", () => {
  const other = { ...repair, repairId: 13, physicalTagId: 5, customerId: 8 };
  assert.equal(addSelection("BATCH_SELECT", [repair], other).outcome, "ADDED");
  assert.equal(addSelection("LOCATION_MOVE", [repair], other).outcome, "ADDED");
  assert.deepEqual(addSelection("LOCATION_MOVE", [repair], repair), { outcome: "DUPLICATE", selected: [repair] });
  const full = Array.from({ length: MAX_LOCATION_MOVE_REPAIRS }, (_, index) => ({ ...repair, repairId: index + 100 }));
  assert.deepEqual(addSelection("LOCATION_MOVE", full, other), { outcome: "LIMIT_REACHED", selected: full });
  for (const mode of ["DELIVERY_NOTE", "SHIPMENT_SELECT"] as const) {
    assert.deepEqual(addSelection(mode, [repair], other), { outcome: "MIXED_CUSTOMER", selected: [repair] });
    assert.deepEqual(addSelection(mode, [repair], repair), { outcome: "DUPLICATE", selected: [repair] });
    assert.equal(addSelection(mode, [], other).outcome, "ADDED");
  }
});

test("timer decision requires confirmation except when same repair is already active", () => {
  assert.equal(timerDecision(null, repair.repairId), "START");
  assert.equal(timerDecision({ activityType: "REPAIR", repairId: repair.repairId }, repair.repairId), "ALREADY_ACTIVE");
  assert.equal(timerDecision({ activityType: "REPAIR", repairId: 99 }, repair.repairId), "SWITCH");
  assert.equal(timerDecision({ activityType: "ADMIN", repairId: null }, repair.repairId), "SWITCH");
});

test("scan debounce compares exact trimmed raw values within 750 ms of acceptance", () => {
  const accepted = { raw: "04:33:3f", acceptedAt: 1000 };
  assert.equal(SCAN_DEBOUNCE_MS, 750);
  assert.equal(shouldDebounceScan(accepted, " 04:33:3f ", 1749), true);
  assert.equal(shouldDebounceScan(accepted, "04:33:3F", 1100), false);
  assert.equal(shouldDebounceScan(accepted, "different", 1100), false);
  assert.equal(shouldDebounceScan(accepted, "04:33:3f", 1750), false);
  assert.equal(shouldDebounceScan({ raw: "04:33:3f", acceptedAt: 1750 }, "04:33:3f", 1800), true);
  assert.equal(shouldDebounceScan(null, "04:33:3f", 1100), false);
});

test("pending scans drain in FIFO order within the current mode and generation", () => {
  type Item = { id: number; mode: "BATCH_SELECT" | "TIMER"; generation: number };
  let queue: Item[] = [];
  for (const id of [1, 2, 3]) {
    const added = enqueueQueuedScan<Item>(queue, { id, mode: "BATCH_SELECT", generation: 1 });
    assert.equal(added.queued, true);
    queue = added.queue;
  }
  for (const id of [1, 2, 3]) {
    const taken = nextQueuedScan(queue, "BATCH_SELECT", 1);
    assert.equal(taken.next?.id, id);
    queue = taken.remaining;
  }
  assert.deepEqual(queue, []);

  const stale: Item[] = [
    { id: 4, mode: "BATCH_SELECT", generation: 1 },
    { id: 5, mode: "TIMER", generation: 2 },
    { id: 6, mode: "TIMER", generation: 3 },
  ];
  assert.deepEqual(nextQueuedScan(stale, "TIMER", 3),
    { next: stale[2], remaining: [] });
});

test("pending scan queue has a fixed limit and does not discard existing entries", () => {
  const queue = Array.from({ length: MAX_QUEUED_SCANS }, (_, id) => id);
  assert.deepEqual(enqueueQueuedScan(queue, 99), { queued: false, queue });
  assert.deepEqual(enqueueQueuedScan(queue.slice(1), 99),
    { queued: true, queue: [...queue.slice(1), 99] });
});

test("queued raw scan uses live destination when processed after location resolution", () => {
  const first = { raw: "LOC-000001", mode: "LOCATION_MOVE" as const, generation: 1 };
  const second = { raw: "PT-000004", mode: "LOCATION_MOVE" as const, generation: 1 };
  let queue = enqueueQueuedScan([], first).queue;
  let destination: { storageLocationId: number; name: string; locationType: string; shortCode: string | null } | null = null;
  const inFlight = nextQueuedScan(queue, "LOCATION_MOVE", 1);
  queue = enqueueQueuedScan(inFlight.remaining, second).queue;
  assert.equal(scanPhase(inFlight.next!.mode, destination), "LOCATION");
  destination = { storageLocationId: 7, name: "棚", locationType: "SHELF", shortCode: "LOC-000001" };
  const pending = nextQueuedScan(queue, "LOCATION_MOVE", 1);
  assert.equal(pending.next?.raw, "PT-000004");
  assert.equal(scanPhase(pending.next!.mode, destination), "REPAIR");
  assert.deepEqual(scanCandidates(pending.next!.raw), [{ type: "SHORT_CODE", value: "PT-000004" }]);
});
