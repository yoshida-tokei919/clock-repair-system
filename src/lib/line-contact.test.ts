import assert from "node:assert/strict";
import test from "node:test";
import { resolveLockedLineContact, validateLineContactSelection, type LineContactCustomer } from "./line-contact";
import { assertLineContactOutboxCurrent } from "./line-contact-outbox";
import { businessEstimateLineKey } from "./estimate-line-confirmation";

const source = { id: 6, type: "business", lineContactCustomerId: null };
const delegate = { id: 5, type: "business", lineContactCustomerId: null };

test("LINE proxy accepts one distinct business delegate; direct business and B2C remain separate", () => {
  assert.equal(validateLineContactSelection(source, 5, delegate), 5);
  assert.equal(validateLineContactSelection(source, null, null), null);
  for (const target of [null, { ...delegate, type: "individual" }, { ...delegate, lineContactCustomerId: 9 }]) {
    assert.throws(() => validateLineContactSelection(source, 5, target));
  }
  assert.throws(() => validateLineContactSelection(source, 6, source));
  assert.throws(() => validateLineContactSelection({ ...source, type: "individual" }, 5, delegate));
});

test("source and delegate lock in ID order and observed drift fails closed", async () => {
  const ids: number[] = [];
  const rows = new Map<number, LineContactCustomer>([[5, delegate], [6, { ...source, lineContactCustomerId: 5 }]]);
  const tx: any = {
    customer: { findUnique: async () => ({ lineContactCustomerId: 5 }) },
    $queryRaw: async (_parts: TemplateStringsArray, id: number) => { ids.push(id); return [rows.get(id)]; },
  };
  assert.equal((await resolveLockedLineContact(tx, 6)).contactCustomerId, 5);
  assert.deepEqual(ids, [5, 6]);
  rows.set(6, { ...source, lineContactCustomerId: null });
  await assert.rejects(resolveLockedLineContact(tx, 6), /変更されました/);
});

test("queued proxy estimate rejects disabled, replaced or unverified destination", async () => {
  const verifiedAt = new Date("2026-10-01T00:00:00Z");
  const destination = { lineUserId: 2, inquiryId: 3, lineManagerChatId: 4, verifiedAt, managerBotId: "bot", managerChatId: "chat" };
  const repairs = [{ id: 8, customerId: 6 }];
  const outbox = { idempotencyKey: businessEstimateLineKey(11, 6, repairs, destination, 5), inquiryId: 3, lineManagerChatId: 4, sourceRepairId: null };
  let selected: number | null = 5;
  let users = 1;
  const tx: any = {
    estimateDocument: { findUnique: async () => ({ customerId: 6 }) },
    customer: { findUnique: async () => ({ lineContactCustomerId: selected }) },
    repair: { findMany: async () => repairs },
    lineUser: { findMany: async () => users === 1 ? [{ id: 2, linkedCustomerId: 5,
      lineManagerChat: { id: 4, lineUserId: 2, verifiedAt } }] : [] },
    inquiry: { findFirst: async () => ({ id: 3, lineUserId: 2 }) },
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id, type: "business", lineContactCustomerId: id === 6 ? selected : null }];
      if (sql.includes('FROM "LineUser"')) return [{ linkedCustomerId: 5 }];
      if (sql.includes('FROM "LineManagerChat"')) return [{ id: 4, lineUserId: 2, verifiedAt, managerBotId: "bot", managerChatId: "chat" }];
      throw new Error(sql);
    },
  };
  await assert.doesNotReject(assertLineContactOutboxCurrent(tx, outbox));
  selected = null;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  selected = 7;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  selected = 5; users = 0;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
});
