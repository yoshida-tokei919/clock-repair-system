import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { parseStartInput } from "./work-time-session-domain";
import { correctWorkTimeSession, invalidateWorkTimeSession, startWorkTimeSession, stopWorkTimeSession } from "./work-time-sessions";

function fakeDb() {
  type Row = {
    id: number; startedAt: Date; endedAt: Date | null; invalidatedAt: Date | null;
    originalStartedAt: Date | null; originalEndedAt: Date | null;
    adjustmentReason?: string; invalidationReason?: string;
    contextSnapshot?: unknown; workLabelSnapshot?: string | null;
  };
  const rows: Row[] = [];
  let locks = 0;
  const workTimeSession = {
    findFirst: async () => rows.find(row => !row.endedAt && !row.invalidatedAt) ?? null,
    findUnique: async ({ where }: { where: { id: number } }) => rows.find(row => row.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: number }; data: Partial<Row> }) => {
      const row = rows.find(item => item.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
    create: async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: rows.length + 1, startedAt: data.startedAt!, endedAt: null, invalidatedAt: null,
        originalStartedAt: null, originalEndedAt: null, contextSnapshot: data.contextSnapshot,
        workLabelSnapshot: data.workLabelSnapshot,
      };
      rows.push(row);
      return { ...row };
    },
  };
  const tx = { workTimeSession, $executeRaw: async () => { locks++; } };
  const db = {
    workTimeSession,
    repair: { findUnique: async () => null },
    inquiry: { findUnique: async () => null },
    orderRequest: { findUnique: async () => null },
    repairLineItem: { findFirst: async () => null },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { db: db as unknown as PrismaClient, rows, get locks() { return locks; } };
}

test("start without active, atomic switch, stop and idempotent stop", async () => {
  const fake = fakeDb();
  const start = parseStartInput({ activityType: "ADMIN", label: "事務" });
  const first = await startWorkTimeSession(fake.db, start);
  assert.equal(first.id, 1);
  assert.equal(first.startedAt.getUTCMilliseconds(), 0);
  const second = await startWorkTimeSession(fake.db, parseStartInput({ activityType: "INQUIRY" }));
  assert.equal(second.id, 2);
  assert.deepEqual(fake.rows[0].endedAt, second.startedAt);
  assert.equal(fake.rows.filter(row => !row.endedAt && !row.invalidatedAt).length, 1);
  const stopped = await stopWorkTimeSession(fake.db);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.session?.id, 2);
  assert.equal((await stopWorkTimeSession(fake.db)).stopped, false);
  assert.equal(fake.locks, 4);
});

test("active invalidate closes it and repeated invalidate is idempotent", async () => {
  const fake = fakeDb();
  const started = await startWorkTimeSession(fake.db, parseStartInput({ activityType: "OTHER" }));
  const invalidated = await invalidateWorkTimeSession(fake.db, started.id, "誤計測");
  assert.equal(invalidated?.invalidationReason, "誤計測");
  assert.ok(invalidated?.endedAt);
  assert.ok(invalidated?.invalidatedAt);
  assert.equal((await stopWorkTimeSession(fake.db)).stopped, false);
  const again = await invalidateWorkTimeSession(fake.db, started.id, "別理由");
  assert.deepEqual(again?.invalidatedAt, invalidated?.invalidatedAt);
  assert.equal(again?.invalidationReason, "誤計測");
});

test("completed correction keeps first originals and invalidated rows refuse correction", async () => {
  const fake = fakeDb();
  const started = await startWorkTimeSession(fake.db, parseStartInput({ activityType: "ADMIN" }));
  await assert.rejects(() => correctWorkTimeSession(fake.db, started.id, {
    startedAt: new Date("2026-01-01T00:00:00Z"), endedAt: new Date("2026-01-01T01:00:00Z"), reason: "active",
  }));
  const stopped = await stopWorkTimeSession(fake.db);
  const first = await correctWorkTimeSession(fake.db, started.id, {
    startedAt: new Date("2026-01-01T00:00:00Z"), endedAt: new Date("2026-01-01T01:00:00Z"), reason: "first",
  });
  assert.deepEqual(first?.originalStartedAt, started.startedAt);
  assert.deepEqual(first?.originalEndedAt, stopped.session?.endedAt);
  const second = await correctWorkTimeSession(fake.db, started.id, {
    startedAt: new Date("2026-01-01T00:10:00Z"), endedAt: new Date("2026-01-01T01:10:00Z"), reason: "second",
  });
  assert.deepEqual(second?.originalStartedAt, started.startedAt);
  assert.deepEqual(second?.originalEndedAt, stopped.session?.endedAt);
  await invalidateWorkTimeSession(fake.db, started.id, "誤計測");
  await assert.rejects(() => correctWorkTimeSession(fake.db, started.id, {
    startedAt: new Date("2026-01-01T00:00:00Z"), endedAt: new Date("2026-01-01T01:00:00Z"), reason: "invalidated",
  }));
});

