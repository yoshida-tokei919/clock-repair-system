import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { b2bRepairCommentNoticeKey, customerCommentUrl, saveRepairComment, visibleCustomerCommentTarget } from "./b2b-repair-comment-notice";

function fixture(users: unknown[], type = "business", proxy = false) {
  let saved = false;
  let queues = 0;
  const locks: string[] = [];
  const tx = {
    customer: { findUnique: async () => ({ type, lineContactCustomerId: proxy ? 9 : null }) },
    repair: { findUnique: async () => ({ customerId: 7 }) },
    $queryRaw: async (parts: TemplateStringsArray, id?: number) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) { locks.push("customer"); return [{ id: id ?? 7, type, lineContactCustomerId: id === 9 ? null : proxy ? 9 : null }]; }
      if (sql.includes('FROM "Repair"')) { locks.push("repair"); assert.match(sql, /"inquiryNumber"/); return [{ id: 3, customerId: 7, publicToken: "repair-token", inquiryNumber: "K-002" }]; }
      if (sql.includes('FROM "LineUser"')) { locks.push("line-user"); return [{ linkedCustomerId: proxy ? 9 : 7 }]; }
      if (sql.includes('FROM "LineManagerChat"')) { locks.push("chat"); return [{ id: 11, lineUserId: 5, verifiedAt: new Date(), managerBotId: "bot", managerChatId: "chat" }]; }
      return [];
    },
    lineUser: { findMany: async () => users },
    inquiry: { findFirst: async () => ({ id: 21, lineUserId: 5 }) },
    repairCustomerMessage: { create: async () => { saved = true; return { id: 99, body: "test", senderType: "shop", createdAt: new Date(), readAt: new Date() }; } },
  };
  const db = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
    try { return await fn(tx); } catch (error) { saved = false; throw error; }
  } } as unknown as PrismaClient;
  const createApproved = (async (_tx: unknown, input: { idempotencyKey: string; text: string; inquiryId: number; lineManagerChatId: number; sourceRepairId: number }) => {
    queues++;
    assert.equal(saved, true);
    assert.deepEqual(locks, proxy ? ["customer", "customer", "repair", "line-user", "chat"] : ["customer", "repair", "line-user", "chat"]);
    assert.equal(input.idempotencyKey, b2bRepairCommentNoticeKey(99));
    assert.equal(input.text, "修理案件 K-002 にコメントを返信しました。\n以下のページからご確認ください。\nhttps://app.test/customer/repairs/repair-token?comment=99#comment-99");
    assert.doesNotMatch(input.text, /本文はLINEに出さない/);
    assert.equal(input.inquiryId, 21);
    assert.equal(input.lineManagerChatId, 11);
    assert.equal(input.sourceRepairId, proxy ? 3 : undefined);
    return { status: "APPROVED" };
  }) as unknown as Parameters<typeof saveRepairComment>[4];
  return { db, createApproved, get saved() { return saved; }, get queues() { return queues; } };
}

const valid = { id: 5, linkedCustomerId: 7, lineManagerChat: { id: 11, lineUserId: 5, verifiedAt: new Date() } };

test("verified unique B2B destination queues a short notice and URL without comment body", async () => {
  const f = fixture([valid]);
  const result = await saveRepairComment(f.db, 3, "本文はLINEに出さない", "https://app.test/repairs/3", f.createApproved);
  assert.equal(result.notification, "pending");
  assert.equal(f.queues, 1);
});

test("proxy comment retains the source repair and its own share URL", async () => {
  const f = fixture([{ ...valid, linkedCustomerId: 9 }], "business", true);
  const result = await saveRepairComment(f.db, 3, "private body", "https://app.test/repairs/3", f.createApproved);
  assert.equal(result.notification, "pending");
  assert.equal(f.queues, 1);
});

test("absent, ambiguous, unverified, or wrong Customer destination saves without queue", async () => {
  for (const users of [[], [valid, { ...valid, id: 6 }], [{ ...valid, linkedCustomerId: 8 }],
    [{ ...valid, lineManagerChat: { ...valid.lineManagerChat, verifiedAt: null } }]]) {
    const f = fixture(users);
    const result = await saveRepairComment(f.db, 3, "test", "https://app.test", f.createApproved);
    assert.equal(result.notification, "unavailable");
    assert.equal(f.saved, true);
    assert.equal(f.queues, 0);
  }
});

test("outbox failure rolls back comment in the same transaction", async () => {
  const f = fixture([valid]);
  await assert.rejects(saveRepairComment(f.db, 3, "test", "https://app.test", async () => { throw new Error("queue failed"); }));
  assert.equal(f.saved, false);
});

test("deep link uses public token and only visible comment selects accordion", () => {
  assert.equal(customerCommentUrl("tok", 8, "https://app.test/x"), "https://app.test/customer/repairs/tok?comment=8#comment-8");
  const repairs = [{ id: 3, customerMessages: [{ id: 8 }] }, { id: 4, customerMessages: [{ id: 9 }] }];
  assert.deepEqual(visibleCustomerCommentTarget("9", repairs), { id: 9, index: 1 });
  assert.equal(visibleCustomerCommentTarget("10", repairs), null);
  assert.equal(visibleCustomerCommentTarget("9x", repairs), null);
});

test("legacy comment route has no Messaging Push", () => {
  const code = readFileSync(resolve(process.cwd(), "src/app/api/repairs/[id]/messages/route.ts"), "utf8");
  assert.match(code, /comments\/route/);
  assert.doesNotMatch(code, /api\.line\.me|LINE_CHANNEL_ACCESS_TOKEN|fetch\(/);
});
