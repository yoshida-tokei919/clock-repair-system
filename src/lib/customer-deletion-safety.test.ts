import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { CustomerDeletionBlockedError, deleteCustomerSafely } from "./customer-deletion-safety";

function fixture(options: { exists?: boolean; repairCount?: number; linkedUserIds?: number[]; pending?: boolean } = {}) {
  const calls: string[] = [];
  let pendingQuery: any;
  const tx = {
    $queryRaw: async () => { calls.push("lock-customer"); return options.exists === false ? [] : [{ id: 7 }]; },
    repair: { count: async () => { calls.push("count-repairs"); return options.repairCount ?? 0; } },
    lineUser: { findMany: async () => {
      calls.push("read-linked-users");
      return (options.linkedUserIds ?? [5]).map((id) => ({ id }));
    } },
    lineManagerSendOutbox: { findFirst: async (query: any) => {
      calls.push("check-outboxes");
      pendingQuery = query;
      return options.pending ? { id: 1 } : null;
    } },
    customer: { delete: async () => { calls.push("delete-customer"); } },
  };
  const db = { $transaction: async (fn: (value: any) => Promise<void>) => fn(tx) } as unknown as PrismaClient;
  return { db, calls, get pendingQuery() { return pendingQuery; } };
}

test("locks Customer before checking repairs, linked users and all nonterminal outboxes", async () => {
  const f = fixture({ linkedUserIds: [5, 6] });
  await deleteCustomerSafely(f.db, 7);
  assert.deepEqual(f.calls, ["lock-customer", "count-repairs", "read-linked-users", "check-outboxes", "delete-customer"]);
  assert.deepEqual(f.pendingQuery.where.status.in, ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"]);
  assert.deepEqual(f.pendingQuery.where.OR, [
    { inquiry: { lineUserId: { in: [5, 6] } } },
    { lineManagerChat: { lineUserId: { in: [5, 6] } } },
  ]);
  assert.equal(f.pendingQuery.where.idempotencyKey, undefined);
});

test("any nonterminal outbox blocks deletion before LineUser can detach", async () => {
  const f = fixture({ pending: true });
  await assert.rejects(deleteCustomerSafely(f.db, 7), CustomerDeletionBlockedError);
  assert.deepEqual(f.calls, ["lock-customer", "count-repairs", "read-linked-users", "check-outboxes"]);
});

test("CONFIRMED or CANCELLED outboxes do not block deletion", async () => {
  // The database query excludes terminal statuses; a matching nonterminal row is absent.
  const f = fixture({ pending: false });
  await deleteCustomerSafely(f.db, 7);
  assert.equal(f.calls.at(-1), "delete-customer");
  assert.equal(f.pendingQuery.where.status.in.includes("CONFIRMED"), false);
  assert.equal(f.pendingQuery.where.status.in.includes("CANCELLED"), false);
});

test("existing repair-history prohibition and missing Customer fail before deletion", async () => {
  for (const options of [{ repairCount: 1 }, { exists: false }]) {
    const f = fixture(options);
    await assert.rejects(deleteCustomerSafely(f.db, 7), CustomerDeletionBlockedError);
    assert.equal(f.calls.includes("delete-customer"), false);
  }
});

test("a Customer without linked LINE users may still be deleted", async () => {
  const f = fixture({ linkedUserIds: [] });
  await deleteCustomerSafely(f.db, 7);
  assert.equal(f.calls.includes("check-outboxes"), false);
  assert.equal(f.calls.at(-1), "delete-customer");
});
