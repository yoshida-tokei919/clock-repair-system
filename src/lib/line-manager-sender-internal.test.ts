import assert from "node:assert/strict";
import test from "node:test";
import {
  claimLineManagerReconciliationWork,
  claimLineManagerSenderWork,
  parseLineManagerConfirmation,
  parseLineManagerSenderId,
  parseLineManagerSenderJson,
} from "./line-manager-sender-internal";
import {
  confirmLineManagerSendOutbox,
  markLineManagerPreSendFailed,
  safeClaimLineManagerSendOutbox,
} from "./line-manager-send-outbox";

const row = {
  id: 5, inquiryId: 9, text: "approved text", sendId: "chat_1700000000000_1234567",
  managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat", status: "CLAIMED",
  approvedAt: new Date("2026-09-23T00:00:00Z"), claimedAt: new Date("2026-09-23T00:01:00Z"),
  claimLeaseExpiresAt: new Date("2026-09-23T00:06:00Z"), lastAttemptAt: new Date("2026-09-23T00:01:00Z"),
  postAttemptedAt: null, reconciliationLeaseExpiresAt: null, lastHistoryCheckedAt: null,
};

test("sender claim scans eligible candidates, claims one safely, and returns only worker data", async () => {
  const seen: any[] = []; let token: string | undefined;
  const db: any = { lineManagerSendOutbox: {
    findMany: async (args: any) => { seen.push(args); return [{ id: 5 }]; },
    updateMany: async (args: any) => { token = args.data.claimToken; return { count: 1 }; },
    findUnique: async () => ({ ...row, claimToken: token }),
  } };
  const item = await claimLineManagerSenderWork(db, new Date("2026-09-23T00:00:00Z"));
  assert.deepEqual(Object.keys(item!).sort(), ["approvedAt", "claimLeaseExpiresAt", "claimToken", "claimedAt", "id", "inquiryId", "lastAttemptAt", "managerBotId", "managerChatId", "sendId", "status", "text"].sort());
  assert.equal(item!.status, "CLAIMED"); assert.equal(item!.managerChatId, "chat");
  const where = seen[0].where;
  assert.equal(where.OR.some((item: any) => item.status === "POST_UNCONFIRMED"), false);
  assert.deepEqual(where.OR[0], { status: { in: ["APPROVED", "PRE_SEND_FAILED"] } });
});

test("competing sender scans have one safe-claim winner", async () => {
  let claimed = false; let token: string | undefined;
  const db: any = { lineManagerSendOutbox: {
    findMany: async () => [{ id: 5 }],
    updateMany: async (args: any) => { if (claimed) return { count: 0 }; claimed = true; token = args.data.claimToken; return { count: 1 }; },
    findUnique: async () => ({ ...row, claimToken: token }),
  } };
  const results = await Promise.all([claimLineManagerSenderWork(db), claimLineManagerSenderWork(db)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test("a successful pre-send failure returns work to the safe claim path", async () => {
  let status = "APPROVED"; let token: string | null = null;
  const db: any = { lineManagerSendOutbox: {
    updateMany: async (args: any) => {
      if (args.data.status === "CLAIMED" && (status === "APPROVED" || status === "PRE_SEND_FAILED")) {
        status = "CLAIMED"; token = args.data.claimToken; return { count: 1 };
      }
      if (args.data.status === "PRE_SEND_FAILED" && status === "CLAIMED" && args.where.claimToken === token) {
        status = "PRE_SEND_FAILED"; token = null; return { count: 1 };
      }
      return { count: 0 };
    },
    findUnique: async () => ({ ...row, status, claimToken: token }),
  } };
  const first = await safeClaimLineManagerSendOutbox(db, { id: 5 });
  assert.ok(first);
  assert.equal(await markLineManagerPreSendFailed(db, { id: 5, claimToken: first.claimToken, error: "local setup failed" }), true);
  assert.equal((await safeClaimLineManagerSendOutbox(db, { id: 5 }))?.outbox.status, "CLAIMED");
});

test("reconciliation scan includes only post-unconfirmed rows with absent or expired leases", async () => {
  const seen: any[] = []; let token: string | undefined;
  const db: any = { lineManagerSendOutbox: {
    findMany: async (args: any) => { seen.push(args); return [{ id: 5 }]; },
    updateMany: async (args: any) => { token = args.data.reconciliationToken; return { count: 1 }; },
    findUnique: async () => ({ ...row, status: "POST_UNCONFIRMED", reconciliationToken: token, reconciliationLeaseExpiresAt: new Date() }),
  } };
  const item = await claimLineManagerReconciliationWork(db, new Date("2026-09-23T00:00:00Z"));
  assert.equal(item!.status, "POST_UNCONFIRMED"); assert.equal(item!.reconciliationToken, token);
  assert.deepEqual(seen[0].where, { status: "POST_UNCONFIRMED", OR: [{ reconciliationToken: null }, { reconciliationLeaseExpiresAt: { lt: new Date("2026-09-23T00:00:00Z") } }] });
});

test("confirmation input is strict and rejects invalid ids, tokens, strings, and timestamps", () => {
  for (const id of ["0", "-1", "1.1", "no", "9007199254740992"]) assert.throws(() => parseLineManagerSenderId(id));
  assert.equal(parseLineManagerSenderId("1"), 1);
  for (const invalid of [
    {},
    { reconciliationToken: "token", actualMessageId: "id", text: "text", timestamp: "not-a-date", managerBotId: "bot", managerChatId: "chat" },
    { reconciliationToken: " ", actualMessageId: "id", text: "text", timestamp: "2026-09-23T00:00:00Z", managerBotId: "bot", managerChatId: "chat" },
    { reconciliationToken: "token", actualMessageId: "", text: "text", timestamp: "2026-09-23T00:00:00Z", managerBotId: "bot", managerChatId: "chat" },
  ]) assert.throws(() => parseLineManagerConfirmation(invalid));
});

test("malformed JSON is a client input error before any sender transition", async () => {
  let parsed = false;
  await assert.rejects(
    parseLineManagerSenderJson({ json: async () => { parsed = true; throw new SyntaxError("bad JSON"); } }),
    { message: "Invalid JSON" },
  );
  assert.equal(parsed, true);
});

test("stale reconciliation token is rejected before any OUTBOUND write", async () => {
  let inquiryMessageLookups = 0;
  const outbox: any = {
    id: 5, status: "POST_UNCONFIRMED", reconciliationToken: "current", text: "approved text", inquiryId: 9,
    managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat", inquiry: { lineUserId: 3 },
    lineManagerChat: { lineUserId: 3, managerBotId: "bot", managerChatId: "chat" },
  };
  const tx: any = { lineManagerSendOutbox: { findUnique: async () => outbox }, inquiryMessage: { findUnique: async () => { inquiryMessageLookups++; } } };
  const db: any = { $transaction: async (fn: any) => fn(tx) };
  await assert.rejects(confirmLineManagerSendOutbox(db, {
    id: 5, reconciliationToken: "stale", actualMessageId: "actual", text: "approved text",
    timestamp: new Date(), managerBotId: "bot", managerChatId: "chat",
  }));
  assert.equal(inquiryMessageLookups, 0);
});

test("sender orchestration never writes InquiryMessage directly", () => {
  const source = require("node:fs").readFileSync(new URL("./line-manager-sender-internal.ts", import.meta.url), "utf8");
  assert.equal(source.includes("inquiryMessage"), false);
});