test("start validates related records and snapshots LABOR without persistent line ID", async () => {
  const fake = fakeDb();
  const db = fake.db as unknown as {
    repair: { findUnique: () => Promise<unknown> };
    orderRequest: { findUnique: () => Promise<unknown> };
    repairLineItem: { findFirst: () => Promise<unknown> };
  };
  const input = parseStartInput({ activityType: "REPAIR", repairId: 1, repairLineItemId: 2, orderRequestId: 3 });
  await assert.rejects(() => startWorkTimeSession(fake.db, input), /repairId does not exist/);
  db.repair.findUnique = async () => ({
    inquiryNumber: "T-001", movementMakerId: null, movementMaker: null,
    movementCaliberId: null, movementCaliber: null, baseMovementMakerId: null, baseMovementMaker: null,
    baseMovementCaliberId: null, baseMovementCaliber: null, watchId: 5,
    watch: {
      brandId: 6, brand: { name: "Brand" }, modelId: null, model: null,
      referenceId: null, reference: null, caseReferenceId: null, caseReference: null,
      caliberId: null, caliber: null, baseCaliberId: null, baseCaliber: null, driveType: "QUARTZ",
    },
  });
  db.orderRequest.findUnique = async () => ({ repairId: 4 });
  db.repairLineItem.findFirst = async () => ({
    lineType: "LABOR", itemNameSnapshot: "OH", estimateDisplayNameSnapshot: "オーバーホール",
    repairWorkCategoryId: null, categoryNameSnapshot: null, repairWorkCategory: null,
    targetPartNameId: null, targetPartNameSnapshot: null, targetPartName: null,
    repairWorkActionId: null, actionNameSnapshot: null, repairWorkAction: null,
    detailLabelSnapshot: null,
  });
  await assert.rejects(() => startWorkTimeSession(fake.db, input), /different repair/);
  db.orderRequest.findUnique = async () => ({ repairId: 1 });
  db.repairLineItem.findFirst = async () => ({
    lineType: "PART", itemNameSnapshot: "部品", estimateDisplayNameSnapshot: null,
    repairWorkCategoryId: null, categoryNameSnapshot: null, repairWorkCategory: null,
    targetPartNameId: null, targetPartNameSnapshot: null, targetPartName: null,
    repairWorkActionId: null, actionNameSnapshot: null, repairWorkAction: null,
    detailLabelSnapshot: null,
  });
  await assert.rejects(() => startWorkTimeSession(fake.db, input), /LABOR/);
  db.repairLineItem.findFirst = async () => ({
    lineType: "LABOR", itemNameSnapshot: "OH", estimateDisplayNameSnapshot: "オーバーホール",
    repairWorkCategoryId: null, categoryNameSnapshot: null, repairWorkCategory: null,
    targetPartNameId: null, targetPartNameSnapshot: null, targetPartName: null,
    repairWorkActionId: null, actionNameSnapshot: null, repairWorkAction: null,
    detailLabelSnapshot: null,
  });
  const session = await startWorkTimeSession(fake.db, input);
  assert.equal(session.workLabelSnapshot, "オーバーホール");
  const snapshot = session.contextSnapshot as { repair: { inquiryNumber: string }; work: { itemName: string } };
  assert.equal(snapshot.repair.inquiryNumber, "T-001");
  assert.equal(snapshot.work.itemName, "OH");
  assert.equal("repairLineItemId" in session, false);
  assert.equal("repairLineItemId" in snapshot.work, false);
});
