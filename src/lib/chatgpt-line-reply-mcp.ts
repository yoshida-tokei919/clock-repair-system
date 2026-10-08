import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "./prisma";
import {
  approveReply,
  bridgeError,
  getReplyApprovalContext,
  getReplyApprovalStatus,
  parseApproval,
  parseStatus,
  type ReplyTargetType,
} from "./chatgpt-line-reply-bridge";

const oauthSecuritySchemes = [{ type: "oauth2", scopes: ["email"] }] as const;
const toolMeta = { securitySchemes: oauthSecuritySchemes };
const targetShape = {
  targetType: z.enum(["INQUIRY", "REPAIR"]).describe("LINE conversation target type."),
  targetId: z.number().int().positive().describe("Existing Inquiry or Repair ID."),
};

const messageOutput = z.object({
  direction: z.string(),
  messageType: z.string(),
  body: z.string().nullable(),
  occurredAt: z.string(),
  status: z.string().nullable(),
  files: z.array(z.object({
    mimeType: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    uploadStatus: z.string().nullable(),
  })),
});
const pendingOutput = z.object({ text: z.string(), status: z.string(), approvedAt: z.string() });
const contextOutput = z.object({
  targetType: z.enum(["INQUIRY", "REPAIR"]),
  targetId: z.number().int().positive(),
  approvalFingerprint: z.string(),
  sendAvailable: z.boolean(),
  hasEarlierMessages: z.boolean(),
  messages: z.array(messageOutput),
  pendingReplies: z.array(pendingOutput),
});
const approvalOutput = z.object({
  approvalId: z.number().int().positive(),
  status: z.string(),
  sent: z.boolean(),
  approvedAt: z.string(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable().optional(),
});

type BridgeOperations = {
  getContext: (target: { targetType: ReplyTargetType; targetId: number }) => Promise<any>;
  approve: (input: { targetType: ReplyTargetType; targetId: number; approvalFingerprint: string; text: string }) => Promise<any>;
  getStatus: (input: { targetType: ReplyTargetType; targetId: number; approvalId: number }) => Promise<any>;
};

const defaultOperations: BridgeOperations = {
  getContext: (target) => getReplyApprovalContext(prisma, target),
  approve: (input) => approveReply(prisma, parseApproval(input)),
  getStatus: (input) => getReplyApprovalStatus(prisma, parseStatus(input)),
};

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function occurredAt(message: any) {
  return iso(message.receivedAt ?? message.sentAt ?? message.createdAt);
}

export function sanitizeMcpReplyContext(context: any) {
  return {
    targetType: context.targetType as ReplyTargetType,
    targetId: context.targetId as number,
    approvalFingerprint: String(context.approvalFingerprint),
    sendAvailable: Boolean(context.sendAvailable),
    hasEarlierMessages: Boolean(context.hasEarlierMessages),
    messages: (context.messages ?? []).map((message: any) => ({
      direction: String(message.direction),
      messageType: String(message.messageType),
      body: typeof message.body === "string" ? message.body : null,
      occurredAt: occurredAt(message),
      status: typeof message.status === "string" ? message.status : null,
      files: (message.files ?? []).map((file: any) => ({
        mimeType: typeof file.mimeType === "string" ? file.mimeType : null,
        width: typeof file.width === "number" ? file.width : null,
        height: typeof file.height === "number" ? file.height : null,
        uploadStatus: typeof file.uploadStatus === "string" ? file.uploadStatus : null,
      })),
    })),
    pendingReplies: (context.pendingOutboxes ?? []).map((row: any) => ({
      text: String(row.text ?? ""),
      status: String(row.status ?? ""),
      approvedAt: iso(row.approvedAt),
    })),
  };
}

export function sanitizeMcpApproval(row: any) {
  return {
    approvalId: Number(row.approvalId),
    status: String(row.status),
    sent: row.status === "CONFIRMED" && row.sent === true,
    approvedAt: iso(row.approvedAt),
    createdAt: iso(row.createdAt),
    ...(row.status === "CONFIRMED" ? { confirmedAt: row.confirmedAt ? iso(row.confirmedAt) : null } : {}),
  };
}

function success<T extends Record<string, unknown>>(value: T, summary: string) {
  return { structuredContent: value, content: [{ type: "text" as const, text: summary }] };
}

function safeError(error: unknown) {
  const { code } = bridgeError(error);
  const message = code === "stale"
    ? "LINE conversation changed. Read the reply context again before approving a send."
    : code === "unavailable"
      ? "LINE sending is not currently available for this target."
      : code === "not_found"
        ? "The requested LINE target or approval was not found."
        : code === "invalid_input"
          ? "The LINE reply request was invalid."
          : "The LINE reply operation could not be completed safely.";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export function createChatGptLineReplyMcpServer(operations: BridgeOperations = defaultOperations) {
  const server = new McpServer({ name: "Yoshida Clock Repair LINE", version: "1.0.0" });

  server.registerTool("get_line_reply_context", {
    title: "LINE???????",
    description: "????Inquiry???Repair????LINE????????????????fingerprint??????????DB?????????",
    inputSchema: targetShape,
    outputSchema: contextOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: toolMeta,
  }, async (input) => {
    try {
      const item = sanitizeMcpReplyContext(await operations.getContext(input));
      return success(item, `LINE reply context loaded for ${input.targetType} ${input.targetId}.`);
    } catch (error) { return safeError(error); }
  });

  server.registerTool("approve_line_reply", {
    title: "LINE?????????????",
    description: "???????approvalFingerprint???????LINE??????????????Outbox???????LINE??????????????????????????????????????????",
    inputSchema: {
      ...targetShape,
      approvalFingerprint: z.string().regex(/^[a-f0-9]{64}$/).describe("Fingerprint returned by get_line_reply_context."),
      text: z.string().min(1).max(5000).describe("Exact LINE reply text explicitly approved by the user."),
    },
    outputSchema: approvalOutput,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
    _meta: toolMeta,
  }, async (input) => {
    try {
      const item = sanitizeMcpApproval(await operations.approve(input));
      return success(item, item.sent ? "LINE reply is confirmed sent." : `LINE reply queued with status ${item.status}.`);
    } catch (error) { return safeError(error); }
  });

  server.registerTool("get_line_reply_status", {
    title: "LINE??????????",
    description: "approve_line_reply?????approvalId???Inquiry???Repair???????????CONFIRMED???????????????",
    inputSchema: { ...targetShape, approvalId: z.number().int().positive().describe("Approval ID returned by approve_line_reply.") },
    outputSchema: approvalOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: toolMeta,
  }, async (input) => {
    try {
      const item = sanitizeMcpApproval(await operations.getStatus(input));
      return success(item, item.sent ? "LINE reply is CONFIRMED sent." : `LINE reply status is ${item.status}; it is not confirmed sent.`);
    } catch (error) { return safeError(error); }
  });

  return server;
}
