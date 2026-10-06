import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerCommunicationHub, occurredAt, type CustomerCommunicationDb } from "./customer-communication-hub";

const date = (value: string) => new Date(value);

test("direction-specific source time falls back to createdAt", () => {
  const createdAt = date("2026-01-03T00:00:00Z");
  const receivedAt = date("2026-01-01T00:00:00Z");
  const sentAt = date("2026-01-02T00:00:00Z");
  assert.equal(occurredAt({ direction: "INBOUND", receivedAt, sentAt, createdAt }), receivedAt);
  assert.equal(occurredAt({ direction: "OUTBOUND", receivedAt, sentAt, createdAt }), sentAt);
  assert.equal(occurredAt({ direction: "INBOUND", receivedAt: null, sentAt, createdAt }), createdAt);
  assert.equal(occurredAt({ direction: "OUTBOUND", receivedAt, sentAt: null, createdAt }), createdAt);
});

test("reads the newest 500 messages across linked users and CLOSED/open Inquiries", async () => {
  const queries: any[] = [];
  const rows = Array.from({ length: 501 }, (_, index) => ({
    id: 501 - index,
    inquiryId: index % 2 ? 20 : 10,
    lineUserId: index % 2 ? 2 : 1,
    direction: index % 2 ? "OUTBOUND" : "INBOUND",
    messageType: "TEXT",
    body: `message ${index + 1}`,
    receivedAt: index % 2 ? null : date("2026-01-02T00:00:00Z"),
    sentAt: index % 2 ? date("2026-01-01T00:00:00Z") : null,
    createdAt: date("2026-01-03T00:00:00Z"),
    inquiry: { status: index % 2 ? "OPEN" : "CLOSED", lineUserId: index % 2 ? 2 : 1 },
    files: [],
  }));
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "business", name: "Shop", companyName: "Shop" }) },
    lineUser: { findMany: async (query: any) => {
      queries.push(query);
      return [{ id: 1, displayName: "A" }, { id: 2, displayName: "B" }];
    } },
    inquiryMessage: { findMany: async (query: any) => {
      queries.push(query);
      return rows;
    } },
  } as unknown as CustomerCommunicationDb;

  const hub = await getCustomerCommunicationHub(db, 7);
  assert.equal(hub?.customer.type, "business");
  assert.equal(hub?.lineUsers.length, 2);
  assert.equal(hub?.messages.length, 500);
  assert.equal(hub?.hasEarlierMessages, true);
  assert.equal(hub?.messages.some((message) => message.id === 1), false);
  assert.equal(hub?.messages[0].id, 2);
  assert.equal(hub?.messages[0].channel, "LINE");
  assert.equal(hub?.messages[1].id, 4);
  assert.equal(hub?.messages.at(-1)?.inquiryStatus, "CLOSED");
  assert.equal(hub?.messages.every((message) => message.channel === "LINE"), true);
  assert.deepEqual(queries[0].where, { linkedCustomerId: 7 });
  assert.deepEqual(queries[1].where, {
    lineUserId: { in: [1, 2] },
    lineUser: { linkedCustomerId: 7 },
    inquiry: {
      lineUserId: { in: [1, 2] },
      lineUser: { linkedCustomerId: 7 },
    },
  });
  assert.equal(queries[1].take, 501);
  assert.deepEqual(queries[1].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(queries.length, 2);
});

test("missing customer returns null; customer without linked LINE users has an empty history", async () => {
  let messageQueries = 0;
  const db = {
    customer: { findUnique: async ({ where }: any) => where.id === 2
      ? { id: 2, type: "individual", name: "Customer", companyName: null } : null },
    lineUser: { findMany: async () => [] },
    inquiryMessage: { findMany: async () => { messageQueries++; return []; } },
  } as unknown as CustomerCommunicationDb;
  assert.equal(await getCustomerCommunicationHub(db, 1), null);
  const hub = await getCustomerCommunicationHub(db, 2);
  assert.deepEqual(hub?.messages, []);
  assert.equal(hub?.hasEarlierMessages, false);
  assert.equal(messageQueries, 0);
});
