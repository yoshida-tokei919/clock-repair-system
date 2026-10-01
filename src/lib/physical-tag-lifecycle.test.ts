import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  applyPhysicalTagAction, parsePhysicalTagAction, physicalTagLifecycleFailure,
} from "./physical-tag-lifecycle";

type Tag = { id: number; status: "ACTIVE" | "RETIRED"; retiredAt: Date | null; retireReason?: string };
type Assignment = { id: number; physicalTagId: number; repairId: number; assignedAt: Date;
  releasedAt: Date | null; assignedBy: number; releasedBy?: number; assignReason?: string; releaseReason?: string };

function fixture() {
  let tags: Tag[] = [{ id: 1, status: "ACTIVE", retiredAt: null },
    { id: 2, status: "ACTIVE", retiredAt: null }, { id: 3, status: "ACTIVE", retiredAt: null }];
  let assignments: Assignment[] = [];
  let failCreate = false;
  const queries: Array<{ method: string; args: any }> = [];
  const db = {
    $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      const stagedTags = structuredClone(tags);
      const stagedAssignments = structuredClone(assignments);
      const tx = {
        physicalTag: {
          findUnique: async (args: any) => {
            queries.push({ method: "tag.findUnique", args });
            const tag = stagedTags.find(row => row.id === args.where.id);
            return tag && { id: tag.id, status: tag.status };
          },
          updateMany: async (args: any) => {
            queries.push({ method: "tag.updateMany", args });
            const tag = stagedTags.find(row => row.id === args.where.id && row.status === args.where.status && row.retiredAt === null);
            if (!tag) return { count: 0 };
            Object.assign(tag, args.data);
            return { count: 1 };
          },
        },
        repair: { findUnique: async (args: any) => {
          queries.push({ method: "repair.findUnique", args });
          return [10, 11].includes(args.where.id) ? { id: args.where.id } : null;
        } },
        physicalTagAssignment: {
          findFirst: async (args: any) => {
            queries.push({ method: "assignment.findFirst", args });
            const row = stagedAssignments.find(item => item.releasedAt === null &&
              (args.where.repairId === undefined || item.repairId === args.where.repairId) &&
              (args.where.physicalTagId === undefined || item.physicalTagId === args.where.physicalTagId));
            if (!row) return null;
            return Object.fromEntries(Object.keys(args.select).map(key => [key, row[key as keyof Assignment]]));
          },
          create: async (args: any) => {
            queries.push({ method: "assignment.create", args });
            if (failCreate) throw Object.assign(new Error("unique conflict"), { code: "P2002" });
            if (stagedAssignments.some(row => row.releasedAt === null &&
              (row.physicalTagId === args.data.physicalTagId || row.repairId === args.data.repairId))) {
              throw Object.assign(new Error("unique conflict"), { code: "P2002" });
            }
            const row: Assignment = { id: stagedAssignments.length + 1, ...args.data,
              assignedAt: new Date("2026-10-01T00:00:00Z"), releasedAt: null };
            stagedAssignments.push(row);
            return Object.fromEntries(Object.keys(args.select).map(key => [key, row[key as keyof Assignment]]));
          },
          updateMany: async (args: any) => {
            queries.push({ method: "assignment.updateMany", args });
            const row = stagedAssignments.find(item => item.id === args.where.id && item.releasedAt === null);
            if (!row) return { count: 0 };
            Object.assign(row, args.data);
            return { count: 1 };
          },
        },
      };
      const result = await callback(tx);
      tags = stagedTags;
      assignments = stagedAssignments;
      return result;
    },
  } as unknown as PrismaClient;
  return { db, queries, get tags() { return tags; }, get assignments() { return assignments; },
    retireTag(id: number) { const tag = tags.find(row => row.id === id)!; tag.status = "RETIRED"; tag.retiredAt = new Date(); },
    failNextCreate() { failCreate = true; } };
}

const assign = { action: "assign" as const, physicalTagId: 1, repairId: 10 };
const replace = { action: "replace" as const, repairId: 10, replacementPhysicalTagId: 2, reason: "紛失" };
const status = (error: unknown) => physicalTagLifecycleFailure(error).status;

test("assign succeeds with Admin audit id and narrow selects", async () => {
  const f = fixture();
  const result = await applyPhysicalTagAction(f.db, { ...assign, reason: "受付" }, 42);
  assert.deepEqual(result, { assignmentId: 1, physicalTagId: 1, repairId: 10,
    assignedAt: new Date("2026-10-01T00:00:00Z") });
  assert.equal(f.assignments[0].assignedBy, 42);
  assert.equal(f.assignments[0].assignReason, "受付");
  assert.deepEqual(f.queries.find(q => q.method === "tag.findUnique")?.args.select, { id: true, status: true });
  assert.deepEqual(f.queries.find(q => q.method === "repair.findUnique")?.args.select, { id: true });
  assert.deepEqual(f.queries.find(q => q.method === "assignment.create")?.args.select,
    { id: true, physicalTagId: true, repairId: true, assignedAt: true });
});

