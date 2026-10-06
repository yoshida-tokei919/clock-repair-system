import assert from "node:assert/strict";
import test from "node:test";
import { B2bBatchIntakeError, createB2bBatchIntake, parseB2bBatchPayload } from "./b2b-batch-intake";

const row = { brandId: 4, partnerRef: "P-1", endUserName: "Owner", model: "", ref: "",
  serial: "S-1", caliber: "", note: "Check crown" };

test("payload requires an existing partner ID, 1–30 rows and a selected brand", () => {
  assert.equal(parseB2bBatchPayload({ partnerId: 1, rows: Array(30).fill(row) }).rows.length, 30);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 0, rows: [row] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: Array(31).fill(row) }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, brandId: 0 }] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, note: "x".repeat(1001) }] }), B2bBatchIntakeError);
  assert.deepEqual(parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, model: "  ", serial: " S-1 " }] }).rows[0],
    { ...row, model: null, ref: null, caliber: null, serial: "S-1" });
});

function fixture(options: {
  failAt?: number; failCode?: string; type?: string; isPartner?: boolean;
  validBrand?: boolean; currentSeq?: number; existing?: string[];
} = {}) {
  const events: string[] = [];
  const persisted: any[] = [];
  const watches: any[] = [];
  const logs: any[] = [];
  let currentSeq = options.currentSeq ?? 7;
  let transactionCount = 0;
  let brandWhere: any;
  const partner = {
    id: 2, type: options.type ?? "business", isPartner: options.isPartner ?? true, prefix: "AB", currentSeq,
    name: "Partner", companyName: "Partner Co", zipCode: "1000001", prefecture: "東京都",
    city: "千代田区", street: "千代田1", building: null, phone: "0312345678",
  };
  const db = {
    $transaction: async (callback: (tx: any) => Promise<any>, config: any) => {
      transactionCount += 1;
      assert.deepEqual(config, { isolationLevel: "ReadCommitted", timeout: 20000 });
      const pendingRepairs: any[] = [];
      const pendingWatches: any[] = [];
      const pendingLogs: any[] = [];
      let pendingSeq = currentSeq;
      const tx = {
        $queryRaw: async () => { events.push("lock"); return [{ id: 2 }]; },
        customer: {
          findUnique: async () => { events.push("customer-read"); return { ...partner, currentSeq }; },
          update: async ({ data }: any) => { pendingSeq = data.currentSeq; },
        },
        brand: { findMany: async ({ where }: any) => {
          brandWhere = where;
          return options.validBrand === false ? [] : [{ id: 4 }];
        } },
        repair: {
          findMany: async () => (options.existing ?? ["AB-010", "AB-legacy"])
            .map((inquiryNumber) => ({ inquiryNumber })),
          create: async ({ data }: any) => {
            if (options.failAt === pendingRepairs.length + 1) {
              throw Object.assign(new Error("insert failed"), { code: options.failCode });
            }
            const created = { id: 101 + pendingRepairs.length, ...data };
            pendingRepairs.push(created);
            return created;
          },
        },
        watch: { create: async ({ data }: any) => {
          const watch = { id: 201 + pendingWatches.length, ...data };
          pendingWatches.push(watch);
          return watch;
        } },
        repairStatusLog: { create: async ({ data }: any) => { pendingLogs.push(data); } },
      };
      const result = await callback(tx);
      persisted.push(...pendingRepairs);
      watches.push(...pendingWatches);
      logs.push(...pendingLogs);
      currentSeq = pendingSeq;
      return result;
    },
  };
  return { db: db as any, events, persisted, watches, logs,
    get brandWhere() { return brandWhere; }, get transactionCount() { return transactionCount; },
    get currentSeq() { return currentSeq; } };
}

