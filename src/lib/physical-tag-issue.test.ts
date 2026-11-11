import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { issuePhysicalTag, parsePhysicalTagIssue, physicalTagIssueFailure, preflightPhysicalTagIssue } from "./physical-tag-issue";
import { physicalTagLabel } from "./physical-tag-label";

function fixture() {
  let tags: Array<{ id: number; shortCode: string; qrToken: string; nfcUid: string | null; status: string }> = [];
  let assignments: Array<{ id: number; repairId: number; physicalTagId: number; assignedBy: number; releasedAt: Date | null }> = [];
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
          return [10, 20].includes(args.where.id) ? { id: args.where.id } : null;
        } },
        physicalTag: {
          create: async (args: any) => {
            queries.push({ method: "tag.create", args });
            if (args.data.nfcUid && stagedTags.some(t => t.nfcUid === args.data.nfcUid)) {
              throw Object.assign(new Error("duplicate"), { code: "P2002" });
            }
            const row = { id: stagedTags.length + 1, shortCode: args.data.shortCode,
              qrToken: args.data.qrToken, nfcUid: args.data.nfcUid ?? null, status: args.data.status };
            stagedTags.push(row);
            return { id: row.id };
          },
          update: async (args: any) => {
            queries.push({ method: "tag.update", args });
            const row = stagedTags.find(t => t.id === args.where.id)!;
            row.shortCode = args.data.shortCode;
            return Object.fromEntries(Object.keys(args.select).map(key => [key, row[key as keyof typeof row]]));
          },
          findUnique: async (args: any) => {
            queries.push({ method: "tag.findUnique", args });
            const row = stagedTags.find(t => t.nfcUid === args.where.nfcUid);
            return row && { ...row, assignments: stagedAssignments.filter(a => a.physicalTagId === row.id && !a.releasedAt) };
          },
          updateMany: async (args: any) => {
            queries.push({ method: "tag.updateMany", args });
            const row = stagedTags.find(t => t.id === args.where.id);
            return { count: row?.status === "ACTIVE" && row.nfcUid === args.where.nfcUid &&
              !stagedAssignments.some(a => a.physicalTagId === row.id && !a.releasedAt) ? 1 : 0 };
          },
        },
        physicalTagAssignment: {
          findFirst: async (args: any) => {
            queries.push({ method: "assignment.findFirst", args });
            return stagedAssignments.find(a => args.where.repairId !== undefined
              ? a.repairId === args.where.repairId && !a.releasedAt
              : a.physicalTagId === args.where.physicalTagId && !!a.releasedAt) ?? null;
          },
          create: async (args: any) => {
            queries.push({ method: "assignment.create", args });
            if (failAssignment) throw Object.assign(new Error("conflict"), { code: "P2002" });
            const row = { id: stagedAssignments.length + 1, releasedAt: null, ...args.data };
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
    release() { assignments[assignments.length - 1].releasedAt = new Date("2026-10-02T00:00:00Z"); },
    clearHistory() { assignments = []; },
    retire() { tags[tags.length - 1].status = "RETIRED"; },
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
  assert.deepEqual(f.queries.map(q => q.method), ["repair.findUnique", "assignment.findFirst", "tag.findUnique",
    "tag.create", "tag.update", "assignment.create"]);
  assert.match(f.queries[3].args.data.shortCode, /^PENDING-[a-f0-9]{32}$/);
  assert.equal(f.queries[3].args.data.status, "ACTIVE");
  assert.equal(f.queries[5].args.data.assignReason, "管理タグ発行");
  assert.deepEqual(f.queries[0].args.select, { id: true });
  assert.deepEqual(f.queries[1].args.select, { id: true });
  assert.deepEqual(f.queries[4].args.select, { id: true, shortCode: true, qrToken: true, nfcUid: true });
  const g = fixture();
  const second = await issuePhysicalTag(g.db, { repairId: 10 }, 42);
  assert.notEqual(first.qrToken, second.qrToken);
  assert.equal(second.nfcUid, null);
});

