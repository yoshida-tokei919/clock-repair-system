import assert from "node:assert/strict";
import test from "node:test";
import {
  addPackingScan, addSelection, combineScanResults, enqueueQueuedScan, MAX_LOCATION_AUDIT_REPAIRS, MAX_LOCATION_MOVE_REPAIRS, MAX_QUEUED_SCANS, MAX_SHIPMENT_REPAIRS,
  packingEligibilityError, packingLocallyComplete, packingReadRequest, packingReleaseReady, packingResponseIsCurrent,
  packingSnapshotChanged, parsePackingReleasePreview, parsePackingShipment, parsePackingShipmentId,
  nextQueuedScan, scanCandidates, scanPhase, SCAN_DEBOUNCE_MS, shipmentConfirmationBlockAfterSelectionChange,
  shouldDebounceScan, timerDecision, type SelectedRepair,
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
  assert.equal(addSelection("LOCATION_AUDIT", [repair], other).outcome, "ADDED");
  assert.deepEqual(addSelection("LOCATION_MOVE", [repair], repair), { outcome: "DUPLICATE", selected: [repair] });
  assert.deepEqual(addSelection("LOCATION_AUDIT", [repair], repair), { outcome: "DUPLICATE", selected: [repair] });
  const full = Array.from({ length: MAX_LOCATION_MOVE_REPAIRS }, (_, index) => ({ ...repair, repairId: index + 100 }));
  assert.deepEqual(addSelection("LOCATION_MOVE", full, other), { outcome: "LIMIT_REACHED", selected: full });
  assert.equal(MAX_LOCATION_AUDIT_REPAIRS, 100);
  assert.deepEqual(addSelection("LOCATION_AUDIT", full, other), { outcome: "LIMIT_REACHED", selected: full });
  for (const mode of ["DELIVERY_NOTE", "SHIPMENT_SELECT"] as const) {
    assert.deepEqual(addSelection(mode, [repair], other), { outcome: "MIXED_CUSTOMER", selected: [repair] });
    assert.deepEqual(addSelection(mode, [repair], repair), { outcome: "DUPLICATE", selected: [repair] });
    assert.equal(addSelection(mode, [], other).outcome, "ADDED");
  }
});

test("shipment selection stops at 100 without changing duplicate, customer or other-mode behavior", () => {
  assert.equal(MAX_SHIPMENT_REPAIRS, 100);
  const full = Array.from({ length: MAX_SHIPMENT_REPAIRS }, (_, index) =>
    ({ ...repair, repairId: index + 100, physicalTagId: index + 100 }));
  const sameCustomer = { ...repair, repairId: 999, physicalTagId: 999 };
  const otherCustomer = { ...sameCustomer, customerId: 8 };
  assert.equal(addSelection("SHIPMENT_SELECT", full.slice(0, -1), full.at(-1)!).outcome, "ADDED");
  assert.deepEqual(addSelection("SHIPMENT_SELECT", full, sameCustomer), { outcome: "LIMIT_REACHED", selected: full });
  assert.deepEqual(addSelection("SHIPMENT_SELECT", full, full[0]), { outcome: "DUPLICATE", selected: full });
  assert.deepEqual(addSelection("SHIPMENT_SELECT", [repair], otherCustomer),
    { outcome: "MIXED_CUSTOMER", selected: [repair] });
  assert.equal(addSelection("SHIPMENT_SELECT", [repair], sameCustomer).outcome, "ADDED");
  assert.equal(addSelection("DELIVERY_NOTE", full, sameCustomer).outcome, "ADDED");
  assert.equal(addSelection("BATCH_SELECT", full, otherCustomer).outcome, "ADDED");
});

