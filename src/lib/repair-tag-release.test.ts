import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseRepairIds, parseRepairTagReleaseRequest, previewRepairTagRelease, releaseRepairTags } from "./repair-tag-release";
import { shipmentTagReleaseFailure } from "./shipment-tag-release";

const status = (error: unknown) => shipmentTagReleaseFailure(error).status;
const request = { confirmed: true as const, repairIds: [10, 11, 12], snapshot: [
  { repairId: 10, assignmentId: 100, physicalTagId: 1 },
  { repairId: 11, assignmentId: 101, physicalTagId: 2 },
  { repairId: 12, assignmentId: null, physicalTagId: null },
] };

function fixture() {
  const repairs = [10, 11, 12].map(id => ({ id, inquiryNumber: `R-${id}` }));
  let assignments = [
    { id: 100, repairId: 10, physicalTagId: 1, releasedAt: null as Date | null, releasedBy: null as number | null,
      releaseReason: null as string | null, physicalTag: { shortCode: "PT-1", status: "ACTIVE" } },
    { id: 101, repairId: 11, physicalTagId: 2, releasedAt: null as Date | null, releasedBy: null as number | null,
      releaseReason: null as string | null, physicalTag: { shortCode: "PT-2", status: "ACTIVE" } },
  ];
  let failId = 0;
  const calls: Array<{ name: string; args: any }> = [];
  const db = { $transaction: async (callback: (tx: any) => Promise<any>, options: any) => {
    calls.push({ name: "transaction", args: options });
    const staged = structuredClone(assignments);
    const tx = {
      repair: { findMany: async (args: any) => repairs.filter(row => args.where.id.in.includes(row.id)) },
      physicalTagAssignment: {
        findMany: async (args: any) => staged.filter(row => args.where.repairId.in.includes(row.repairId) && row.releasedAt === null),
        updateMany: async (args: any) => {
          calls.push({ name: "update", args });
          if (args.where.id === failId) return { count: 0 };
          const row = staged.find(row => row.id === args.where.id && row.repairId === args.where.repairId &&
            row.physicalTagId === args.where.physicalTagId && row.releasedAt === null && row.physicalTag.status === "ACTIVE");
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
  return { db, repairs, calls, get assignments() { return assignments; }, failOn(id: number) { failId = id; } };
}

test("strict bounded unique IDs and confirmed complete snapshot", () => {
  assert.deepEqual(parseRepairIds({ repairIds: [10, 11] }), [10, 11]);
  assert.deepEqual(parseRepairTagReleaseRequest(request), request);
  for (const ids of [[], [0], [-1], ["1"], [1.1], [1, 1], [2147483648], Array.from({ length: 101 }, (_, i) => i + 1)])
    assert.throws(() => parseRepairIds({ repairIds: ids }), error => status(error) === 400);
  for (const body of [{ ...request, confirmed: false }, { ...request, snapshot: request.snapshot.slice(0, 2) },
    { ...request, snapshot: [request.snapshot[0], request.snapshot[0], request.snapshot[2]] },
    { ...request, snapshot: [{ ...request.snapshot[0], assignmentId: null }, ...request.snapshot.slice(1)] }])
    assert.throws(() => parseRepairTagReleaseRequest(body), error => status(error) === 400);
});

test("preview skips unassigned and rejects nonexistent repairs", async () => {
  const f = fixture();
  const preview = await previewRepairTagRelease(f.db, request.repairIds);
  assert.equal(preview.eligibleCount, 2);
  assert.equal(preview.skippedCount, 1);
  assert.equal(preview.rows[0].inquiryNumber, "R-10");
  assert.equal(preview.rows[0].shortCode, "PT-1");
  assert.equal(preview.rows[2].status, "NO_ACTIVE_ASSIGNMENT");
  assert.equal(f.calls.some(call => call.name === "update"), false);
  await assert.rejects(() => previewRepairTagRelease(f.db, [10, 99]), error => status(error) === 404);
  f.assignments.forEach(row => { row.releasedAt = new Date(); });
  assert.equal((await previewRepairTagRelease(f.db, request.repairIds)).releasable, false);
});

test("multi-release preserves history and tag identity", async () => {
  const f = fixture();
  assert.deepEqual(await releaseRepairTags(f.db, request, 42), { releasedCount: 2, skippedCount: 1 });
  assert.equal(f.calls[0].args.isolationLevel, "Serializable");
  assert.equal(f.calls.filter(call => call.name === "update").length, 2);
  for (const row of f.assignments) {
    assert.ok(row.releasedAt instanceof Date);
    assert.equal(row.releasedBy, 42);
    assert.equal(row.releaseReason, "修理一覧からNFCタグ割当解除");
    assert.equal(row.physicalTag.status, "ACTIVE");
  }
});

test("changed assignment or newly assigned skipped row conflicts; later failure rolls back", async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => { f.assignments[0].physicalTagId = 3; },
    (f: ReturnType<typeof fixture>) => { f.assignments[0].id = 999; },
    (f: ReturnType<typeof fixture>) => { f.assignments[0].physicalTag.status = "RETIRED"; },
    (f: ReturnType<typeof fixture>) => { f.assignments.push({ ...structuredClone(f.assignments[0]), id: 102, repairId: 12 }); }]) {
    const f = fixture(); change(f);
    await assert.rejects(() => releaseRepairTags(f.db, request, 42), error => status(error) === 409);
    assert.equal(f.calls.some(call => call.name === "update"), false);
  }
  const f = fixture(); f.failOn(101);
  await assert.rejects(() => releaseRepairTags(f.db, request, 42), error => status(error) === 409);
  assert.deepEqual(f.assignments.map(row => row.releasedAt), [null, null]);
  assert.equal(f.calls.filter(call => call.name === "update").length, 2);
});
