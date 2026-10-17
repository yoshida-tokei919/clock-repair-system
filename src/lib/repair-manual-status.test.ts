import assert from "node:assert/strict";
import test from "node:test";

import { assertGenericRepairPatchAllowed, assertManualRepairStatusTransition, assertRepairStatus, correctManualStatusDate, parseManualDate, persistManualRepairStatus } from "./repair-manual-status";

test("manual approval time is interpreted in Japan time", () => {
  assert.equal(parseManualDate("2026-10-14T09:35", true).toISOString(), "2026-10-14T00:35:00.000Z");
  assert.equal(parseManualDate("2026/10/14").toISOString(), "2026-10-13T15:00:00.000Z");
});

test("invalid and overflowing dates are rejected", () => {
  for (const value of ["2026-02-30", "2026-13-01", "2026-10-14T24:00", "2026-10-14T09:60"]) {
    assert.throws(() => parseManualDate(value, value.includes("T")));
  }
});

test("only known repair statuses are accepted", () => {
  assert.doesNotThrow(() => assertRepairStatus("作業中"));
  assert.throws(() => assertRepairStatus("approved"));
});

test("generic full Repair edit is blocked after dedicated return", () => {
  assert.throws(() => assertGenericRepairPatchAllowed("修理不可返却"));
  assert.throws(() => assertGenericRepairPatchAllowed("キャンセル返却"));
  assert.doesNotThrow(() => assertGenericRepairPatchAllowed("作業完了"));
});

test("generic status changes cannot enter either return status, while stored return status stays valid", async () => {
  for (const status of ["修理不可返却", "キャンセル返却"]) {
    assert.doesNotThrow(() => assertRepairStatus(status));
    assert.throws(() => assertManualRepairStatusTransition("作業中", status), /専用の返却処理/);
    assert.throws(() => assertManualRepairStatusTransition(status, status));
    const tx = { repair: { findUniqueOrThrow: async () => ({ status: "作業中" }), update: async () => { throw new Error("unexpected write"); } } };
    await assert.rejects(persistManualRepairStatus(tx as never, 7, status, 42), /専用の返却処理/);
    await assert.rejects(correctManualStatusDate({} as never, 7, status, new Date(), 42, status), /通常のステータス編集から変更できません/);
  }
});

test("same-status reception correction keeps approval pending and older history intact", async () => {
  const repair = { id: 7, status: "受付", receptionDate: new Date("2026-10-01T00:00:00Z"), approvalStatus: "pending", approvalDate: null, partsAllocationLegacy: true, customer: { type: "business" } };
  const logs = [
    { id: 1, repairId: 7, status: "受付", changedAt: new Date("2026-10-01T00:00:00Z"), changedBy: null as number | null },
    { id: 2, repairId: 7, status: "受付", changedAt: new Date("2026-10-02T00:00:00Z"), changedBy: null as number | null },
  ];
  const tx = {
    repair: {
      findUniqueOrThrow: async () => ({ ...repair }),
      findUnique: async () => ({ ...repair }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(repair, data),
    },
    repairStatusLog: {
      findFirst: async ({ where }: { where: { status?: string | { not: { startsWith: string } } } }) =>
        [...logs].reverse().find((log) => typeof where.status === "string" ? log.status === where.status
          : where.status ? !log.status.startsWith(where.status.not.startsWith) : true) ?? null,
      create: async ({ data }: { data: { status: string; repairId: number } }) => {
        const log = { id: logs.length + 1, ...data, changedAt: new Date(), changedBy: null };
        logs.push(log);
        return log;
      },
      update: async ({ where, data }: { where: { id: number }; data: { changedAt?: Date; changedBy?: number } }) =>
        Object.assign(logs.find((log) => log.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: { gt: number } }; data: { changedBy: number } }) => {
        logs.filter((log) => log.id > where.id.gt).forEach((log) => { log.changedBy = data.changedBy; });
      },
    },
  };
  const date = parseManualDate("2026-10-14");
  await persistManualRepairStatus(tx as never, 7, "受付", 42, date);
  assert.equal(repair.receptionDate.toISOString(), date.toISOString());
  assert.equal(repair.approvalStatus, "pending");
  assert.equal(repair.approvalDate, null);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].changedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(logs[1].changedAt.toISOString(), date.toISOString());
  assert.equal(logs[1].changedBy, 42);
});

