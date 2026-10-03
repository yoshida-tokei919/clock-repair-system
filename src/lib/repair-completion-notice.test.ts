import assert from "node:assert/strict";
import test from "node:test";
import {
  createRepairCompletionNotice, getRepairCompletionNotice, parseCompletionNotice,
  RepairCompletionNoticeInputError, RepairCompletionNoticeNotFoundError,
  RepairCompletionNoticeUnavailableError,
} from "./repair-completion-notice";
import { LineManagerSendOutboxError } from "./line-manager-send-outbox";

const approvedAt = new Date("2026-10-03T01:00:00Z");
const repair = (overrides: Record<string, unknown> = {}) => ({
  id: 10, status: "作業完了", customer: { type: "individual", lineId: "untrusted" },
  inquiryWatchPromotion: {
    inquiryId: 7, promotedRepairId: 10,
    inquiry: { lineUser: { lineManagerChat: { id: 30, verifiedAt: approvedAt } } },
  }, ...overrides,
});

function transactionDb(tx: any) {
  return { ...tx, $transaction: async (run: (client: any) => Promise<unknown>) => run(tx) };
}

test("strict completion notice input requires only confirmed:true and bounded text", () => {
  assert.deepEqual(parseCompletionNotice({ confirmed: true, text: "完了しました" }), { text: "完了しました" });
  for (const body of [null, [], {}, { confirmed: 1, text: "ok" }, { confirmed: false, text: "ok" },
    { confirmed: true, text: " " }, { confirmed: true, text: 1 },
    { confirmed: true, text: "x".repeat(5001) }, { confirmed: true, text: "ok", repairId: 10 }]) {
    assert.throws(() => parseCompletionNotice(body), RepairCompletionNoticeInputError);
  }
});

test("GET is read-only, reports eligibility, destination and exact-key outbox evidence", async () => {
  let readKey: string | undefined;
  const db: any = {
    repair: { findUnique: async () => repair() },
    lineManagerSendOutbox: { findUnique: async (query: any) => {
      readKey = query.where.idempotencyKey;
      return { id: 2, status: "CONFIRMED", approvedAt, confirmedAt: approvedAt };
    } },
  };
  assert.deepEqual(await getRepairCompletionNotice(db, 10), {
    eligible: true, hasVerifiedLineDestination: true,
    notice: { id: 2, status: "CONFIRMED", approvedAt, confirmedAt: approvedAt },
  });
  assert.equal(readKey, "repair-completion-notice:10");
  db.repair.findUnique = async () => repair({ status: "作業中" });
  assert.equal((await getRepairCompletionNotice(db, 10)).eligible, false);
  db.repair.findUnique = async () => repair({ inquiryWatchPromotion: null });
  assert.deepEqual(await getRepairCompletionNotice(db, 10), {
    eligible: false, hasVerifiedLineDestination: false,
    notice: { id: 2, status: "CONFIRMED", approvedAt, confirmedAt: approvedAt },
  });
});

test("POST rejects missing Repair, B2B, status mismatch, missing or mismatched promotion and mapping", async () => {
  const tx: any = {
    $queryRaw: async () => [{ customerId: 1 }],
    repair: { findUnique: async () => null },
  };
  const db: any = transactionDb(tx);
  tx.$queryRaw = async () => [];
  const body = { confirmed: true, text: "完了しました" };
  await assert.rejects(createRepairCompletionNotice(db, 10, body), RepairCompletionNoticeNotFoundError);
  tx.$queryRaw = async () => [{ customerId: 1 }];
  for (const row of [
    repair({ customer: { type: "business" } }), repair({ status: "作業中" }),
    repair({ inquiryWatchPromotion: null }),
    repair({ inquiryWatchPromotion: { ...repair().inquiryWatchPromotion, promotedRepairId: 11 } }),
    repair({ inquiryWatchPromotion: { ...repair().inquiryWatchPromotion, inquiry: { lineUser: { lineManagerChat: null } } } }),
    repair({ inquiryWatchPromotion: { ...repair().inquiryWatchPromotion, inquiry: { lineUser: { lineManagerChat: { id: 30, verifiedAt: null } } } } }),
  ]) {
    db.repair.findUnique = async () => row;
    await assert.rejects(createRepairCompletionNotice(db, 10, body), RepairCompletionNoticeUnavailableError);
  }
});

test("POST re-fetches Repair, uses promotion destination and creates one immutable intent", async () => {
  let stored: any;
  let creations = 0;
  const tx: any = {
    $queryRaw: async () => [{ customerId: 1 }],
    repair: { findUnique: async () => repair() },
    inquiry: { findUnique: async () => ({ id: 7, lineUserId: 4 }) },
    lineManagerChat: { findUnique: async () => ({ id: 30, lineUserId: 4, managerBotId: "bot", managerChatId: "chat" }) },
    lineManagerSendOutbox: { upsert: async ({ create }: any) => {
      if (!stored) { creations++; stored = { id: 2, status: "APPROVED", confirmedAt: null, ...create }; }
      return stored;
    } },
  };
  const db: any = transactionDb(tx);
  const body = { confirmed: true, text: "完了しました" };
  const first = await createRepairCompletionNotice(db, 10, body);
  const second = await createRepairCompletionNotice(db, 10, body);
  assert.equal(creations, 1);
  assert.deepEqual(first, second);
  assert.equal(stored.idempotencyKey, "repair-completion-notice:10");
  assert.equal(stored.inquiryId, 7);
  assert.equal(stored.sourceRepairId, 10);
  assert.equal(stored.lineManagerChatId, 30);
  await assert.rejects(createRepairCompletionNotice(db, 10, { ...body, text: "別の本文" }), LineManagerSendOutboxError);
  for (const [field, value] of [["inquiryId", 8], ["sourceRepairId", 11],
    ["lineManagerChatId", 31], ["managerBotIdSnapshot", "other-bot"],
    ["managerChatIdSnapshot", "other-chat"]] as const) {
    const original = stored[field];
    stored[field] = value;
    await assert.rejects(createRepairCompletionNotice(db, 10, body), LineManagerSendOutboxError);
    stored[field] = original;
  }
  assert.equal(creations, 1);
});