test("one transaction locks partner before sequence read and creates each intake record", async () => {
  const state = fixture();
  const input = parseB2bBatchPayload({ partnerId: 2, rows: [row, { ...row, partnerRef: "P-2" }] });
  const result = await createB2bBatchIntake(state.db, input, 9);
  assert.deepEqual(result.repairs.map((repair) => repair.inquiryNumber), ["AB-011", "AB-012"]);
  assert.deepEqual(state.events.slice(0, 2), ["lock", "customer-read"]);
  assert.equal(state.transactionCount, 1);
  assert.deepEqual(state.brandWhere, {
    id: { in: [4] }, isWatchBrand: true, brandKind: { not: "TYPE" },
  });
  assert.equal(state.currentSeq, 12);
  assert.equal(state.watches.length, 2);
  assert.equal(state.persisted.length, 2);
  assert.equal(state.persisted[0].status, "受付");
  assert.equal(state.persisted[0].partsAllocationLegacy, false);
  assert.equal(state.persisted[0].internalNotes, "Check crown");
  assert.equal(state.persisted[0].returnRecipientName, "Partner Co");
  assert.equal(state.persisted[0].returnPostalCode, "1000001");
  assert.equal(state.persisted[0].returnPrefecture, "東京都");
  assert.equal(state.persisted[0].returnCity, "千代田区");
  assert.equal(state.persisted[0].returnStreet, "千代田1");
  assert.equal(state.persisted[0].returnBuilding, null);
  assert.equal(state.persisted[0].returnPhone, "0312345678");
  assert.equal(state.logs.length, 2);
  assert.deepEqual(state.logs.map((log) => [log.status, log.changedBy]), [["受付", 9], ["受付", 9]]);
  assert.ok(state.logs.every((log) => log.changedAt === state.persisted[0].receptionDate));
});

test("invalid partner or brand creates no rows", async () => {
  for (const options of [{ type: "individual" }, { isPartner: false }, { validBrand: false }]) {
    const state = fixture(options);
    await assert.rejects(createB2bBatchIntake(state.db, parseB2bBatchPayload({ partnerId: 2, rows: [row] }), 9), B2bBatchIntakeError);
    assert.equal(state.persisted.length, 0);
    assert.equal(state.currentSeq, 7);
  }
  const state = fixture();
  await assert.rejects(createB2bBatchIntake(state.db,
    parseB2bBatchPayload({ partnerId: 2, rows: [row, { ...row, brandId: 999 }] }), 9), B2bBatchIntakeError);
  assert.equal(state.persisted.length, 0);
  assert.equal(state.currentSeq, 7);
});

test("sequence starts above currentSeq when it exceeds existing repair numbers", async () => {
  const state = fixture({ currentSeq: 20, existing: ["AB-010", "AB-legacy", "AB-011-extra"] });
  const result = await createB2bBatchIntake(state.db,
    parseB2bBatchPayload({ partnerId: 2, rows: [row, row] }), 9);
  assert.deepEqual(result.repairs.map(({ inquiryNumber }) => inquiryNumber), ["AB-021", "AB-022"]);
  assert.equal(state.currentSeq, 22);
});

test("failure on a later row rolls back the entire batch", async () => {
  const state = fixture({ failAt: 2 });
  await assert.rejects(createB2bBatchIntake(state.db,
    parseB2bBatchPayload({ partnerId: 2, rows: [row, row] }), 9), /insert failed/);
  assert.equal(state.persisted.length, 0);
  assert.equal(state.watches.length, 0);
  assert.equal(state.logs.length, 0);
  assert.equal(state.currentSeq, 7);
});

test("a unique-number conflict aborts the batch and leaves the sequence unchanged", async () => {
  const state = fixture({ failAt: 2, failCode: "P2002" });
  await assert.rejects(createB2bBatchIntake(state.db,
    parseB2bBatchPayload({ partnerId: 2, rows: [row, row] }), 9),
    (error: any) => error.code === "P2002");
  assert.equal(state.transactionCount, 1);
  assert.equal(state.persisted.length, 0);
  assert.equal(state.watches.length, 0);
  assert.equal(state.logs.length, 0);
  assert.equal(state.currentSeq, 7);
});
