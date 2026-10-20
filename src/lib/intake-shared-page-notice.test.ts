import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { intakeSharedPageNoticeKey, queueIntakeSharedPageNotice } from "./intake-shared-page-notice";
import { verifyLineManagerMapping } from "./line-manager-mapping-internal";

function fixture() {
  const now = new Date("2026-10-12T00:00:00Z");
  const invite: any = {
    id: 9, usedAt: now, revokedAt: null, customerId: 5, lineUserId: 7, inquiryId: 11,
    inquiry: { lineUserId: 7 },
    lineUser: { linkedCustomerId: 5, lineManagerChat: { id: 3, verifiedAt: now } },
    inquiryWatches: [{ inquiryWatch: { inquiryId: 11, promotedRepairId: 20 } }, { inquiryWatch: { inquiryId: 11, promotedRepairId: 10 } }],
    repairs: [
      { id: 10, customerId: 5, customer: { type: "individual" }, publicToken: "anchor-token", publicTokenCreatedAt: now },
      { id: 20, customerId: 5, customer: { type: "individual" }, publicToken: "other-token", publicTokenCreatedAt: now },
    ],
  };
  const rows = new Map<string, any>();
  const tx: any = {
    repairIntakeInvite: { findUnique: async () => invite },
    inquiry: { findUnique: async () => ({ id: 11, lineUserId: 7 }) },
    lineManagerChat: { findUnique: async () => ({ id: 3, lineUserId: 7, managerBotId: "bot", managerChatId: "chat" }) },
    lineManagerSendOutbox: { upsert: async ({ where, create }: any) => {
      if (!rows.has(where.idempotencyKey)) rows.set(where.idempotencyKey, { id: rows.size + 1, ...create });
      return rows.get(where.idempotencyKey);
    } },
  };
  return { invite, tx, rows };
}

test("verified intake queues one grouped notice with the lowest Repair token and no source Repair", async () => {
  const { tx, rows } = fixture();
  await queueIntakeSharedPageNotice(tx, 9, "https://example.com");
  await queueIntakeSharedPageNotice(tx, 9, "https://example.com");
  assert.equal(rows.size, 1);
  const row = rows.get(intakeSharedPageNoticeKey(9));
  assert.equal(row.inquiryId, 11);
  assert.equal(row.sourceRepairId, null);
  assert.equal(row.lineManagerChatId, 3);
  assert.equal(row.text, "受付が完了しました。\n今後の修理状況やお見積りの確認はこちらのページからご覧いただけます。\nhttps://example.com/customer/repairs/anchor-token");
  assert.equal(row.text.split("https://").length, 2);
  assert.match(row.text, /https:\/\/example.com\/customer\/repairs\/anchor-token$/);
  assert.doesNotMatch(row.text, /other-token/);
});

test("missing mapping defers the notice; later verification can queue it once", async () => {
  const { invite, tx, rows } = fixture();
  invite.lineUser.lineManagerChat = null;
  assert.equal(await queueIntakeSharedPageNotice(tx, 9, "https://example.com"), null);
  assert.equal(rows.size, 0);
  invite.lineUser.lineManagerChat = { id: 3, verifiedAt: new Date() };
  await queueIntakeSharedPageNotice(tx, 9, "https://example.com");
  assert.equal(rows.size, 1);
});

test("queue failures log only the error class and Prisma code and still fail closed", async () => {
  const { tx } = fixture();
  const secret = "private-token-and-address";
  tx.lineManagerSendOutbox.upsert = async () => {
    throw new Prisma.PrismaClientKnownRequestError(secret, { code: "P2002", clientVersion: "test" });
  };
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    await assert.rejects(() => queueIntakeSharedPageNotice(tx, 9, "https://example.com"),
      /Intake shared-page notice could not be queued/);
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [["Intake shared-page notice queue failed", { errorClass: "PrismaClientKnownRequestError", prismaCode: "P2002" }]]);
  assert.doesNotMatch(JSON.stringify(logged), /private-token-and-address|anchor-token|example.com/);
});

test("mapping verification reconciles a used intake in the same transaction", async () => {
  const { tx, rows } = fixture();
  tx.$executeRaw = async () => undefined;
  tx.repairIntakeInvite.findMany = async () => [{ id: 9 }];
  const db: any = { $transaction: async (action: (client: any) => Promise<unknown>) => action(tx) };
  const body = { lineUserId: 7, evidenceInquiryMessageId: 4, evidenceManagerMessageId: "message", managerBotId: "bot", managerChatId: "chat" };
  const create: any = async (client: any) => {
    assert.equal(client, tx);
    return { id: 3, lineUserId: 7, verifiedAt: new Date() };
  };
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
  try {
    await verifyLineManagerMapping(db, body, create);
    await verifyLineManagerMapping(db, body, create);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
  assert.equal(rows.size, 1);
});

test("cross-customer, cross-intake and incomplete historical groups fail closed", async () => {
  for (const change of [
    (invite: any) => { invite.repairs[1].customerId = 6; },
    (invite: any) => { invite.lineUser.linkedCustomerId = 6; },
    (invite: any) => { invite.inquiry.lineUserId = 8; },
    (invite: any) => { invite.inquiryWatches[1].inquiryWatch.promotedRepairId = 99; },
    (invite: any) => { invite.repairs[1].publicToken = null; },
    (invite: any) => { invite.repairs[1].publicTokenCreatedAt = null; },
    (invite: any) => { invite.usedAt = null; },
  ]) {
    const { invite, tx, rows } = fixture();
    change(invite);
    assert.equal(await queueIntakeSharedPageNotice(tx, 9, "https://example.com"), null);
    assert.equal(rows.size, 0);
  }
});

test("tokens created after intake use cannot make a pre-Task210A group eligible", async () => {
  const { invite, tx, rows } = fixture();
  invite.repairs[1].publicTokenCreatedAt = new Date(invite.usedAt.getTime() + 1);
  assert.equal(await queueIntakeSharedPageNotice(tx, 9, "https://example.com"), null);
  assert.equal(rows.size, 0);
});
