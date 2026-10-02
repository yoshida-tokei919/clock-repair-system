import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseReleaseRequest, previewShipmentTagRelease, releaseShipmentTags,
  shipmentTagReleaseFailure, type ReleaseTarget } from "./shipment-tag-release";

type Assignment = { id: number; repairId: number; physicalTagId: number; releasedAt: Date | null;
  releasedBy: number | null; releaseReason: string | null; physicalTag: { shortCode: string; status: string } };
const targets: ReleaseTarget[] = [
  { repairId: 10, assignmentId: 100, physicalTagId: 1 },
  { repairId: 11, assignmentId: 101, physicalTagId: 2 },
];
const request = { confirmed: true as const, targets };
const errorStatus = (error: unknown) => shipmentTagReleaseFailure(error).status;

function fixture() {
  let shipment: any = { id: 7, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
    repairs: [{ repairId: 10, repair: { inquiryNumber: "I-10" } },
      { repairId: 11, repair: { inquiryNumber: "I-11" } }] };
  let assignments: Assignment[] = targets.map((target, index) => ({ id: target.assignmentId,
    repairId: target.repairId, physicalTagId: target.physicalTagId, releasedAt: null,
    releasedBy: null, releaseReason: null,
    physicalTag: { shortCode: `PT-00000${index + 1}`, status: "ACTIVE" } }));
  let failAt: number | null = null;
  let throwAt: number | null = null;
  const calls: Array<{ operation: string; args: any }> = [];
  const db = { $transaction: async (callback: (tx: any) => Promise<any>, options: any) => {
    calls.push({ operation: "transaction", args: options });
    const staged = structuredClone(assignments);
    const tx = {
      shipment: { findUnique: async (args: any) => {
        calls.push({ operation: "shipment.findUnique", args });
        return shipment && structuredClone(shipment);
      } },
      physicalTagAssignment: {
        findMany: async (args: any) => {
          calls.push({ operation: "assignment.findMany", args });
          return staged.filter(row => row.releasedAt === null && args.where.repairId.in.includes(row.repairId));
        },
        updateMany: async (args: any) => {
          calls.push({ operation: "assignment.updateMany", args });
          if (args.where.id === throwAt) throw new Error("database write failure");
          if (args.where.id === failAt) return { count: 0 };
          const row = staged.find(item => item.id === args.where.id && item.repairId === args.where.repairId &&
            item.physicalTagId === args.where.physicalTagId && item.releasedAt === args.where.releasedAt);
          if (!row) return { count: 0 };
          Object.assign(row, args.data);
          return { count: 1 };
        },
      },
    };
    const result = await callback(tx);
    assignments = staged;
    return result;
  } } as unknown as PrismaClient;
  return { db, calls, get assignments() { return assignments; },
    setShipment(value: any) { shipment = value; },
    changeAssignment(id: number, change: Partial<Assignment>) {
      Object.assign(assignments.find(row => row.id === id)!, change);
    },
    failUpdateAt(id: number) { failAt = id; },
    throwUpdateAt(id: number) { throwAt = id; } };
}

test("release request requires explicit confirmation and unique exact tuples", () => {
  assert.deepEqual(parseReleaseRequest(request), request);
  for (const body of [null, {}, { ...request, confirmed: false }, { ...request, targets: [] },
    { ...request, releaseReason: "client" }, { ...request, targets: [targets[0], targets[0]] },
    { ...request, targets: [{ ...targets[0], assignmentId: 0 }] },
    { ...request, targets: [{ ...targets[0], releasedBy: 1 }] },
    { ...request, targets: Array.from({ length: 101 }, (_, i) => ({ repairId: i + 1, assignmentId: i + 1, physicalTagId: i + 1 })) }]) {
    assert.throws(() => parseReleaseRequest(body), error => errorStatus(error) === 400);
  }
});

test("preview is read-only and reports missing, retired, and duplicate active assignments as blockers", async () => {
  const f = fixture();
  const ready = await previewShipmentTagRelease(f.db, 7);
  assert.equal(ready.releasable, true);
  assert.deepEqual(ready.targets.map(row => row.status), ["READY", "READY"]);
  assert.equal(f.calls.some(call => call.operation === "assignment.updateMany"), false);
  assert.deepEqual(f.calls[0].args, { isolationLevel: "RepeatableRead" });
  f.changeAssignment(100, { releasedAt: new Date() });
  assert.deepEqual((await previewShipmentTagRelease(f.db, 7)).targets.map(row => row.status),
    ["NO_ACTIVE_ASSIGNMENT", "READY"]);
  f.changeAssignment(100, { releasedAt: null, physicalTag: { shortCode: "PT-000001", status: "RETIRED" } });
  assert.equal((await previewShipmentTagRelease(f.db, 7)).targets[0].status, "TAG_NOT_ACTIVE");
  f.changeAssignment(100, { physicalTag: { shortCode: "PT-000001", status: "ACTIVE" } });
  f.assignments.push({ ...structuredClone(f.assignments[0]), id: 102, physicalTagId: 3 });
  assert.equal((await previewShipmentTagRelease(f.db, 7)).targets[0].status, "MULTIPLE_ACTIVE_ASSIGNMENTS");
});

