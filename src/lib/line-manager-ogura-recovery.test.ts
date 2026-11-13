import assert from "node:assert/strict";
import { test } from "node:test";
import { OguraRecoveryConflictError, OguraRecoveryPartialError, parseOguraRecovery, recoverOguraValidated } from "./line-manager-ogura-recovery";

const image = { messageId: "fixture-image", type: "image" as const, timestamp: 1794319649332 };
const text = { messageId: "fixture-text", type: "text" as const, timestamp: 1794319904836, text: "fixture" };
const input = { action: "apply" as const, mappingId: 12 as const, inquiryId: 13 as const, managerBotId: "fixture-bot", managerChatId: "fixture-chat", events: [image, text] as [typeof image, typeof text] };

function fixture() {
  const rows: any[] = [];
  let file: any = null;
  const calls = { writes: 0, locks: 0, image: 0 };
  const evidence = { id: 8, direction: "INBOUND", lineUserId: 102, externalMessageId: "fixture-evidence", inquiry: { lineUserId: 102 } };
  const mapping = { id: 12, lineUserId: 102, managerBotId: input.managerBotId, managerChatId: input.managerChatId, verifiedAt: new Date(), evidenceInquiryMessageId: 8, evidenceManagerMessageId: "fixture-evidence", evidenceMessage: evidence };
  const user = { id: 102, linkedCustomerId: 16 };
  const inquiry = { id: 13, lineUserId: 102, status: "CLOSED" };
  const db: any = {
    lineManagerChat: { findUnique: async () => mapping },
    lineUser: { findUnique: async () => user },
    inquiry: { findUnique: async () => inquiry },
    inquiryMessage: {
      findMany: async () => [...rows],
      findUnique: async ({ where }: any) => rows.find((row) => row.externalMessageId === where.externalMessageId) ?? null,
      create: async ({ data }: any) => { calls.writes++; const row = { id: rows.length + 1, ...data, sentAt: null }; rows.push(row); return row; },
    },
    inquiryFile: { findUnique: async () => file },
    $executeRaw: async () => { calls.locks++; },
    $transaction: async (fn: any) => fn(db),
  };
  const storeImage: any = async (_db: any, args: any) => { calls.image++; file = { inquiryId: 13, inquiryMessageId: args.inquiryMessageId, uploadStatus: "STORED" }; return file; };
  return { db, mapping, user, inquiry, rows, calls, storeImage, setFile: (next: any) => { file = next; } };
}

test("bounded parser accepts only exact digest, type, length and timestamps", () => {
  const body = "x".repeat(448);
  const valid = { ...input, events: [image, { ...text, text: body }] };
  const hash = (value: string) => value === image.messageId ? "3a8b8911bb3ede6876230b623fafef9c4308a563812871687aeddf47c95c4c22" : value === text.messageId ? "19bf5fd7cee506208dedef4c001fd7ab8f1b0adcda0453692bbbf0d527736fc2" : value === body ? "b5c88ead067d3fe2c9cf4af7664d10ad5780a540efc75671529faade61bfeeb6" : "bad";
  assert.equal(parseOguraRecovery(valid, hash).events.length, 2);
  assert.throws(() => parseOguraRecovery(valid));
  assert.throws(() => parseOguraRecovery({ ...valid, events: [{ ...image, timestamp: 1 }, valid.events[1]] }, hash));
  assert.throws(() => parseOguraRecovery({ ...valid, events: [image, { ...valid.events[1], text: "bad" }] }, hash));
});

test("check validates and never writes or downloads", async () => {
  const f = fixture();
  const result = await recoverOguraValidated(f.db, { ...input, action: "check" }, { preflight: async () => { throw Error("unexpected"); }, storeImage: f.storeImage });
  assert.equal(result.status, "checked");
  assert.deepEqual(f.calls, { writes: 0, locks: 0, image: 0 });
});

test("mapping, customer, inquiry and duplicate conflicts reject before writes", async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => { f.mapping.managerChatId = "other"; }, (f: ReturnType<typeof fixture>) => { f.mapping.evidenceManagerMessageId = "other"; }, (f: ReturnType<typeof fixture>) => { f.user.linkedCustomerId = 99; }, (f: ReturnType<typeof fixture>) => { f.inquiry.status = "OPEN"; }, (f: ReturnType<typeof fixture>) => { f.rows.push({ id: 9, externalMessageId: image.messageId, inquiryId: 14 }); }, (f: ReturnType<typeof fixture>) => { f.setFile({ inquiryId: 99, inquiryMessageId: 99, uploadStatus: "STORED" }); }]) {
    const f = fixture(); change(f);
    await assert.rejects(recoverOguraValidated(f.db, input, { preflight: async () => {}, storeImage: f.storeImage }), OguraRecoveryConflictError);
    assert.equal(f.calls.writes, 0);
  }
});

test("existing message with mismatched time fails closed", async () => {
  const f = fixture();
  f.rows.push({ id: 1, inquiryId: 13, lineUserId: 102, externalMessageId: image.messageId, direction: "INBOUND", messageType: "IMAGE", body: null, receivedAt: new Date(1), sentAt: null, status: "received" });
  await assert.rejects(recoverOguraValidated(f.db, input, { preflight: async () => {}, storeImage: f.storeImage }), OguraRecoveryConflictError);
  assert.equal(f.calls.writes, 0);
});

test("preflight fails before writes; successful apply and retry are idempotent", async () => {
  const f = fixture();
  await assert.rejects(recoverOguraValidated(f.db, input, { preflight: async () => { throw new OguraRecoveryPartialError(); }, storeImage: f.storeImage }), OguraRecoveryPartialError);
  assert.equal(f.calls.writes, 0);
  const deps = { preflight: async () => {}, storeImage: f.storeImage };
  const first = await recoverOguraValidated(f.db, input, deps);
  const second = await recoverOguraValidated(f.db, input, deps);
  assert.equal(first.status, "complete");
  assert.equal(second.status, "complete");
  assert.equal(f.calls.writes, 2);
  assert.equal(f.calls.image, 1);
  assert.equal(f.calls.locks, 2);
});

test("image failure is partial and retry stores without duplicate messages", async () => {
  const f = fixture();
  await assert.rejects(recoverOguraValidated(f.db, input, { preflight: async () => {}, storeImage: async () => { throw Error("fixture failure"); } }), OguraRecoveryPartialError);
  assert.equal(f.calls.writes, 2);
  const result = await recoverOguraValidated(f.db, input, { preflight: async () => {}, storeImage: f.storeImage });
  assert.equal(result.status, "complete");
  assert.equal(f.calls.writes, 2);
});