test("normalized parts status keeps its own date and audits reconciliation-created log", async () => {
  const repair = { id: 9, status: "見積中", approvalStatus: "pending", partsAllocationLegacy: false, customer: { type: "business" } };
  const logs = [{ id: 1, repairId: 9, status: "見積中", changedAt: new Date("2026-10-01T00:00:00Z"), changedBy: null as number | null }];
  const tx = {
    repair: {
      findUniqueOrThrow: async () => ({ ...repair }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(repair, data),
    },
    repairStatusLog: {
      findFirst: async ({ where }: { where: { status?: string | { not: { startsWith: string } } } }) =>
        [...logs].reverse().find((log) => typeof where.status === "string" ? log.status === where.status
          : where.status ? !log.status.startsWith(where.status.not.startsWith) : true) ?? null,
      create: async ({ data }: { data: { status: string } }) => {
        const log = { id: logs.length + 1, repairId: 9, status: data.status, changedAt: new Date(), changedBy: null };
        logs.push(log);
        return log;
      },
      updateMany: async ({ where, data }: { where: { id: { gt: number } }; data: { changedBy: number } }) => {
        logs.filter((log) => log.id > where.id.gt).forEach((log) => { log.changedBy = data.changedBy; });
      },
      update: async ({ where, data }: { where: { id: number }; data: { changedAt: Date; changedBy: number } }) =>
        Object.assign(logs.find((log) => log.id === where.id)!, data),
    },
  };
  const reconcile = async () => {
    repair.status = "部品待ち(未注文)";
    logs.push({ id: 2, repairId: 9, status: repair.status, changedAt: new Date("2026-10-14T02:00:00Z"), changedBy: null });
    return { status: repair.status, activeOrderStatuses: ["pending"], allRequiredPartsAllocated: false, skippedForLegacy: false };
  };
  const result = await persistManualRepairStatus(tx as never, 9, "作業待ち", 42, parseManualDate("2026-10-13"), reconcile as never);
  assert.equal(result.repair.status, "部品待ち(未注文)");
  assert.equal(result.reconciliation.status, "部品待ち(未注文)");
  assert.equal(repair.status, "部品待ち(未注文)");
  assert.equal(logs[1].changedAt.toISOString(), "2026-10-14T02:00:00.000Z");
  assert.equal(logs[1].changedBy, 42);
});

test("reception correction updates Repair.receptionDate and the latest log atomically", async () => {
  const repair = { id: 10, status: "作業中", receptionDate: new Date("2026-10-01T00:00:00Z") };
  const logs = [
    { id: 1, status: "受付", changedAt: new Date("2026-10-01T00:00:00Z"), changedBy: null as number | null },
    { id: 2, status: "受付", changedAt: new Date("2026-10-02T00:00:00Z"), changedBy: null as number | null },
  ];
  const tx = {
    repair: { update: async ({ data }: { data: { receptionDate: Date } }) => Object.assign(repair, data) },
    repairStatusLog: {
      findFirst: async () => logs[1],
      update: async ({ where, data }: { where: { id: number }; data: { changedAt: Date; changedBy: number } }) =>
        Object.assign(logs.find((log) => log.id === where.id)!, data),
    },
  };
  const date = parseManualDate("2026-10-14");
  await correctManualStatusDate(tx as never, 10, "受付", date, 42, repair.status);
  assert.equal(repair.receptionDate.toISOString(), date.toISOString());
  assert.equal(logs[1].changedAt.toISOString(), date.toISOString());
  assert.equal(logs[1].changedBy, 42);
  assert.equal(logs[0].changedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  await assert.rejects(correctManualStatusDate(tx as never, 10, "受付", date, 42, "送付待ち"), /送付待ち中/);
});

test("a correction for a status with no saved history remains rejected", async () => {
  const tx = {
    repairStatusLog: { findFirst: async () => null },
  };
  await assert.rejects(
    correctManualStatusDate(tx as never, 10, "作業中", parseManualDate("2026-10-14"), 42, "作業待ち"),
    /履歴がないため日付を修正できません/,
  );
});
