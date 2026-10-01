import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { moveStorageLocation, parseStorageLocationMove, storageLocationMoveFailure } from "./storage-location-move";

type Assignment = { id: number; repairId: number; storageLocationId: number; assignedAt: Date;
  releasedAt: Date | null; assignedBy: number; releasedBy?: number; assignReason?: string; releaseReason?: string };

function fixture() {
  let assignments: Assignment[] = [];
  const locations = [{ id: 1, name: "A", locationType: "BOX", shortCode: "LOC-000001", isActive: true },
    { id: 2, name: "B", locationType: "SHELF", shortCode: null, isActive: true },
    { id: 3, name: "C", locationType: "TRAY", shortCode: null, isActive: false }];
  const queries: Array<{ method: string; args: any }> = [];
  let stale = false;
  let failCreateAt = -1;
  let createCount = 0;
  const db = { $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const staged = structuredClone(assignments);
    const tx = {
      storageLocation: { findUnique: async (args: any) => {
        queries.push({ method: "location.findUnique", args });
        return locations.find(item => item.id === args.where.id) ?? null;
      } },
      repair: { findMany: async (args: any) => {
        queries.push({ method: "repair.findMany", args });
        return args.where.id.in.filter((id: number) => [10, 11, 12].includes(id)).map((id: number) => ({ id }));
      } },
      storageLocationAssignment: {
        findMany: async (args: any) => {
          queries.push({ method: "assignment.findMany", args });
          return staged.filter(row => row.releasedAt === null && args.where.repairId.in.includes(row.repairId))
            .map(row => ({ id: row.id, repairId: row.repairId, storageLocationId: row.storageLocationId }));
        },
        updateMany: async (args: any) => {
          queries.push({ method: "assignment.updateMany", args });
          if (stale) return { count: 0 };
          const row = staged.find(item => item.id === args.where.id && item.repairId === args.where.repairId &&
            item.storageLocationId === args.where.storageLocationId && item.releasedAt === null);
          if (!row) return { count: 0 };
          Object.assign(row, args.data);
          return { count: 1 };
        },
        create: async (args: any) => {
          queries.push({ method: "assignment.create", args });
          createCount++;
          if (createCount === failCreateAt) throw Object.assign(new Error("conflict"), { code: "P2002" });
          if (staged.some(row => row.repairId === args.data.repairId && row.releasedAt === null)) {
            throw Object.assign(new Error("conflict"), { code: "P2002" });
          }
          const row: Assignment = { id: staged.length + 1, ...args.data, releasedAt: null };
          staged.push(row);
          return { id: row.id, assignedAt: row.assignedAt };
        },
      },
    };
    const value = await callback(tx);
    assignments = staged;
    return value;
  } } as unknown as PrismaClient;
  return { db, queries, get assignments() { return assignments; },
    setStale() { stale = true; }, failCreate(number: number) { failCreateAt = number; } };
}

const input = (storageLocationId: number, repairIds: number[], reason?: string) =>
  ({ storageLocationId, repairIds, reason });
const status = (error: unknown) => storageLocationMoveFailure(error).status;

test("move input enforces PostgreSQL Int, batch bounds, unique IDs, reason and exact keys", () => {
  assert.deepEqual(parseStorageLocationMove({ storageLocationId: 2, repairIds: [10], reason: " 作業 " }),
    { storageLocationId: 2, repairIds: [10], reason: "作業" });
  for (const body of [null, [], Object.create(null), { storageLocationId: 0, repairIds: [10] },
    { storageLocationId: 2147483648, repairIds: [10] }, { storageLocationId: 1, repairIds: [] },
    { storageLocationId: 1, repairIds: Array(101).fill(10) }, { storageLocationId: 1, repairIds: [10, 10] },
    { storageLocationId: 1, repairIds: ["10"] }, { storageLocationId: 1, repairIds: [2147483648] },
    { storageLocationId: 1, repairIds: [10], reason: " " },
    { storageLocationId: 1, repairIds: [10], reason: "x".repeat(501) },
    { storageLocationId: 1, repairIds: [10], extra: true }]) {
    assert.throws(() => parseStorageLocationMove(body), error => status(error) === 400);
  }
});

