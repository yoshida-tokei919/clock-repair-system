import assert from "node:assert/strict";
import test from "node:test";

import { reconcileInquiryRepairIntakeInvites, shouldCloseInquiry } from "./inquiry-lifecycle";

const promotedAt = new Date("2026-09-22T00:00:00.000Z");

test("closes after the final declined review watch", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "DECLINED", promotedAt: null },
    { decision: "DECLINED", promotedAt: null },
  ]), true);
});

test("closes when requested watches are promoted and remaining watches are declined", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt },
    { decision: "DECLINED", promotedAt: null },
  ]), true);
});

test("stays open while any review watch is pending", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt },
    { decision: "PENDING", promotedAt: null },
    { decision: "DECLINED", promotedAt: null },
  ]), false);
});

test("stays open when a requested watch has not been promoted", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt: null },
  ]), false);
});

test("does not close an Inquiry with no review watches", () => {
  assert.equal(shouldCloseInquiry([]), false);
});

function intakeInviteReconciliationTx(
  status: "OPEN" | "CLOSED",
  eligibleWatchIds: number[],
  activeInvites: Array<{ id: number; inquiryWatches: Array<{ inquiryWatchId: number }> }>,
) {
  const updates: unknown[] = [];
  const queries: unknown[] = [];
  return {
    tx: {
      inquiry: { findUnique: async () => ({ status }) },
      inquiryWatch: {
        findMany: async (args: unknown) => {
          queries.push(args);
          return eligibleWatchIds.map((id) => ({ id }));
        },
      },
      repairIntakeInvite: {
        findMany: async (args: unknown) => {
          queries.push(args);
          return activeInvites;
        },
        updateMany: async (args: unknown) => {
          updates.push(args);
          return { count: (args as { where: { id: { in: number[] } } }).where.id.in.length };
        },
      },
    },
    updates,
    queries,
  };
}

test("revokes an active invite immediately when REQUESTED changes to DECLINED", async () => {
  const fixture = intakeInviteReconciliationTx("OPEN", [], [{ id: 10, inquiryWatches: [{ inquiryWatchId: 1 }] }]);
  const now = new Date("2026-09-22T01:00:00.000Z");

  assert.equal(await reconcileInquiryRepairIntakeInvites(fixture.tx as never, 70, now), 1);
  assert.deepEqual(fixture.updates, [{
    where: { id: { in: [10] }, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  }]);
});

test("revokes an active invite immediately when PENDING changes to REQUESTED", async () => {
  const fixture = intakeInviteReconciliationTx("OPEN", [1, 2], [{ id: 10, inquiryWatches: [{ inquiryWatchId: 1 }] }]);

  assert.equal(await reconcileInquiryRepairIntakeInvites(fixture.tx as never, 70, new Date("2026-09-22T01:00:00.000Z")), 1);
  assert.equal(fixture.updates.length, 1);
});

test("keeps a matching active invite when an unrelated non-requested decision changes", async () => {
  const fixture = intakeInviteReconciliationTx("OPEN", [1], [{ id: 10, inquiryWatches: [{ inquiryWatchId: 1 }] }]);

  assert.equal(await reconcileInquiryRepairIntakeInvites(fixture.tx as never, 70), 0);
  assert.deepEqual(fixture.updates, []);
});

test("final decline closes an Inquiry and revokes only unexpired active unused invites", async () => {
  const fixture = intakeInviteReconciliationTx("CLOSED", [], [
    { id: 10, inquiryWatches: [{ inquiryWatchId: 1 }] },
    { id: 11, inquiryWatches: [{ inquiryWatchId: 2 }] },
  ]);

  assert.equal(await reconcileInquiryRepairIntakeInvites(fixture.tx as never, 70, new Date("2026-09-22T01:00:00.000Z")), 2);
  assert.deepEqual((fixture.updates[0] as { where: { id: { in: number[] } } }).where.id.in, [10, 11]);
  assert.equal(fixture.queries.length, 1, "closed Inquiry does not need to query eligible watches");
  assert.deepEqual((fixture.queries[0] as { where: unknown }).where, {
    inquiryId: 70,
    usedAt: null,
    revokedAt: null,
    expiresAt: { gt: (fixture.queries[0] as { where: { expiresAt: { gt: Date } } }).where.expiresAt.gt },
  });
});

test("reconciliation targets only active unused, unrevoked invites", async () => {
  const fixture = intakeInviteReconciliationTx("OPEN", [], [{ id: 10, inquiryWatches: [{ inquiryWatchId: 1 }] }]);

  await reconcileInquiryRepairIntakeInvites(fixture.tx as never, 70);
  assert.deepEqual((fixture.queries[0] as { where: unknown }).where, {
    inquiryId: 70, usedAt: null, revokedAt: null, expiresAt: { gt: (fixture.queries[0] as { where: { expiresAt: { gt: Date } } }).where.expiresAt.gt },
  });
  assert.deepEqual((fixture.updates[0] as { where: { usedAt: null; revokedAt: null } }).where, {
    id: { in: [10] }, usedAt: null, revokedAt: null,
  });
});
