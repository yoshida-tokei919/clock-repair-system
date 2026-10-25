import assert from "node:assert/strict";
import test from "node:test";

import { recordManualApproval } from "./repair-manual-approval";
import { isApprovalAuditStatus } from "./repair-approval-audit";
import { hasUnsavedApprovalDraft } from "./repair-approval-draft";
import { addConfirmedRepairStatusLog } from "./repair-part-allocation";

function fixture(customerType: "business" | "individual" = "business") {
  const repair = {
    id: 8, status: "見積中", approvalStatus: "pending", approvalDate: null as Date | null,
    customer: { type: customerType }, estimate: { items: [{ itemName: "作業", quantity: 1, unitPrice: 1000 }] },
    returnRecipientName: customerType === "individual" ? "顧客" : null,
    returnPostalCode: customerType === "individual" ? "1000001" : null,
    returnPrefecture: customerType === "individual" ? "東京都" : null,
    returnCity: customerType === "individual" ? "千代田区" : null,
    returnStreet: customerType === "individual" ? "千代田1-1" : null,
    returnBuilding: null,
    returnPhone: customerType === "individual" ? "0312345678" : null,
  };
  const logs = [{ id: 1, repairId: 8, status: "見積中", changedAt: new Date("2026-10-01T00:00:00Z"), changedBy: null as number | null }];
  const tx = {
    estimateOptionSet: { findUnique: async () => null as null | { isActive: boolean; choices: { id: number }[] } },
    repair: {
      findUnique: async () => ({ ...repair }),
      findUniqueOrThrow: async () => ({ ...repair }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(repair, data),
    },
    repairStatusLog: {
      findFirst: async ({ where }: { where: { status?: string | { not: { startsWith: string } } | { startsWith: string } } }) =>
        [...logs].reverse().find((log) => typeof where.status === "string" ? log.status === where.status
          : where.status && "startsWith" in where.status ? log.status.startsWith(where.status.startsWith)
          : where.status ? !log.status.startsWith(where.status.not.startsWith) : true) ?? null,
      create: async ({ data }: { data: { repairId: number; status: string; changedBy?: number } }) => {
        const log = { id: logs.length + 1, repairId: data.repairId, status: data.status, changedAt: new Date(), changedBy: data.changedBy ?? null };
        logs.push(log);
        return log;
      },
      updateMany: async ({ where, data }: { where: { id: { gt: number }; status: { not: { startsWith: string } } }; data: { changedBy: number } }) => {
        logs.filter((log) => log.id > where.id.gt && !log.status.startsWith(where.status.not.startsWith))
          .forEach((log) => { log.changedBy = data.changedBy; });
      },
    },
  };
  let reconcileCalls = 0;
  const reconcile = async () => {
    reconcileCalls++;
    repair.status = "作業待ち";
    logs.push({ id: logs.length + 1, repairId: 8, status: "作業待ち", changedAt: new Date("2026-10-14T03:00:00Z"), changedBy: null });
    return { status: "作業待ち", activeOrderStatuses: [], allRequiredPartsAllocated: true, skippedForLegacy: false };
  };
  return { repair, logs, tx, reconcile, getReconcileCalls: () => reconcileCalls };
}

test("oral B2B approval records actor and date without backdating the work status", async () => {
  const f = fixture();
  const approvalDate = new Date("2026-10-13T06:30:00Z");
  await recordManualApproval(f.tx as never, 8, approvalDate, 42, f.reconcile as never);
  assert.equal(f.repair.approvalStatus, "approved");
  assert.equal(f.repair.approvalDate?.toISOString(), approvalDate.toISOString());
  assert.equal(f.repair.status, "作業待ち");
  assert.equal(f.logs[1].changedBy, 42);
  assert.equal(f.logs[1].changedAt.toISOString(), "2026-10-14T03:00:00.000Z");
  assert.equal(f.logs[2].status, `EVENT:APPROVAL_RECORDED:${approvalDate.toISOString()}`);
  assert.equal(f.logs[2].changedBy, 42);
  await addConfirmedRepairStatusLog(f.tx as never, 8, "作業待ち");
  assert.equal(f.logs.length, 3, "audit events do not fabricate another status transition");
});

test("B2C approval requires return address and saved estimate", async () => {
  const f = fixture("individual");
  f.repair.returnStreet = null;
  await assert.rejects(recordManualApproval(f.tx as never, 8, new Date(), 42, f.reconcile as never), /返送先/);
  f.repair.returnStreet = "千代田1-1";
  f.repair.estimate.items = [];
  await assert.rejects(recordManualApproval(f.tx as never, 8, new Date(), 42, f.reconcile as never), /見積明細/);
  f.repair.estimate.items = [{ itemName: "作業", quantity: 1, unitPrice: 1000 }];
  await recordManualApproval(f.tx as never, 8, new Date("2026-10-14T01:00:00Z"), 42, f.reconcile as never);
  assert.equal(f.repair.approvalStatus, "approved");
});

test("approval date correction appends actor event and does not allocate again", async () => {
  const f = fixture();
  await recordManualApproval(f.tx as never, 8, new Date("2026-10-13T06:30:00Z"), 42, f.reconcile as never);
  await recordManualApproval(f.tx as never, 8, new Date("2026-10-13T08:00:00Z"), 43, f.reconcile as never);
  assert.equal(f.getReconcileCalls(), 1);
  assert.equal(f.logs.filter((log) => isApprovalAuditStatus(log.status)).length, 2);
  assert.equal(f.logs.at(-1)?.status, "EVENT:APPROVAL_DATE_CORRECTED:2026-10-13T08:00:00.000Z");
  assert.equal(f.logs.at(-1)?.changedBy, 43);
  assert.equal(f.logs[2].changedBy, 42);
});

test("approval from existing work status still records actor without changing work history", async () => {
  const f = fixture();
  f.repair.status = "作業中";
  f.logs[0].status = "作業中";
  await recordManualApproval(f.tx as never, 8, new Date("2026-10-14T01:00:00Z"), 42, f.reconcile as never);
  assert.equal(f.getReconcileCalls(), 0);
  assert.equal(f.logs[0].changedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(f.logs[1].changedBy, 42);
});

test("active unanswered plans block manual approval before any status or allocation write", async () => {
  const f = fixture();
  f.tx.estimateOptionSet.findUnique = async () => ({ isActive: true, choices: [{ id: 1 }, { id: 2 }] });
  await assert.rejects(recordManualApproval(f.tx as never, 8, new Date(), 42, f.reconcile as never), /見積選択肢/);
  assert.equal(f.repair.approvalStatus, "pending");
  assert.equal(f.getReconcileCalls(), 0);
});

test("active add-on only blocks manual approval", async () => {
  const f = fixture();
  f.tx.estimateOptionSet.findUnique = async () => ({ isActive: true, choices: [] });
  await assert.rejects(recordManualApproval(f.tx as never, 8, new Date(), 42, f.reconcile as never), /見積選択肢/);
  assert.equal(f.repair.approvalStatus, "pending");
});

test("unsaved estimate, watch, customer or status draft blocks approval", () => {
  const saved = JSON.stringify({ estimate: [{ name: "作業" }], watch: "A", customer: "B", status: "見積中" });
  assert.equal(hasUnsavedApprovalDraft(saved, saved), false);
  for (const current of [
    { estimate: [{ name: "別作業" }], watch: "A", customer: "B", status: "見積中" },
    { estimate: [{ name: "作業" }], watch: "C", customer: "B", status: "見積中" },
    { estimate: [{ name: "作業" }], watch: "A", customer: "C", status: "見積中" },
    { estimate: [{ name: "作業" }], watch: "A", customer: "B", status: "作業中" },
  ]) assert.equal(hasUnsavedApprovalDraft(saved, JSON.stringify(current)), true);
});