test("assign rejects retired, assigned tag, and tagged Repair", async () => {
  const retired = fixture(); retired.retireTag(1);
  await assert.rejects(() => applyPhysicalTagAction(retired.db, assign, 42), e => status(e) === 409);
  const assignedTag = fixture();
  await applyPhysicalTagAction(assignedTag.db, assign, 42);
  await assert.rejects(() => applyPhysicalTagAction(assignedTag.db, { ...assign, repairId: 11 }, 42), e => status(e) === 409);
  const taggedRepair = fixture();
  await applyPhysicalTagAction(taggedRepair.db, assign, 42);
  await assert.rejects(() => applyPhysicalTagAction(taggedRepair.db, { ...assign, physicalTagId: 2 }, 42), e => status(e) === 409);
  assert.equal(assignedTag.assignments.length, 1);
  assert.equal(taggedRepair.assignments.length, 1);
});

test("release preserves history and leaves tag ACTIVE; missing active assignment is 404", async () => {
  const f = fixture();
  await assert.rejects(() => applyPhysicalTagAction(f.db, { action: "release", repairId: 10 }, 42), e => status(e) === 404);
  await applyPhysicalTagAction(f.db, assign, 42);
  const result = await applyPhysicalTagAction(f.db, { action: "release", repairId: 10, reason: "返却" }, 43);
  assert.equal(result.assignmentId, 1);
  assert.equal(f.assignments.length, 1);
  assert.ok(f.assignments[0].releasedAt instanceof Date);
  assert.equal(f.assignments[0].releasedBy, 43);
  assert.equal(f.assignments[0].releaseReason, "返却");
  assert.equal(f.tags[0].status, "ACTIVE");
  await applyPhysicalTagAction(f.db, { ...assign, repairId: 11 }, 43);
  assert.equal(f.assignments.length, 2);
});

test("replace releases old assignment, retires old tag, and assigns replacement atomically", async () => {
  const f = fixture();
  await applyPhysicalTagAction(f.db, assign, 42);
  const result = await applyPhysicalTagAction(f.db, replace, 43);
  assert.equal(result.releasedAssignmentId, 1);
  assert.equal(result.assignmentId, 2);
  assert.equal(result.retiredPhysicalTagId, 1);
  assert.equal(result.physicalTagId, 2);
  assert.equal(f.assignments.length, 2);
  assert.ok(f.assignments[0].releasedAt);
  assert.equal(f.assignments[0].releasedBy, 43);
  assert.equal(f.assignments[0].releaseReason, "紛失");
  assert.equal(f.tags[0].status, "RETIRED");
  assert.ok(f.tags[0].retiredAt);
  assert.equal(f.tags[0].retireReason, "紛失");
  assert.equal(f.assignments[1].physicalTagId, 2);
  assert.equal(f.assignments[1].assignedBy, 43);
  assert.equal(f.assignments[1].assignReason, "紛失");
});

test("replace rejects retired, assigned, and same replacement tag", async () => {
  const f = fixture();
  await applyPhysicalTagAction(f.db, assign, 42);
  await assert.rejects(() => applyPhysicalTagAction(f.db, { ...replace, replacementPhysicalTagId: 1 }, 42), e => status(e) === 409);
  f.retireTag(2);
  await assert.rejects(() => applyPhysicalTagAction(f.db, replace, 42), e => status(e) === 409);
  const g = fixture();
  await applyPhysicalTagAction(g.db, assign, 42);
  await applyPhysicalTagAction(g.db, { ...assign, physicalTagId: 2, repairId: 11 }, 42);
  await assert.rejects(() => applyPhysicalTagAction(g.db, replace, 42), e => status(e) === 409);
  assert.equal(g.assignments[0].releasedAt, null);
});

test("failed replacement create rolls back release and retirement; unique race maps to 409", async () => {
  const f = fixture();
  await applyPhysicalTagAction(f.db, assign, 42);
  f.failNextCreate();
  await assert.rejects(() => applyPhysicalTagAction(f.db, replace, 43), e => status(e) === 409);
  assert.equal(f.assignments.length, 1);
  assert.equal(f.assignments[0].releasedAt, null);
  assert.equal(f.tags[0].status, "ACTIVE");
  assert.equal(status({ code: "P2034" }), 409);
  assert.equal(status(new Error("unexpected")), 500);
});

test("input requires bounded reason and positive Int IDs", () => {
  assert.deepEqual(parsePhysicalTagAction("assign", { physicalTagId: 1, repairId: 10, reason: " 受付 " }),
    { ...assign, reason: "受付" });
  for (const body of [{ physicalTagId: 0, repairId: 10 }, { physicalTagId: "1", repairId: 10 },
    { physicalTagId: 1, repairId: 2147483648 }, { physicalTagId: 1, repairId: 10, reason: " ".repeat(5) },
    { physicalTagId: 1, repairId: 10, reason: "a".repeat(501) }, { physicalTagId: 1, repairId: 10, qrToken: "x" }]) {
    assert.throws(() => parsePhysicalTagAction("assign", body), e => status(e) === 400);
  }
  assert.throws(() => parsePhysicalTagAction("replace", { repairId: 10, replacementPhysicalTagId: 2 }),
    e => status(e) === 400);
});