test("first assignment uses real Admin ID and default audit reason", async () => {
  const f = fixture();
  const result = await moveStorageLocation(f.db, input(1, [10]), 42);
  assert.equal(result.moved.length, 1);
  assert.equal(result.moved[0].previousStorageLocationId, null);
  assert.equal(f.assignments[0].assignedBy, 42);
  assert.equal(f.assignments[0].assignReason, "保管場所登録");
  assert.equal(f.assignments[0].assignedAt.getTime(), result.moved[0].assignedAt.getTime());
  assert.deepEqual(f.queries.find(query => query.method === "repair.findMany")?.args.select, { id: true });
  assert.deepEqual(f.queries.find(query => query.method === "assignment.findMany")?.args.select,
    { id: true, repairId: true, storageLocationId: true });
});

test("A to B preserves history, shares timestamp and no-ops same destination", async () => {
  const f = fixture();
  await moveStorageLocation(f.db, input(1, [10]), 42);
  const changed = await moveStorageLocation(f.db, input(2, [10], "移設"), 43);
  assert.equal(f.assignments.length, 2);
  assert.equal(changed.moved[0].previousStorageLocationId, 1);
  assert.equal(f.assignments[0].releasedAt?.getTime(), f.assignments[1].assignedAt.getTime());
  assert.equal(f.assignments[0].releasedBy, 43);
  assert.equal(f.assignments[0].releaseReason, "移設");
  assert.equal(f.assignments[1].assignedBy, 43);
  assert.equal(f.assignments[1].assignReason, "移設");
  const noOp = await moveStorageLocation(f.db, input(2, [10]), 44);
  assert.deepEqual(noOp.unchangedRepairIds, [10]);
  assert.deepEqual(noOp.moved, []);
  assert.equal(f.assignments.length, 2);
});

test("missing or inactive destination and missing Repair write nothing", async () => {
  const f = fixture();
  for (const request of [input(99, [10]), input(3, [10]), input(1, [10, 99])]) {
    await assert.rejects(() => moveStorageLocation(f.db, request, 42), error => status(error) === (request.storageLocationId === 3 ? 409 : 404));
  }
  assert.deepEqual(f.assignments, []);
});

test("stale release, P2002 and P2034 report conflict and rollback", async () => {
  const f = fixture();
  await moveStorageLocation(f.db, input(1, [10]), 42);
  f.setStale();
  await assert.rejects(() => moveStorageLocation(f.db, input(2, [10]), 42), error => status(error) === 409);
  assert.equal(f.assignments[0].releasedAt, null);
  assert.equal(status({ code: "P2002" }), 409);
  assert.equal(status({ code: "P2034" }), 409);
  assert.equal(status(new Error("unexpected")), 500);
});

test("failed create rolls back full multi-Repair batch, same destination accepts many", async () => {
  const f = fixture();
  f.failCreate(2);
  await assert.rejects(() => moveStorageLocation(f.db, input(1, [10, 11]), 42), error => status(error) === 409);
  assert.deepEqual(f.assignments, []);
  const g = fixture();
  const result = await moveStorageLocation(g.db, input(1, [10, 11, 12]), 42);
  assert.equal(result.moved.length, 3);
  assert.deepEqual(g.assignments.map(row => row.storageLocationId), [1, 1, 1]);
  assert.equal(new Set(g.assignments.map(row => row.assignedAt.getTime())).size, 1);
});

test("failed destination create restores the released prior assignment", async () => {
  const f = fixture();
  await moveStorageLocation(f.db, input(1, [10]), 42);
  f.failCreate(2);
  await assert.rejects(() => moveStorageLocation(f.db, input(2, [10]), 43), error => status(error) === 409);
  assert.equal(f.assignments.length, 1);
  assert.equal(f.assignments[0].releasedAt, null);
  assert.equal(f.assignments[0].storageLocationId, 1);
});