test("input normalizes only complete NFC hex bytes and requires positive Int Repair ID", () => {
  assert.deepEqual(parsePhysicalTagIssue({ repairId: 10, nfcUid: " 04:33-3f 45 " }),
    { repairId: 10, nfcUid: "04333F45" });
  assert.deepEqual(parsePhysicalTagIssue({ repairId: 10 }), { repairId: 10 });
  assert.deepEqual(parsePhysicalTagIssue({ repairId: 10, nfcUid: "04333F", reusableTagId: 1, confirmed: true }),
    { repairId: 10, nfcUid: "04333F", reusableTagId: 1 });
  for (const body of [{ repairId: 0 }, { repairId: "10" }, { repairId: 2147483648 },
    { repairId: 10, nfcUid: "0:4" }, { repairId: 10, nfcUid: "04:" },
    { repairId: 10, nfcUid: "04::33" }, { repairId: 10, nfcUid: "" },
    { repairId: 10, qrToken: "known" },
    { repairId: 10, nfcUid: "04333F", reusableTagId: 1 },
    { repairId: 10, nfcUid: "04333F", reusableTagId: 1, confirmed: false },
    { repairId: 10, confirmed: true }]) {
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

test("released ACTIVE tag is reassigned with identity and history retained", async () => {
  const f = fixture();
  const original = await issuePhysicalTag(f.db, { repairId: 10, nfcUid: "04333F" }, 42);
  f.release();
  assert.deepEqual(await preflightPhysicalTagIssue(f.db, { repairId: 10, nfcUid: "04333F" }),
    { status: "REUSABLE", physicalTagId: original.physicalTagId, shortCode: original.shortCode });
  const reused = await issuePhysicalTag(f.db,
    { repairId: 10, nfcUid: "04333F", reusableTagId: original.physicalTagId }, 43);
  assert.equal(reused.physicalTagId, original.physicalTagId);
  assert.equal(reused.qrToken, original.qrToken);
  assert.equal(reused.shortCode, original.shortCode);
  assert.equal(f.tags.length, 1);
  assert.equal(f.assignments.length, 2);
  assert.ok(f.assignments[0].releasedAt);
  assert.equal(f.assignments[1].assignedBy, 43);
  assert.equal(f.queries.at(-1)?.args.data.assignReason, "管理タグ再割当");
});

test("assigned, retired, unissued and changed tags block reuse", async () => {
  const f = fixture();
  const original = await issuePhysicalTag(f.db, { repairId: 10, nfcUid: "04333F" }, 42);
  assert.deepEqual(await preflightPhysicalTagIssue(f.db, { repairId: 20, nfcUid: "AABB" }),
    { status: "AVAILABLE" });
  assert.deepEqual(await preflightPhysicalTagIssue(f.db, { repairId: 20, nfcUid: "04333F" }),
    { status: "ASSIGNED" });
  await assert.rejects(() => preflightPhysicalTagIssue(f.db, { repairId: 10, nfcUid: "04333F" }),
    e => status(e) === 409);
  f.release();
  await assert.rejects(() => issuePhysicalTag(f.db,
    { repairId: 20, nfcUid: "04333F", reusableTagId: original.physicalTagId + 1 }, 42),
  e => status(e) === 409);
  f.retire();
  assert.deepEqual(await preflightPhysicalTagIssue(f.db, { repairId: 20, nfcUid: "04333F" }),
    { status: "RETIRED" });
  await assert.rejects(() => issuePhysicalTag(f.db,
    { repairId: 20, nfcUid: "04333F", reusableTagId: original.physicalTagId }, 42),
  e => status(e) === 409);
  assert.equal(f.assignments.length, 1);
  const g = fixture();
  await issuePhysicalTag(g.db, { repairId: 10, nfcUid: "AABB" }, 42);
  g.clearHistory();
  assert.deepEqual(await preflightPhysicalTagIssue(g.db, { repairId: 20, nfcUid: "AABB" }),
    { status: "UNAVAILABLE" });
});

test("label QR payload is exactly the token, independent of printed Repair and customer text", () => {
  const label = physicalTagLabel({ shortCode: "PT-000123", qrToken: "opaque_token_123",
    inquiryNumber: "T-999", customerType: "individual", customerName: "Customer PII",
    companyName: "Wrong company", endUserName: "Wrong end user", partnerRef: "Wrong partner ref",
    brand: "Brand", model: "Model", reference: "Ref", serialNumber: "SN123",
    movementCaliber: " Cal. 123 ", watchCaliber: "Cal. 456", receptionDate: "2026-10-01" });
  assert.equal(label.qrPayload, "opaque_token_123");
  assert.equal(label.inquiryNumber, "T-999");
  assert.equal(label.customerName, "Customer PII");
  assert.equal(label.endUserName, null);
  assert.equal(label.partnerRef, null);
  assert.equal(label.caliber, "Cal. 123");
  assert.equal(label.serialNumber, "SN123");
  assert.ok(!label.qrPayload.includes("T-999"));
  assert.ok(!label.qrPayload.includes("Customer PII"));
  assert.ok(!label.qrPayload.includes("SN123"));
});

test("business label uses partner and end-user fields with Watch caliber fallback", () => {
  const label = physicalTagLabel({ shortCode: "PT-000124", qrToken: "opaque_token_124",
    inquiryNumber: "B-100", customerType: "business", customerName: "担当者名",
    companyName: "  取引先会社  ", endUserName: "  所有者  ", partnerRef: "  先方-001  ",
    brand: "Brand", model: "Model", reference: "Ref", serialNumber: null,
    movementCaliber: null, watchCaliber: " Watch Cal ", receptionDate: null });
  assert.equal(label.customerName, "取引先会社");
  assert.equal(label.endUserName, "所有者");
  assert.equal(label.partnerRef, "先方-001");
  assert.equal(label.caliber, "Watch Cal");
  assert.equal(label.qrPayload, "opaque_token_124");
});

test("physical tag reference omits blank model or case values", () => {
  const base = { shortCode: "PT-000125", qrToken: "token", inquiryNumber: "B-125",
    customerType: "business" as const, customerName: "Customer", companyName: null,
    endUserName: null, partnerRef: null, brand: "Brand", model: "Model",
    serialNumber: null, movementCaliber: null, watchCaliber: null, receptionDate: null };
  assert.equal(physicalTagLabel({ ...base, reference: " R1 ", caseReference: " C1 " }).reference, "R1 C1");
  assert.equal(physicalTagLabel({ ...base, reference: " R1 " }).reference, "R1");
  assert.equal(physicalTagLabel({ ...base, reference: " ", caseReference: " C1 " }).reference, "C1");
  assert.equal(physicalTagLabel({ ...base, reference: " ", caseReference: " " }).reference, "");
});
