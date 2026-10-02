import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { auditStorageLocation, parseStorageLocationAudit, storageLocationAuditFailure } from "./storage-location-audit";

const locations = [
  { id: 1, name: "棚A", shortCode: "LOC-000001", locationType: "SHELF", isActive: true },
  { id: 2, name: "箱B", shortCode: "LOC-000002", locationType: "BOX", isActive: true },
  { id: 3, name: "無効", shortCode: null, locationType: "OTHER", isActive: false },
];
const repairs = [10, 11, 12, 13].map(id => ({ id, inquiryNumber: `T-${id}` }));
const rows = [{ repairId: 10, storageLocationId: 1 }, { repairId: 11, storageLocationId: 2 },
  { repairId: 13, storageLocationId: 1 }];

function fixture() {
  const reads: string[] = [];
  const tx = {
    storageLocation: { findUnique: async ({ where }: any) => {
      reads.push("location.findUnique");
      return locations.find(row => row.id === where.id) ?? null;
    } },
    repair: { findMany: async ({ where }: any) => {
      reads.push("repair.findMany");
      return repairs.filter(row => where.id.in.includes(row.id));
    } },
    storageLocationAssignment: { findMany: async ({ where }: any) => {
      reads.push("assignment.findMany");
      assert.equal(where.releasedAt, null);
      return rows.filter(row => row.storageLocationId === where.OR[0].storageLocationId ||
        where.OR[1].repairId.in.includes(row.repairId)).map(row => ({ ...row,
        repair: repairs.find(repair => repair.id === row.repairId)!,
        storageLocation: locations.find(location => location.id === row.storageLocationId)!,
      }));
    } },
  };
  const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "RepeatableRead" });
    return callback(tx);
  } } as unknown as PrismaClient;
  return { db, reads };
}

test("audit classifies match, other location, unassigned and missing in one read-only snapshot", async () => {
  const f = fixture();
  const result = await auditStorageLocation(f.db, { storageLocationId: 1, repairIds: [10, 11, 12] });
  assert.deepEqual(result.scanned.map(item => item.classification), ["MATCH", "OTHER_LOCATION", "UNASSIGNED"]);
  assert.equal(result.scanned[1].currentLocation?.name, "箱B");
  assert.equal(result.scanned[2].currentLocation, null);
  assert.deepEqual(result.missing, [{ repairId: 13, inquiryNumber: "T-13" }]);
  assert.deepEqual(result.counts, { match: 1, otherLocation: 1, unassigned: 1, missing: 1 });
  assert.deepEqual(f.reads, ["location.findUnique", "repair.findMany", "assignment.findMany"]);
  assert.equal(JSON.stringify(result).includes("qrToken"), false);
  assert.equal(JSON.stringify(result).includes("nfcUid"), false);
});

test("empty scan reports every active assignment at target as missing", async () => {
  const f = fixture();
  const result = await auditStorageLocation(f.db, { storageLocationId: 1, repairIds: [] });
  assert.deepEqual(result.missing, [{ repairId: 10, inquiryNumber: "T-10" }, { repairId: 13, inquiryNumber: "T-13" }]);
  assert.deepEqual(result.counts, { match: 0, otherLocation: 0, unassigned: 0, missing: 2 });
  assert.deepEqual(f.reads, ["location.findUnique", "assignment.findMany"]);
});

test("missing or inactive target and missing scanned Repair fail closed without writes", async () => {
  for (const [storageLocationId, repairIds, status] of [[99, [10], 404], [3, [10], 409], [1, [99], 404]] as const) {
    const f = fixture();
    await assert.rejects(() => auditStorageLocation(f.db, { storageLocationId, repairIds: [...repairIds] }),
      error => storageLocationAuditFailure(error).status === status);
    assert.equal(f.reads.some(read => read.includes("create") || read.includes("update") || read.includes("delete")), false);
  }
  assert.deepEqual(storageLocationAuditFailure(new Error("unexpected")),
    { status: 500, message: "棚卸し結果を確認できませんでした。" });
});

test("audit input accepts 0 through 100 unique PostgreSQL Int IDs and exact keys", () => {
  assert.deepEqual(parseStorageLocationAudit({ storageLocationId: 1, repairIds: [] }),
    { storageLocationId: 1, repairIds: [] });
  const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.deepEqual(parseStorageLocationAudit({ storageLocationId: 2147483647, repairIds: hundred }).repairIds, hundred);
  for (const body of [null, [], Object.create(null), { storageLocationId: 1 },
    { storageLocationId: 1, repairIds: [...hundred, 101] }, { storageLocationId: 1, repairIds: [1, 1] },
    { storageLocationId: 0, repairIds: [] }, { storageLocationId: 2147483648, repairIds: [] },
    { storageLocationId: 1.5, repairIds: [] }, { storageLocationId: 1, repairIds: [0] },
    { storageLocationId: 1, repairIds: [2147483648] }, { storageLocationId: 1, repairIds: ["1"] },
    { storageLocationId: 1, repairIds: [], extra: true }]) {
    assert.throws(() => parseStorageLocationAudit(body), error => storageLocationAuditFailure(error).status === 400);
  }
});
