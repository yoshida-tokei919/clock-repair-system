import assert from "node:assert/strict";
import test from "node:test";
import { B2bBatchIntakeError, createB2bBatchIntake, parseB2bBatchPayload } from "./b2b-batch-intake";

const row = { brandId: 4, partnerRef: "P-1", endUserName: "Owner", model: "", ref: "",
  serial: "S-1", caliber: "", workSummary: "Check crown" };

test("payload requires an existing partner ID, 1–30 rows and a selected brand", () => {
  assert.equal(parseB2bBatchPayload({ partnerId: 1, rows: Array(30).fill(row) }).rows.length, 30);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 0, rows: [row] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: Array(31).fill(row) }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, brandId: 0 }] }), B2bBatchIntakeError);
  assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, workSummary: "x".repeat(1001) }] }), B2bBatchIntakeError);
  assert.deepEqual(parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, model: "  ", serial: " S-1 " }] }).rows[0],
    { partnerRef: "P-1", endUserName: "Owner", brandId: 4, brandName: null,
      model: null, ref: null, serial: "S-1", caliber: null,
      movementMaker: null, movementCaliber: null, baseMovementMaker: null, baseMovementCaliber: null,
      workSummary: "Check crown" });
  assert.equal(parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, brandId: null, brandName: " ROLEX " }] }).rows[0].brandName, "ROLEX");
  for (const brandId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4", ""]) {
    assert.throws(() => parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, brandId, brandName: "ROLEX" }] }), B2bBatchIntakeError);
  }
  assert.equal(parseB2bBatchPayload({ partnerId: 1, rows: [{ ...row, note: "legacy memo" }] }).rows[0].workSummary, "Check crown");
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
  assert.equal(state.persisted[0].workSummary, "Check crown");
  assert.equal("internalNotes" in state.persisted[0], false);
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

function masterFixture() {
  const stored = {
    brands: [
      { id: 4, name: "ROLEX", nameJp: "ロレックス", nameEn: "ROLEX", brandKind: "NORMAL", isWatchBrand: true, isMovementMaker: false },
      { id: 5, name: "TYPE", nameJp: "TYPE", nameEn: "TYPE", brandKind: "TYPE", isWatchBrand: false, isMovementMaker: false },
      { id: 6, name: "ETA", nameJp: "ETA", nameEn: "ETA", brandKind: "NORMAL", isWatchBrand: false, isMovementMaker: false },
      { id: 7, name: "OMEGA", nameJp: "オメガ", nameEn: "OMEGA", brandKind: "NORMAL", isWatchBrand: true, isMovementMaker: false },
    ] as any[], aliases: [{ brandId: 4, alias: "勞力士", normalizedAlias: "勞力士" }] as any[], models: [] as any[], calibers: [] as any[], refs: [] as any[],
    watches: [] as any[], repairs: [] as any[], logs: [] as any[], currentSeq: 0,
  };
  let transactionCount = 0;
  const db = { $transaction: async (callback: (tx: any) => Promise<any>) => {
    transactionCount++;
    const work = structuredClone(stored);
    const tx = {
      $queryRaw: async () => [{ id: 2 }],
      customer: {
        findUnique: async () => ({ id: 2, type: "business", isPartner: true, prefix: "AB",
          currentSeq: work.currentSeq, name: "Partner", companyName: "Partner Co" }),
        update: async ({ data }: any) => { work.currentSeq = data.currentSeq; },
      },
      brandAlias: { findUnique: async ({ where }: any) => {
        const alias = work.aliases.find((item) => item.normalizedAlias === where.normalizedAlias);
        return alias ? { ...alias, brand: work.brands.find((brand) => brand.id === alias.brandId) } : null;
      }, create: async ({ data }: any) => work.aliases.push(data) },
      brand: {
        findMany: async ({ where }: any = {}) => where?.id
          ? work.brands.filter((brand) => where.id.in.includes(brand.id) && brand.isWatchBrand && brand.brandKind !== "TYPE")
          : work.brands,
        update: async ({ where, data }: any) => Object.assign(work.brands.find((brand) => brand.id === where.id), data),
        create: async ({ data }: any) => {
          const brand = { id: work.brands.length + 4, ...data, brandKind: "NORMAL" };
          work.brands.push(brand);
          work.aliases.push({ brandId: brand.id, ...data.aliases.create });
          return brand;
        },
      },
      model: { findMany: async ({ where }: any) => work.models.filter((item) => item.brandId === where.brandId),
        create: async ({ data }: any) => { const item = { id: work.models.length + 1, ...data }; work.models.push(item); return item; } },
      caliber: { findMany: async ({ where }: any) => work.calibers.filter((item) => item.brandId === where.brandId),
        create: async ({ data }: any) => { const item = { id: work.calibers.length + 1, ...data }; work.calibers.push(item); return item; } },
      watchReference: { findMany: async ({ where }: any) => work.refs.filter((item) => item.modelId === where.modelId),
        create: async ({ data }: any) => { const item = { id: work.refs.length + 1, ...data }; work.refs.push(item); return item; } },
      watch: { create: async ({ data }: any) => { const item = { id: work.watches.length + 1, ...data }; work.watches.push(item); return item; } },
      repair: { findMany: async () => [], create: async ({ data }: any) => {
        const item = { id: work.repairs.length + 1, ...data }; work.repairs.push(item); return item;
      } },
      repairStatusLog: { create: async ({ data }: any) => work.logs.push(data) },
    };
    const result = await callback(tx);
    Object.assign(stored, work);
    return result;
  } };
  return { db: db as any, stored, get transactionCount() { return transactionCount; } };
}

