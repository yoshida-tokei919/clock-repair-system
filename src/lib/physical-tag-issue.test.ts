import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { issuePhysicalTag, parsePhysicalTagIssue, physicalTagIssueFailure } from "./physical-tag-issue";
import { physicalTagLabel } from "./physical-tag-label";

function fixture() {
  let tags: Array<{ id: number; shortCode: string; qrToken: string; nfcUid: string | null }> = [];
  let assignments: Array<{ id: number; repairId: number; physicalTagId: number; assignedBy: number }> = [];
  let failAssignment = false;
  const queries: Array<{ method: string; args: any }> = [];
  const db = {
    $transaction: async (callback: (tx: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      const stagedTags = structuredClone(tags);
      const stagedAssignments = structuredClone(assignments);
      const tx = {
        repair: { findUnique: async (args: any) => {
          queries.push({ method: "repair.findUnique", args });
          return args.where.id === 10 ? { id: 10 } : null;
        } },
        physicalTag: {
          create: async (args: any) => {
            queries.push({ method: "tag.create", args });
            if (args.data.nfcUid && stagedTags.some(t => t.nfcUid === args.data.nfcUid)) {
              throw Object.assign(new Error("duplicate"), { code: "P2002" });
            }
            const row = { id: stagedTags.length + 1, shortCode: args.data.shortCode,
              qrToken: args.data.qrToken, nfcUid: args.data.nfcUid ?? null };
            stagedTags.push(row);
            return { id: row.id };
          },
          update: async (args: any) => {
            queries.push({ method: "tag.update", args });
            const row = stagedTags.find(t => t.id === args.where.id)!;
            row.shortCode = args.data.shortCode;
            return Object.fromEntries(Object.keys(args.select).map(key => [key, row[key as keyof typeof row]]));
          },
        },
        physicalTagAssignment: {
          findFirst: async (args: any) => {
            queries.push({ method: "assignment.findFirst", args });
            return stagedAssignments.find(a => a.repairId === args.where.repairId) ?? null;
          },
          create: async (args: any) => {
            queries.push({ method: "assignment.create", args });
            if (failAssignment) throw Object.assign(new Error("conflict"), { code: "P2002" });
            const row = { id: stagedAssignments.length + 1, ...args.data };
            stagedAssignments.push(row);
            return { id: row.id, assignedAt: new Date("2026-10-01T00:00:00Z") };
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
    failAssignment() { failAssignment = true; } };
}

const status = (error: unknown) => physicalTagIssueFailure(error).status;

test("issue creates opaque token, PT code, and audited assignment in one transaction", async () => {
  const f = fixture();
  const first = await issuePhysicalTag(f.db, { repairId: 10, nfcUid: "04333F" }, 42);
  assert.deepEqual(Object.keys(first).sort(), ["physicalTagId", "shortCode", "qrToken", "nfcUid",
    "assignmentId", "assignedAt", "repairId"].sort());
  assert.equal(first.shortCode, "PT-000001");
  assert.equal(first.nfcUid, "04333F");
  assert.match(first.qrToken, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(f.assignments[0].assignedBy, 42);
  assert.deepEqual(f.queries.map(q => q.method), ["repair.findUnique", "assignment.findFirst",
    "tag.create", "tag.update", "assignment.create"]);
  assert.match(f.queries[2].args.data.shortCode, /^PENDING-[a-f0-9]{32}$/);
  assert.equal(f.queries[2].args.data.status, "ACTIVE");
  assert.equal(f.queries[4].args.data.assignReason, "管理タグ発行");
  assert.deepEqual(f.queries[0].args.select, { id: true });
  assert.deepEqual(f.queries[1].args.select, { id: true });
  assert.deepEqual(f.queries[3].args.select, { id: true, shortCode: true, qrToken: true, nfcUid: true });
  const g = fixture();
  const second = await issuePhysicalTag(g.db, { repairId: 10 }, 42);
  assert.notEqual(first.qrToken, second.qrToken);
  assert.equal(second.nfcUid, null);
});

test("input normalizes only complete NFC hex bytes and requires positive Int Repair ID", () => {
  assert.deepEqual(parsePhysicalTagIssue({ repairId: 10, nfcUid: " 04:33-3f 45 " }),
    { repairId: 10, nfcUid: "04333F45" });
  assert.deepEqual(parsePhysicalTagIssue({ repairId: 10 }), { repairId: 10 });
  for (const body of [{ repairId: 0 }, { repairId: "10" }, { repairId: 2147483648 },
    { repairId: 10, nfcUid: "0:4" }, { repairId: 10, nfcUid: "04:" },
    { repairId: 10, nfcUid: "04::33" }, { repairId: 10, nfcUid: "" },
    { repairId: 10, qrToken: "known" }]) {
    assert.throws(() => parsePhysicalTagIssue(body), error => status(error) === 400);
  }
});

test("missing Repair, active assignment, and create failure leave no new tag", async () => {
  const f = fixture();
  await assert.rejects(() => issuePhysicalTag(f.db, { repairId: 11 }, 42), e => status(e) === 404);
  assert.equal(f.tags.length, 0);
  await issuePhysicalTag(f.db, { repairId: 10 }, 42);
  await assert.rejects(() => issuePhysicalTag(f.db, { repairId: 10 }, 42), e => status(e) === 409);
  assert.equal(f.tags.length, 1);
  const g = fixture();
  g.failAssignment();
  await assert.rejects(() => issuePhysicalTag(g.db, { repairId: 10 }, 42), e => status(e) === 409);
  assert.equal(g.tags.length, 0);
  assert.equal(g.assignments.length, 0);
  assert.equal(status({ code: "P2034" }), 409);
  const duplicateUid = physicalTagIssueFailure({ code: "P2002" });
  assert.equal(duplicateUid.status, 409);
  assert.ok(!duplicateUid.message.includes("04333F"));
  assert.equal(status(new Error("unexpected")), 500);
});

test("label QR payload is exactly the token, independent of printed Repair and customer text", () => {
  const label = physicalTagLabel({ shortCode: "PT-000123", qrToken: "opaque_token_123",
    inquiryNumber: "T-999", customerName: "Customer PII", brand: "Brand", model: "Model",
    reference: "Ref", receptionDate: "2026-10-01" });
  assert.equal(label.qrPayload, "opaque_token_123");
  assert.equal(label.inquiryNumber, "T-999");
  assert.equal(label.customerName, "Customer PII");
  assert.ok(!label.qrPayload.includes("T-999"));
  assert.ok(!label.qrPayload.includes("Customer PII"));
});
