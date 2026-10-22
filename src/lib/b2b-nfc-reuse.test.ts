import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseB2bNfcReuseInput, preflightB2bNfcReuse, reuseB2bNfcTag } from "./b2b-nfc-reuse";
import { physicalTagNfcBindFailure } from "./physical-tag-nfc-bind";

const input = { physicalTagId: 22, repairId: 10, nfcUid: "0433E4DC390289" };

function fixture(mode: "released" | "assigned" | "retired" | "race" | "stale" | "unique" = "released") {
  const tags = [
    { id: 22, shortCode: "PT-000022", qrToken: "new-token", nfcUid: null as string | null,
      status: "ACTIVE", retiredAt: null as Date | null },
    { id: 18, shortCode: "PT-000018", qrToken: "old-token", nfcUid: input.nfcUid as string | null,
      status: mode === "retired" ? "RETIRED" : "ACTIVE", retiredAt: null as Date | null },
  ];
  const assignments = [
    { id: 1, physicalTagId: 18, repairId: 2, releasedAt: new Date("2026-10-18"),
      releaseReason: "completed", assignReason: "earlier", releasedBy: 1 },
    { id: 2, physicalTagId: 22, repairId: 10, releasedAt: null as Date | null,
      releaseReason: null as string | null, assignReason: "B2B一括受付タグ発行", releasedBy: null as number | null },
    ...(mode === "assigned" ? [{ id: 3, physicalTagId: 18, repairId: 3, releasedAt: null,
      releaseReason: null, assignReason: "other", releasedBy: null }] : []),
  ];
  let createCount = 0;
  const db = { $transaction: async (run: (tx: any) => Promise<any>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    const tx = {
      repair: { findUnique: async () => ({ customer: { type: "business" } }) },
      physicalTag: {
        findUnique: async ({ where }: any) => {
          const tag = tags.find(item => where.id === item.id || where.nfcUid === item.nfcUid);
          if (!tag) return null;
          return where.nfcUid ? { ...tag, assignments: assignments.filter(item =>
            item.physicalTagId === tag.id && item.releasedAt === null) } : tag;
        },
        updateMany: async ({ where, data }: any) => {
          const tag = tags.find(item => item.id === where.id);
          if (!tag || tag.status !== where.status || tag.nfcUid !== where.nfcUid ||
              (where.assignments && assignments.some(item => item.physicalTagId === tag.id && item.releasedAt === null)) ||
              mode === "race") return { count: 0 };
          Object.assign(tag, data);
          return { count: 1 };
        },
      },
      physicalTagAssignment: {
        findFirst: async ({ where }: any) => assignments.find(item => item.physicalTagId === where.physicalTagId &&
          item.repairId === where.repairId && item.releasedAt === null) ?? null,
        updateMany: async ({ where, data }: any) => {
          const row = assignments.find(item => item.id === where.id && item.releasedAt === null);
          if (!row || mode === "stale") return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
        create: async ({ data }: any) => {
          if (mode === "unique") throw Object.assign(new Error("race"), { code: "P2002" });
          createCount++;
          assignments.push({ id: 4, physicalTagId: data.physicalTagId, repairId: data.repairId,
            releasedAt: null, releaseReason: null, assignReason: data.assignReason, releasedBy: null });
        },
      },
    };
    return run(tx);
  } } as unknown as PrismaClient;
  return { db, tags, assignments, get createCount() { return createCount; } };
}

test("preflight reveals only availability and tag identity, not earlier Repair", async () => {
  const f = fixture();
  assert.deepEqual(await preflightB2bNfcReuse(f.db, input),
    { status: "REUSABLE", physicalTagId: 18, shortCode: "PT-000018" });
  assert.equal(f.assignments[0].repairId, 2);
});

test("confirmed reuse preserves existing UID, QR and shortCode, releases and retires provisional", async () => {
  const f = fixture();
  const result = await reuseB2bNfcTag(f.db, { ...input, reusableTagId: 18 }, 42);
  assert.deepEqual(result, { physicalTagId: 18, repairId: 10, nfcUid: input.nfcUid,
    shortCode: "PT-000018", retiredPhysicalTagId: 22 });
  assert.equal(f.tags[1].qrToken, "old-token");
  assert.equal(f.tags[1].nfcUid, input.nfcUid);
  assert.equal(f.tags[0].status, "RETIRED");
  assert.equal(f.tags[0].nfcUid, null);
  assert.equal(f.assignments[0].releasedAt?.toISOString(), "2026-10-18T00:00:00.000Z");
  assert.equal(f.assignments[1].releasedBy, 42);
  assert.equal(f.assignments.filter(item => item.releasedAt === null && item.repairId === 10).length, 1);
  assert.equal(f.createCount, 1);
});

test("assigned and retired tags refuse preflight and transfer", async () => {
  for (const mode of ["assigned", "retired"] as const) {
    const f = fixture(mode);
    assert.deepEqual(await preflightB2bNfcReuse(f.db, input),
      { status: mode === "assigned" ? "ASSIGNED" : "RETIRED" });
    await assert.rejects(() => reuseB2bNfcTag(f.db, { ...input, reusableTagId: 18 }, 42),
      error => physicalTagNfcBindFailure(error).status === 409);
    assert.equal(f.createCount, 0);
  }
});

test("mismatched target and stale/concurrent assignment fail closed", async () => {
  for (const mode of ["released", "race", "stale", "unique"] as const) {
    const f = fixture(mode);
    await assert.rejects(() => reuseB2bNfcTag(f.db,
      { ...input, reusableTagId: mode === "released" ? 19 : 18 }, 42),
    error => physicalTagNfcBindFailure(error).status === 409);
    assert.equal(f.createCount, 0);
  }
});

test("confirmation payload requires exact IDs, normalized UID and explicit consent", () => {
  assert.deepEqual(parseB2bNfcReuseInput({ ...input, reusableTagId: 18, confirmed: true }, true),
    { ...input, reusableTagId: 18 });
  for (const body of [{ ...input, reusableTagId: 18 }, { ...input, reusableTagId: 18, confirmed: false },
    { ...input, reusableTagId: 18, confirmed: true, extra: 1 }])
    assert.throws(() => parseB2bNfcReuseInput(body, true));
});