test("valid brand ID with matching canonical or alias name is accepted", async () => {
  const state = masterFixture();
  await createB2bBatchIntake(state.db, parseB2bBatchPayload({ partnerId: 2, rows: [
    { ...row, brandName: "ロレックス" },
    { ...row, brandName: "勞力士" },
    { ...row },
  ] }), 9);
  assert.deepEqual(state.stored.watches.map((watch) => watch.brandId), [4, 4, 4]);
  assert.equal(state.stored.repairs.length, 3);
});

test("conflicting brand ID and name rejects the whole batch before Watch or Repair writes", async () => {
  const state = masterFixture();
  await assert.rejects(createB2bBatchIntake(state.db, parseB2bBatchPayload({ partnerId: 2, rows: [
    { ...row }, { ...row, brandName: "OMEGA" },
  ] }), 9), B2bBatchIntakeError);
  assert.equal(state.stored.watches.length, 0);
  assert.equal(state.stored.repairs.length, 0);
  assert.equal(state.stored.logs.length, 0);
  assert.equal(state.stored.currentSeq, 0);
});

test("free watch brand and movement masters resolve in the same transaction", async () => {
  const state = masterFixture();
  const input = parseB2bBatchPayload({ partnerId: 2, rows: [{ ...row, brandId: null,
    brandName: "New Watch", model: "M1", ref: "R1", caliber: "C1", movementMaker: "ETA",
    movementCaliber: "2824", baseMovementMaker: "New Base", baseMovementCaliber: "B1",
    note: "must be ignored" }] });
  await createB2bBatchIntake(state.db, input, 9);
  assert.equal(state.transactionCount, 1);
  const watchBrand = state.stored.brands.find((brand) => brand.name === "New Watch");
  const baseMaker = state.stored.brands.find((brand) => brand.name === "New Base");
  assert.equal(watchBrand.isWatchBrand, true);
  assert.equal(baseMaker.isMovementMaker, true);
  assert.equal(state.stored.brands.find((brand) => brand.name === "ETA").isMovementMaker, true);
  assert.equal(state.stored.watches[0].brandId, watchBrand.id);
  assert.equal(state.stored.refs[0].caliberId, state.stored.watches[0].caliberId);
  assert.equal(state.stored.calibers.find((item) => item.id === state.stored.repairs[0].movementCaliberId).brandId, 6);
  assert.equal(state.stored.calibers.find((item) => item.id === state.stored.repairs[0].baseMovementCaliberId).brandId, baseMaker.id);
  assert.equal(state.stored.repairs[0].movementMakerId, 6);
  assert.equal(state.stored.repairs[0].baseMovementMakerId, baseMaker.id);
  assert.equal(state.stored.repairs[0].workSummary, "Check crown");
  assert.equal("internalNotes" in state.stored.repairs[0], false);
});

test("TYPE normalized collision rolls back earlier master and repair creation", async () => {
  const state = masterFixture();
  await assert.rejects(createB2bBatchIntake(state.db,
    parseB2bBatchPayload({ partnerId: 2, rows: [
      { ...row, brandId: null, brandName: "New Watch" },
      { ...row, brandId: null, brandName: "Type" },
    ] }), 9), B2bBatchIntakeError);
  assert.equal(state.stored.brands.some((brand) => brand.name === "New Watch"), false);
  assert.equal(state.stored.watches.length, 0);
  assert.equal(state.stored.repairs.length, 0);
  assert.equal(state.stored.currentSeq, 0);
});

test("blank movement maker keeps caliber unscoped; TYPE maker collision fails closed", async () => {
  const state = masterFixture();
  await createB2bBatchIntake(state.db, parseB2bBatchPayload({ partnerId: 2,
    rows: [{ ...row, movementCaliber: "No maker" }] }), 9);
  assert.equal(state.stored.repairs[0].movementMakerId, null);
  assert.equal(state.stored.calibers.find((item) => item.id === state.stored.repairs[0].movementCaliberId).brandId, null);
  await assert.rejects(createB2bBatchIntake(state.db, parseB2bBatchPayload({ partnerId: 2,
    rows: [{ ...row, movementMaker: "type", movementCaliber: "Must roll back" }] }), 9), B2bBatchIntakeError);
  assert.equal(state.stored.calibers.some((item) => item.name === "mustrollback"), false);
  assert.equal(state.stored.repairs.length, 1);
});
