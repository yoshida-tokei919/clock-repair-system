import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseB2bBatchTagInput, prepareB2bBatchPhysicalTags } from "./b2b-batch-physical-tags";

function repair(id: number, customerId = 7, type = "business") {
  return { id, customerId, inquiryNumber: `B-${id}`, endUserName: `Owner ${id}`, partnerRef: `REF-${id}`,
    receptionDate: new Date("2026-10-06T00:00:00Z"), customer: { type, name: "Partner", companyName: "Partner Co" },
    movementCaliber: { name: "3135" }, watch: { modelNameInput: null, serialNumber: `SN-${id}`,
      brand: { name: "Rolex", nameJp: "ロレックス" }, model: { nameJp: "" },
      reference: { name: "16610" }, caliber: { name: "Watch Cal" } } };
}

function fixture(rows = [repair(10), repair(11)]) {
  const assignments = new Map<number, { physicalTag: { id: number; shortCode: string; qrToken: string; status: "ACTIVE" } }>();
  assignments.set(11, { physicalTag: { id: 3, shortCode: "PT-000003", qrToken: "existing-token", status: "ACTIVE" } });
  let creates = 0;
  let race = false;
  const findFirst = async ({ where }: { where: { repairId: number } }) => assignments.get(where.repairId) ?? null;
  const db = {
    repair: { findMany: async ({ where }: { where: { id: { in: number[] } } }) => rows.filter(row => where.id.in.includes(row.id)) },
    physicalTagAssignment: { findFirst },
    $transaction: async (run: (tx: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      let pending: { physicalTag: { id: number; shortCode: string; qrToken: string; status: "ACTIVE" }; repairId: number } | null = null;
      const tx = {
        physicalTagAssignment: {
          findFirst,
          create: async ({ data }: { data: { repairId: number; physicalTagId: number; assignedBy: number } }) => {
            assert.equal(data.assignedBy, 42);
            if (race) {
              race = false;
              assignments.set(data.repairId, { physicalTag: { id: 99, shortCode: "PT-000099", qrToken: "race-token", status: "ACTIVE" } });
              throw Object.assign(new Error("race"), { code: "P2002" });
            }
            assert.equal(pending?.repairId, data.repairId);
          },
        },
        physicalTag: {
          create: async () => { creates += 1; return { id: 3 + creates }; },
          update: async ({ where }: { where: { id: number } }) => {
            const tag = { id: where.id, shortCode: `PT-${String(where.id).padStart(6, "0")}`,
              qrToken: `new-token-${where.id}`, status: "ACTIVE" as const };
            pending = { physicalTag: tag, repairId: rows[0].id };
            return tag;
          },
        },
      };
      const result = await run(tx);
      const staged = pending as { physicalTag: { id: number; shortCode: string; qrToken: string; status: "ACTIVE" }; repairId: number } | null;
      if (staged) assignments.set(staged.repairId, { physicalTag: staged.physicalTag });
      return result;
    },
  } as unknown as PrismaClient;
  return { db, assignments, get creates() { return creates; }, triggerRace() { race = true; } };
}

test("input requires 1..30 unique positive integer Repair IDs", () => {
  assert.deepEqual(parseB2bBatchTagInput({ repairIds: [1, 2] }), [1, 2]);
  for (const body of [null, {}, { repairIds: [] }, { repairIds: [1, 1] }, { repairIds: [0] },
    { repairIds: ["1"] }, { repairIds: [1], label: "untrusted" },
    { repairIds: Array.from({ length: 31 }, (_, i) => i + 1) }]) {
    assert.throws(() => parseB2bBatchTagInput(body));
  }
});

test("missing, B2C, and mixed-customer repairs fail before issuance", async () => {
  for (const rows of [[repair(10)], [repair(10, 7, "individual"), repair(11)], [repair(10, 8), repair(11)]]) {
    const f = fixture(rows);
    await assert.rejects(() => prepareB2bBatchPhysicalTags(f.db, [10, 11], 42));
    assert.equal(f.creates, 0);
  }
});

test("reuses active tag, issues only missing, preserves order and canonical private QR", async () => {
  const f = fixture();
  const first = await prepareB2bBatchPhysicalTags(f.db, [11, 10], 42);
  assert.deepEqual(first.map(item => [item.repairId, item.shortCode, item.reused]),
    [[11, "PT-000003", true], [10, "PT-000004", false]]);
  assert.equal(first[0].label.qrPayload, "existing-token");
  assert.equal(first[1].label.qrPayload, "new-token-4");
  assert.equal(first[1].label.customerName, "Partner Co");
  assert.equal(first[1].label.brand, "ロレックス");
  assert.equal(first[1].label.caliber, "3135");
  assert.ok(!first[1].label.qrPayload.includes(first[1].label.inquiryNumber));
  assert.ok(!first[1].label.qrPayload.includes(first[1].label.customerName));
  assert.equal(f.creates, 1);
  const second = await prepareB2bBatchPhysicalTags(f.db, [11, 10], 42);
  assert.ok(second.every(item => item.reused));
  assert.equal(f.creates, 1);
});

test("assignment race refetches the winning active tag", async () => {
  const f = fixture();
  f.triggerRace();
  const result = await prepareB2bBatchPhysicalTags(f.db, [10], 42);
  assert.equal(result[0].shortCode, "PT-000099");
  assert.equal(result[0].label.qrPayload, "race-token");
  assert.equal(result[0].reused, true);
});