test("one Serializable release writes only assignment audit fields and blocks repeat release", async () => {
  const f = fixture();
  const result = await releaseShipmentTags(f.db, 7, request, 42);
  assert.equal(result.releasedCount, 2);
  assert.deepEqual(f.calls[0].args, { isolationLevel: "Serializable" });
  assert.equal(f.calls.filter(call => call.operation === "shipment.findUnique").length, 1);
  assert.equal(f.calls.filter(call => call.operation === "assignment.updateMany").length, 2);
  for (const row of f.assignments) {
    assert.ok(row.releasedAt instanceof Date);
    assert.equal(row.releasedBy, 42);
    assert.equal(row.releaseReason, "発送前PhysicalTag解放確認 / Shipment ID 7");
    assert.equal(row.physicalTag.status, "ACTIVE");
  }
  await assert.rejects(() => releaseShipmentTags(f.db, 7, request, 42), error => errorStatus(error) === 409);
});

test("later guarded update failure rolls back the entire batch", async () => {
  const f = fixture();
  f.failUpdateAt(101);
  await assert.rejects(() => releaseShipmentTags(f.db, 7, request, 42), error => errorStatus(error) === 409);
  assert.deepEqual(f.assignments.map(row => row.releasedAt), [null, null]);
  assert.equal(f.calls.filter(call => call.operation === "assignment.updateMany").length, 2);
  assert.deepEqual(f.calls.find(call => call.operation === "assignment.updateMany")!.args.where,
    { id: 100, repairId: 10, physicalTagId: 1, releasedAt: null });
});

test("later database exception also rolls back earlier assignment updates", async () => {
  const f = fixture();
  f.throwUpdateAt(101);
  await assert.rejects(() => releaseShipmentTags(f.db, 7, request, 42), /database write failure/);
  assert.deepEqual(f.assignments.map(row => row.releasedAt), [null, null]);
});

test("release rejects changed shipment, exact Repair set, tags, and requested tuple set", async () => {
  const variants = [
    (f: ReturnType<typeof fixture>) => f.setShipment(null),
    (f: ReturnType<typeof fixture>) => f.setShipment({ id: 7, direction: "INBOUND", status: "DRAFT", actualShippedAt: null, repairs: [] }),
    (f: ReturnType<typeof fixture>) => f.setShipment({ id: 7, direction: "OUTBOUND", status: "CANCELLED", actualShippedAt: null, repairs: [] }),
    (f: ReturnType<typeof fixture>) => f.setShipment({ id: 7, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: new Date(), repairs: [] }),
    (f: ReturnType<typeof fixture>) => f.setShipment({ id: 7, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
      repairs: [{ repairId: 10, repair: { inquiryNumber: "I-10" } }] }),
    (f: ReturnType<typeof fixture>) => f.setShipment({ id: 7, direction: "OUTBOUND", status: "DRAFT", actualShippedAt: null,
      repairs: [{ repairId: 10, repair: { inquiryNumber: "I-10" } },
        { repairId: 12, repair: { inquiryNumber: "I-12" } }] }),
    (f: ReturnType<typeof fixture>) => f.changeAssignment(100, { releasedAt: new Date() }),
    (f: ReturnType<typeof fixture>) => f.changeAssignment(100, { physicalTag: { shortCode: "PT-000001", status: "RETIRED" } }),
  ];
  for (const [index, change] of variants.entries()) {
    const f = fixture(); change(f);
    await assert.rejects(() => releaseShipmentTags(f.db, 7, request, 42),
      error => errorStatus(error) === (index === 0 ? 404 : 409));
    assert.equal(f.calls.some(call => call.operation === "assignment.updateMany"), false);
  }
  for (const changed of [
    [{ ...targets[0], assignmentId: 999 }, targets[1]],
    [{ ...targets[0], physicalTagId: 999 }, targets[1]],
    [targets[0], { ...targets[1], repairId: 12 }],
    [targets[0]],
  ]) {
    const f = fixture();
    await assert.rejects(() => releaseShipmentTags(f.db, 7, { confirmed: true, targets: changed }, 42),
      error => errorStatus(error) === 409);
    assert.equal(f.calls.some(call => call.operation === "assignment.updateMany"), false);
  }
});

test("Prisma concurrent write failures map to conflict", () => {
  assert.equal(shipmentTagReleaseFailure({ code: "P2034" }).status, 409);
  assert.equal(shipmentTagReleaseFailure({ code: "P2002" }).status, 409);
});
