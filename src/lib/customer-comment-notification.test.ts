import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  customerCommentAppUrl, customerCommentNotificationKey,
  formatCustomerCommentNotification, saveCustomerCommentWithNotification,
} from "./customer-comment-notification";

test("Slack text contains a safe bounded snippet and an internal message link", () => {
  const url = customerCommentAppUrl(42, 73, "https://example.test/api/customer/repairs/public-token/messages");
  assert.equal(url, "https://example.test/repairs/42/comments#message-73");
  assert.equal(customerCommentNotificationKey(73), "customer-comment:73");
  const text = formatCustomerCommentNotification({
    inquiryNumber: "T-001", brand: "Brand", model: "Model", body: "<@channel> & " + "長".repeat(200), url,
  });
  assert.match(text, /T-001（Brand \/ Model）/);
  assert.match(text, /<https:\/\/example.test\/repairs\/42\/comments#message-73\|アプリでコメントを開く>/);
  assert.doesNotMatch(text, /<@channel>|public-token/);
  assert.equal(Array.from(text.split("\n")[1].replace(/…$/, "")).length, 120);
});

test("customer comment and one deduped Slack intent share a transaction", async () => {
  const calls: string[] = [];
  const tx = {
    repair: { findUnique: async () => ({ inquiryNumber: "T-001", watch: {
      brand: { name: "Brand", nameJp: null }, model: null, modelNameInput: null,
    } }) },
    repairCustomerMessage: { create: async () => { calls.push("message"); return { id: 73, body: "Hello", createdAt: new Date() }; } },
    slackNotificationOutbox: { create: async ({ data }: { data: { target: string; kind: string; dedupeKey: string; text: string } }) => {
      calls.push("outbox");
      assert.equal(data.target, "REPAIR_INBOX");
      assert.equal(data.kind, "CUSTOMER_COMMENT");
      assert.equal(data.dedupeKey, "customer-comment:73");
      assert.match(data.text, /T-001/);
    } },
  };
  const db = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  const message = await saveCustomerCommentWithNotification(db, 42, "Hello", "https://example.test/api/customer/repairs/token/messages");
  assert.equal(message.id, 73);
  assert.deepEqual(calls, ["message", "outbox"]);
});

test("a Slack queue failure rejects the customer comment transaction", async () => {
  const tx = {
    repair: { findUnique: async () => ({ inquiryNumber: "T-001", watch: {
      brand: { name: "Brand", nameJp: null }, model: null, modelNameInput: null,
    } }) },
    repairCustomerMessage: { create: async () => ({ id: 73, body: "Hello", createdAt: new Date() }) },
    slackNotificationOutbox: { create: async () => { throw new Error("queue unavailable"); } },
  };
  const db = { $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaClient;
  await assert.rejects(saveCustomerCommentWithNotification(db, 42, "Hello", "https://example.test"), /queue unavailable/);
});