test("uncertain shipment selection remains blocked until its repairs actually change", () => {
  const second = { ...repair, repairId: 13, physicalTagId: 5 };
  assert.equal(shipmentConfirmationBlockAfterSelectionChange(true, [repair], [repair]), true);
  assert.equal(shipmentConfirmationBlockAfterSelectionChange(true, [repair], [{ ...repair }]), true);
  assert.equal(shipmentConfirmationBlockAfterSelectionChange(true, [repair], [repair, second]), false);
  assert.equal(shipmentConfirmationBlockAfterSelectionChange(true, [repair, second], [repair]), false);
  assert.equal(shipmentConfirmationBlockAfterSelectionChange(true, [repair], []), false);
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

test("audit scan phase changes from Location to Repair without changing existing modes", () => {
  const location = { storageLocationId: 7, name: "棚", locationType: "SHELF", shortCode: "LOC-000001" };
  for (const mode of ["LOCATION_MOVE", "LOCATION_AUDIT"] as const) {
    assert.equal(scanPhase(mode, null), "LOCATION");
    assert.equal(scanPhase(mode, location), "REPAIR");
  }
  for (const mode of ["OPEN_REPAIR", "TIMER", "BATCH_SELECT", "DELIVERY_NOTE", "SHIPMENT_SELECT", "SHIPMENT_PACKING"] as const) {
    assert.equal(scanPhase(mode, null), "REPAIR");
  }
});

const shipmentResponse = {
  id: 42, customerId: 3, customer: { id: 3, name: "顧客A", type: "individual" },
  direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
  repairs: [
    { repairId: 12, repair: { id: 12, inquiryNumber: "T-12", customerId: 3 } },
    { repairId: 13, repair: { id: 13, inquiryNumber: "T-13", customerId: 3 } },
  ],
};

test("release preview only enables a separately confirmed packing session with exact scanned tags", () => {
  const target = parsePackingShipment(shipmentResponse, 42);
  const matched = [repair, { ...repair, repairId: 13, inquiryNumber: "T-13", physicalTagId: 5 }];
  const preview = parsePackingReleasePreview({ shipmentId: 42, releasable: true, blockers: [], targets: [
    { repairId: 10, inquiryNumber: "T-10", assignmentId: 100, physicalTagId: 4, shortCode: "PT-000004", status: "READY" },
    { repairId: 13, inquiryNumber: "T-13", assignmentId: 101, physicalTagId: 5, shortCode: "PT-000005", status: "READY" },
  ] }, 42);
  assert.equal(packingReleaseReady(target, matched, false, preview), false);
  assert.equal(packingReleaseReady(target, matched, true, preview), false);
  const exact = { ...preview, targets: [{ ...preview.targets[0], repairId: 12 }, preview.targets[1]] };
  assert.equal(packingReleaseReady(target, matched, true, exact), true);
  assert.equal(packingReleaseReady(target, matched, true,
    { ...exact, targets: [{ ...exact.targets[0], physicalTagId: 999 }, exact.targets[1]] }), false);
  assert.equal(packingReleaseReady(target, matched, true, { ...exact, releasable: false }), false);
  assert.throws(() => parsePackingReleasePreview({ ...preview, shipmentId: 43 }, 42));
  assert.throws(() => parsePackingReleasePreview({ ...preview, targets: [preview.targets[0], preview.targets[0]] }, 42));
  assert.throws(() => parsePackingReleasePreview({ ...preview, targets: [{ ...preview.targets[0], status: "TAG_NOT_ACTIVE" }] }, 42));
});

test("packing parses Shipment GET and uses a read-only request", () => {
  assert.equal(parsePackingShipmentId(" 42 "), 42);
  assert.throws(() => parsePackingShipmentId("42x"));
  assert.throws(() => parsePackingShipmentId("0"));
  const target = parsePackingShipment(shipmentResponse, 42);
  assert.deepEqual(target.repairs, [{ repairId: 12, inquiryNumber: "T-12" }, { repairId: 13, inquiryNumber: "T-13" }]);
  assert.equal(packingEligibilityError(target), null);
  assert.deepEqual(packingReadRequest(42), { url: "/api/shipments/42", init: { method: "GET", cache: "no-store" } });
  assert.throws(() => parsePackingShipment({ ...shipmentResponse, id: 43 }, 42));
  assert.throws(() => parsePackingShipment({ ...shipmentResponse, repairs: [{ repairId: 12 }] }, 42));
  assert.throws(() => parsePackingShipment({ ...shipmentResponse, repairs: [shipmentResponse.repairs[0], shipmentResponse.repairs[0]] }, 42));
  assert.throws(() => parsePackingShipment({ ...shipmentResponse, repairs: Array.from({ length: 101 }, () => shipmentResponse.repairs[0]) }, 42));
});

test("packing blocks inbound, cancelled, shipped and empty Shipments", () => {
  assert.match(packingEligibilityError(parsePackingShipment({ ...shipmentResponse, direction: "INBOUND" }, 42))!, /OUTBOUND/);
  assert.match(packingEligibilityError(parsePackingShipment({ ...shipmentResponse, status: "CANCELLED" }, 42))!, /取消/);
  assert.match(packingEligibilityError(parsePackingShipment({ ...shipmentResponse, actualShippedAt: "2026-10-02T00:00:00.000Z" }, 42))!, /発送済み/);
  const empty = parsePackingShipment({ ...shipmentResponse, repairs: [] }, 42);
  assert.match(packingEligibilityError(empty)!, /0件/);
  assert.equal(packingLocallyComplete(empty, [], []), false);
});

test("packing membership, duplicates, mismatches and local completion", () => {
  const target = parsePackingShipment(shipmentResponse, 42);
  const second = { ...repair, repairId: 13, inquiryNumber: "T-13", physicalTagId: 5 };
  const sameCustomerNonMember = { ...repair, repairId: 99, inquiryNumber: "T-99", physicalTagId: 9 };
  const first = addPackingScan(target, [], [], repair);
  assert.equal(first.outcome, "MATCHED");
  assert.equal(packingLocallyComplete(target, first.matched, first.mismatches), false);
  assert.deepEqual(addPackingScan(target, first.matched, [], repair),
    { outcome: "DUPLICATE", matched: first.matched, mismatches: [] });
  const mismatch = addPackingScan(target, first.matched, [], sameCustomerNonMember);
  assert.equal(mismatch.outcome, "MISMATCH");
  assert.deepEqual(mismatch.matched, first.matched);
  assert.deepEqual(mismatch.mismatches, [sameCustomerNonMember]);
  assert.deepEqual(addPackingScan(target, mismatch.matched, mismatch.mismatches, sameCustomerNonMember),
    { outcome: "DUPLICATE", matched: mismatch.matched, mismatches: mismatch.mismatches });
  const complete = addPackingScan(target, first.matched, [], second);
  assert.equal(packingLocallyComplete(target, complete.matched, []), true);
  assert.equal(packingLocallyComplete(target, complete.matched, mismatch.mismatches), false);
});

test("packing final snapshot ignores order but detects Repair set and eligibility changes", () => {
  const loaded = parsePackingShipment(shipmentResponse, 42);
  assert.equal(packingSnapshotChanged(loaded, parsePackingShipment({ ...shipmentResponse,
    repairs: [...shipmentResponse.repairs].reverse() }, 42)), false);
  assert.equal(packingSnapshotChanged(loaded, parsePackingShipment({ ...shipmentResponse,
    repairs: [shipmentResponse.repairs[0]] }, 42)), true);
  assert.equal(packingSnapshotChanged(loaded, parsePackingShipment({ ...shipmentResponse,
    repairs: [shipmentResponse.repairs[0], { repairId: 99, repair: { id: 99, inquiryNumber: "T-99", customerId: 3 } }] }, 42)), true);
  for (const change of [{ direction: "INBOUND" }, { status: "CANCELLED" }, { status: "READY" },
    { actualShippedAt: "2026-10-02T00:00:00.000Z" }]) {
    assert.equal(packingSnapshotChanged(loaded, parsePackingShipment({ ...shipmentResponse, ...change }, 42)), true);
  }
});

test("packing response guard rejects obsolete mode, Shipment, clear and request", () => {
  const request = { mode: "SHIPMENT_PACKING" as const, generation: 4, shipmentId: 42, requestId: 7 };
  assert.equal(packingResponseIsCurrent(request, request), true);
  assert.equal(packingResponseIsCurrent(request, { ...request, generation: 5 }), false);
  assert.equal(packingResponseIsCurrent(request, { ...request, mode: "TIMER" }), false);
  assert.equal(packingResponseIsCurrent(request, { ...request, shipmentId: 43 }), false);
  assert.equal(packingResponseIsCurrent(request, { ...request, requestId: 8 }), false);
});
