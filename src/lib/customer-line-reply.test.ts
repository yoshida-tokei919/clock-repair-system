import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createCustomerLineReply, CustomerLineReplyNotFoundError, CustomerLineReplyUnavailableError, parseCustomerLineReply } from "./customer-line-reply";
import { LineManagerSendOutboxError } from "./line-manager-send-outbox";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const body = { lineUserId: 5, text: "顧客への返信", idempotencyKey: uuid };

function fixture(options: { linkedCustomerId?: number | null; customerExists?: boolean; chat?: boolean; open?: number | null; fallback?: number | null } = {}) {
  const queries: any[] = [];
  const calls: any[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => strings[0].includes('"Customer"')
      ? (options.customerExists === false ? [] : [{ id: 7 }])
      : [{ linkedCustomerId: options.linkedCustomerId === undefined ? 7 : options.linkedCustomerId }],
    lineManagerChat: { findUnique: async () => options.chat === false ? null : { id: 11, lineUserId: 5, verifiedAt: new Date() } },
    inquiry: { findFirst: async (query: any) => {
      queries.push(query);
      const id = query.where.status === "OPEN" ? (options.open === undefined ? 21 : options.open) : (options.fallback === undefined ? 13 : options.fallback);
      return id === null ? null : { id, lineUserId: 5 };
    } },
  };
  const db = { $transaction: async (fn: (value: any) => Promise<any>) => fn(tx) } as unknown as PrismaClient;
  const createApproved = (async (_: any, input: any) => {
    calls.push(input);
    return { status: "APPROVED", approvedAt: new Date("2026-10-08T00:00:00Z") };
  }) as any;
  return { db, queries, calls, createApproved };
}

test("validates selected LINE user, text and UUID", () => {
  assert.deepEqual(parseCustomerLineReply(body), body);
  assert.throws(() => parseCustomerLineReply({ ...body, lineUserId: "5" }));
  assert.throws(() => parseCustomerLineReply({ ...body, text: "x".repeat(5001) }));
  assert.throws(() => parseCustomerLineReply({ ...body, idempotencyKey: "bad" }));
});

test("selected linked user uses latest OPEN anchor and namespaced idempotency", async () => {
  const f = fixture();
  const result = await createCustomerLineReply(f.db, 7, body, f.createApproved);
  assert.equal(result.status, "APPROVED");
  assert.deepEqual(f.queries[0].orderBy, [{ lastReceivedAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(f.queries[0].where, { lineUserId: 5, status: "OPEN" });
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.calls[0], { inquiryId: 21, lineManagerChatId: 11, text: body.text, idempotencyKey: `customer-line-reply:7:5:${uuid}` });
});

test("latest existing Inquiry is used when no OPEN Inquiry exists", async () => {
  const f = fixture({ open: null, fallback: 13 });
  await createCustomerLineReply(f.db, 7, body, f.createApproved);
  assert.deepEqual(f.queries[1].where, { lineUserId: 5 });
  assert.equal(f.calls[0].inquiryId, 13);
});

test("missing customer or cross-customer LINE user fails closed", async () => {
  for (const options of [{ customerExists: false }, { linkedCustomerId: 8 }, { linkedCustomerId: null }]) {
    const f = fixture(options);
    await assert.rejects(createCustomerLineReply(f.db, 7, body, f.createApproved), CustomerLineReplyNotFoundError);
    assert.equal(f.calls.length, 0);
  }
});

test("missing verified mapping or existing Inquiry cannot queue", async () => {
  for (const options of [{ chat: false }, { open: null, fallback: null }]) {
    const f = fixture(options);
    await assert.rejects(createCustomerLineReply(f.db, 7, body, f.createApproved), CustomerLineReplyUnavailableError);
    assert.equal(f.calls.length, 0);
  }
});

test("outbox idempotency conflict propagates", async () => {
  const f = fixture();
  const conflict = (async () => { throw new LineManagerSendOutboxError("conflict"); }) as any;
  await assert.rejects(createCustomerLineReply(f.db, 7, body, conflict), LineManagerSendOutboxError);
});

test("a cancelled idempotent outbox is not reported as newly queued", async () => {
  const f = fixture();
  const cancelled = (async () => ({ status: "CANCELLED", approvedAt: new Date() })) as any;
  await assert.rejects(createCustomerLineReply(f.db, 7, body, cancelled), CustomerLineReplyUnavailableError);
});
