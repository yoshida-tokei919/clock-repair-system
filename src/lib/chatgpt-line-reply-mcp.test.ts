import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createChatGptLineReplyMcpServer } from "./chatgpt-line-reply-mcp";

const now = new Date("2026-10-09T00:00:00.000Z");

test("MCP advertises three OAuth tools with exact safety annotations and privacy-minimized context", async () => {
  const calls: string[] = [];
  const server = createChatGptLineReplyMcpServer({
    getContext: async (target) => {
      calls.push(`context:${target.targetType}:${target.targetId}`);
      return {
        ...target,
        approvalFingerprint: "a".repeat(64),
        sendAvailable: true,
        mappingVerifiedAt: now,
        hasEarlierMessages: false,
        customerId: 999,
        sourceInquiryId: 777,
        messages: [{ id: 1, inquiryId: 7, lineUserId: 2, direction: "INBOUND", messageType: "TEXT", body: "hello", receivedAt: now, sentAt: null, createdAt: now, status: "received", externalMessageId: "secret-external", files: [] }],
        pendingOutboxes: [{ id: 55, text: "pending", status: "APPROVED", approvedAt: now, createdAt: now, sendId: "secret-send" }],
      };
    },
    approve: async (input) => {
      calls.push(`approve:${input.text}`);
      return { approvalId: 10, status: "APPROVED", sent: false, approvedAt: now, createdAt: now };
    },
    getStatus: async (input) => {
      calls.push(`status:${input.approvalId}`);
      return { approvalId: input.approvalId, status: "CONFIRMED", sent: true, approvedAt: now, createdAt: now, confirmedAt: now, confirmedInquiryMessageId: 123 };
    },
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), ["approve_line_reply", "get_line_reply_context", "get_line_reply_status"]);
    const approve = listed.tools.find((tool) => tool.name === "approve_line_reply")!;
    assert.deepEqual(approve.annotations, { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true });
    assert.deepEqual(approve._meta?.securitySchemes, [{ type: "oauth2", scopes: ["email"] }]);
    for (const name of ["get_line_reply_context", "get_line_reply_status"]) {
      const tool = listed.tools.find((item) => item.name === name)!;
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(tool.annotations?.openWorldHint, false);
    }

    const context = await client.callTool({ name: "get_line_reply_context", arguments: { targetType: "INQUIRY", targetId: 7 } });
    const serialized = JSON.stringify(context.structuredContent);
    assert.equal(serialized.includes("secret-external"), false);
    assert.equal(serialized.includes("secret-send"), false);
    assert.equal(serialized.includes("customerId"), false);
    assert.equal(serialized.includes("sourceInquiryId"), false);
    assert.equal(serialized.includes("\"id\":1"), false);

    const approved = await client.callTool({ name: "approve_line_reply", arguments: { targetType: "INQUIRY", targetId: 7, approvalFingerprint: "a".repeat(64), text: "reply" } });
    assert.equal((approved.structuredContent as any).sent, false);
    const status = await client.callTool({ name: "get_line_reply_status", arguments: { targetType: "INQUIRY", targetId: 7, approvalId: 10 } });
    assert.equal((status.structuredContent as any).sent, true);
    assert.equal(JSON.stringify(status.structuredContent).includes("confirmedInquiryMessageId"), false);
    assert.deepEqual(calls, ["context:INQUIRY:7", "approve:reply", "status:10"]);
  } finally {
    await client.close();
    await server.close();
  }
});