test("POST rechecks eligibility after locking Customer then Repair", async () => {
  for (const changed of [repair({ status: "作業中" }), repair({ customer: { type: "business" } })]) {
    let current = repair();
    const queries: string[] = [];
    let writes = 0;
    const tx: any = {
      $queryRaw: async (parts: TemplateStringsArray) => {
        queries.push(parts.join("?"));
        if (queries.length === 1) current = changed; // A concurrent update committed after the initial read.
        return queries.length === 2 ? [{ id: 1 }] : [{ customerId: 1 }];
      },
      repair: { findUnique: async () => {
        if (queries.length) assert.equal(queries.length, 3);
        return current;
      } },
      lineManagerSendOutbox: { upsert: async () => { writes++; } },
    };
    const db: any = transactionDb(tx);
    assert.equal((await getRepairCompletionNotice({ ...db, lineManagerSendOutbox: { findUnique: async () => null } }, 10)).eligible, true);
    await assert.rejects(createRepairCompletionNotice(db, 10, { confirmed: true, text: "完了しました" }), RepairCompletionNoticeUnavailableError);
    assert.match(queries[0], /FROM "Repair"/);
    assert.doesNotMatch(queries[0], /FOR UPDATE/);
    assert.match(queries[1], /FROM "Customer".*FOR UPDATE/);
    assert.match(queries[2], /FROM "Repair".*FOR UPDATE/);
    assert.equal(writes, 0);
  }
});

test("POST rejects a changed customer linkage without locking another customer or creating an outbox", async () => {
  const queries: string[] = [];
  let writes = 0;
  const tx: any = {
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      queries.push(parts.join("?"));
      assert.equal(id, queries.length === 2 ? 1 : 10);
      return queries.length === 2 ? [{ id: 1 }] : [{ customerId: queries.length === 3 ? 2 : 1 }];
    },
    repair: { findUnique: async () => { throw new Error("Eligibility must not be read after linkage changes"); } },
    lineManagerSendOutbox: { upsert: async () => { writes++; } },
  };
  await assert.rejects(createRepairCompletionNotice(transactionDb(tx) as any, 10,
    { confirmed: true, text: "完了しました" }), RepairCompletionNoticeUnavailableError);
  assert.equal(queries.length, 3);
  assert.match(queries[1], /FROM "Customer".*FOR UPDATE/);
  assert.match(queries[2], /FROM "Repair".*FOR UPDATE/);
  assert.equal(writes, 0);
});

test("POST keeps Customer and Repair row locks through approved intent creation", async () => {
  const queries: string[] = [];
  let transactionOpen = false;
  let customerLocked = false;
  let repairLocked = false;
  const tx: any = {
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      assert.equal(transactionOpen, true);
      queries.push(parts.join("?"));
      assert.equal(id, queries.length === 2 ? 1 : 10);
      if (queries.length === 2) {
        assert.equal(repairLocked, false);
        customerLocked = true;
        return [{ id: 1 }];
      }
      if (queries.length === 3) {
        assert.equal(customerLocked, true);
        repairLocked = true;
      }
      return [{ customerId: 1 }];
    },
    repair: { findUnique: async () => {
      assert.equal(customerLocked && repairLocked, true);
      return repair();
    } },
  };
  const db: any = { $transaction: async (run: (client: any) => Promise<unknown>) => {
    transactionOpen = true;
    try { return await run(tx); }
    finally { transactionOpen = false; customerLocked = false; repairLocked = false; }
  } };
  const result = await createRepairCompletionNotice(db, 10, { confirmed: true, text: "完了しました" },
    async (client, input) => {
      assert.equal(client, tx);
      assert.equal(transactionOpen, true);
      assert.equal(customerLocked && repairLocked, true);
      assert.equal(queries.length, 3);
      assert.match(queries[0], /FROM "Repair"/);
      assert.doesNotMatch(queries[0], /FOR UPDATE/);
      assert.match(queries[1], /FROM "Customer".*FOR UPDATE/);
      assert.match(queries[2], /FROM "Repair".*FOR UPDATE/);
      assert.equal(input.idempotencyKey, "repair-completion-notice:10");
      return { id: 2, status: "APPROVED", approvedAt, confirmedAt: null } as any;
    });
  assert.equal(transactionOpen, false);
  assert.equal(customerLocked || repairLocked, false);
  assert.deepEqual(result, { id: 2, status: "APPROVED", approvedAt, confirmedAt: null });
});
