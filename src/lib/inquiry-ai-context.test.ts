import assert from "node:assert/strict";
import test from "node:test";
import type { InquiryAiContextDb } from "./inquiry-ai-context";
import {
  getInquiryAiContext,
  listPendingInquiryAiContexts,
} from "./inquiry-ai-context";

test("pending context filters, orders, and caps the requested limit", async () => {
  let args: any;
  const db: any = {
    inquiry: {
      findMany: async (input: any) => {
        args = input;
        return [{
          id: 8,
          status: "AI_PENDING",
          firstReceivedAt: new Date("2026-09-18T00:00:00.000Z"),
          lastReceivedAt: new Date("2026-09-19T00:00:00.000Z"),
          lineUser: { displayName: "LINE Name", linkedCustomer: null },
          _count: { messages: 3, files: 2 },
        }];
      },
    },
  };

  const result = await listPendingInquiryAiContexts(db as InquiryAiContextDb, { limit: 999 });

  assert.deepEqual(args.where.status.in, ["OPEN", "AI_PENDING", "NEEDS_REVIEW"]);
  assert.deepEqual(args.orderBy, { lastReceivedAt: "desc" });
  assert.equal(args.take, 50);
  assert.equal(result[0]?.identity, "unregistered");
  assert.equal(result[0]?.displayName, "LINE Name");
  assert.equal(result[0]?.messageCount, 3);
  assert.equal(result[0]?.storedImageCount, 2);
});

test("detail context returns conversation-time order and signs only stored files", async () => {
  let args: any;
  const db: any = {
    inquiry: {
      findUnique: async (input: any) => {
        args = input;
        return {
          id: 4,
          status: "OPEN",
          firstReceivedAt: new Date("2026-09-18T00:00:00.000Z"),
          lastReceivedAt: new Date("2026-09-19T00:00:00.000Z"),
          lineUser: { id: 9, displayName: null, linkedCustomer: null },
          messages: [
            { id: 3, direction: "OUTBOUND", messageType: "TEXT", body: "third", receivedAt: null, sentAt: new Date("2026-09-18T03:00:00.000Z"), status: "sent", createdAt: new Date("2026-09-18T01:00:00.000Z") },
            { id: 2, direction: "INBOUND", messageType: "TEXT", body: "second", receivedAt: new Date("2026-09-18T02:00:00.000Z"), sentAt: null, status: "received", createdAt: new Date("2026-09-18T03:00:00.000Z") },
            { id: 1, direction: "INBOUND", messageType: "TEXT", body: "original LINE text", receivedAt: new Date("2026-09-18T01:00:00.000Z"), sentAt: null, status: "received", createdAt: new Date("2026-09-18T04:00:00.000Z") },
          ],
          files: [
            { id: 2, mimeType: "image/webp", fileSize: 20, width: 10, height: 20, uploadStatus: "STORED", objectKey: "inquiries/202609/file.webp", createdAt: new Date() },
            { id: 3, mimeType: null, fileSize: null, width: null, height: null, uploadStatus: "FAILED", objectKey: "inquiries/202609/failed.webp", createdAt: new Date() },
            { id: 4, mimeType: null, fileSize: null, width: null, height: null, uploadStatus: "PENDING", objectKey: "inquiries/202609/pending.webp", createdAt: new Date() },
          ],
        };
      },
    },
  };
  const signedKeys: string[] = [];
  const result = await getInquiryAiContext(db as InquiryAiContextDb, 4, async (key, expiresIn) => {
    signedKeys.push(`${key}:${expiresIn}`);
    return "https://signed.example/file";
  });

  assert.equal(args.select.messages.orderBy, undefined);
  assert.deepEqual(result?.messages.map((message) => message.id), [1, 2, 3]);
  assert.equal(result?.lineUser?.displayName, "LINE display name unavailable");
  assert.deepEqual(signedKeys, ["inquiries/202609/file.webp:300"]);
  assert.equal(result?.files[0]?.signedReadUrl, "https://signed.example/file");
  assert.equal(result?.files[1]?.signedReadUrl, null);
  assert.equal(result?.files[2]?.signedReadUrl, null);
});

test("detail context returns null when the Inquiry does not exist", async () => {
  const db: any = { inquiry: { findUnique: async () => null } };
  assert.equal(await getInquiryAiContext(db as InquiryAiContextDb, 404, async () => "unused"), null);
});
