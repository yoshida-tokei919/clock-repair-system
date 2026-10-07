import { Prisma, type InquiryAiConfidence, type PrismaClient } from "@prisma/client";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";

const MAX_REPAIRS = 20;
const MAX_EVIDENCE_LENGTH = 2000;
const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;

export type PostIntakeRoutingDb = Pick<PrismaClient, "$transaction" | "inquiryMessage">;
export class PostIntakeRoutingInputError extends Error {}
export class PostIntakeRoutingNotFoundError extends Error {}
export class PostIntakeRoutingConflictError extends Error {}

export function postIntakeRoutingErrorStatus(error: unknown, isWrite: boolean): 400 | 404 | 409 | 500 {
  if (error instanceof PostIntakeRoutingInputError || error instanceof SyntaxError) return 400;
  if (error instanceof PostIntakeRoutingNotFoundError) return 404;
  if (error instanceof PostIntakeRoutingConflictError ||
      (isWrite && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) return 409;
  return 500;
}

export function postIntakeRoutingId(value: unknown) {
  const id = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new PostIntakeRoutingInputError("Invalid ID");
  }
  return id;
}

function parseTargets(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PostIntakeRoutingInputError("Invalid routing body");
  }
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.repairIds) || body.repairIds.length > MAX_REPAIRS ||
      body.repairIds.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) ||
      new Set(body.repairIds).size !== body.repairIds.length) {
    throw new PostIntakeRoutingInputError("repairIds must be unique positive IDs, at most 20");
  }
  if (typeof body.hasGeneralContent !== "boolean" || typeof body.hasUnassignedContent !== "boolean") {
    throw new PostIntakeRoutingInputError("Both content flags are required");
  }
  if (body.repairIds.length === 0 && !body.hasGeneralContent && !body.hasUnassignedContent) {
    throw new PostIntakeRoutingInputError("At least one routing target is required");
  }
  return {
    repairIds: body.repairIds as number[],
    hasGeneralContent: body.hasGeneralContent,
    hasUnassignedContent: body.hasUnassignedContent,
  };
}

export function parseManualPostIntakeRouting(value: unknown) {
  const targets = parseTargets(value);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["repairIds", "hasGeneralContent", "hasUnassignedContent"].includes(key))) {
    throw new PostIntakeRoutingInputError("Unexpected manual routing field");
  }
  return targets;
}

export function parseAiPostIntakeRouting(value: unknown) {
  const targets = parseTargets(value);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["repairIds", "hasGeneralContent", "hasUnassignedContent", "confidence", "evidence"].includes(key))) {
    throw new PostIntakeRoutingInputError("Unexpected AI routing field");
  }
  if (body.confidence !== null && body.confidence !== undefined && !CONFIDENCES.includes(body.confidence as InquiryAiConfidence)) {
    throw new PostIntakeRoutingInputError("Invalid AI confidence");
  }
  if (body.evidence !== null && body.evidence !== undefined &&
      (typeof body.evidence !== "string" || body.evidence.length > MAX_EVIDENCE_LENGTH)) {
    throw new PostIntakeRoutingInputError("Invalid AI evidence");
  }
  return {
    ...targets,
    confidence: (body.confidence ?? null) as InquiryAiConfidence | null,
    evidence: (body.evidence ?? null) as string | null,
  };
}

type Targets = ReturnType<typeof parseTargets>;

function safeRouting(routing: {
  customerId: number;
  source: "AI" | "MANUAL";
  confidence: InquiryAiConfidence | null;
  hasGeneralContent: boolean;
  hasUnassignedContent: boolean;
  confirmedAt: Date | null;
  updatedAt: Date;
  repairLinks: { repairId: number }[];
} | null) {
  if (!routing) return null;
  return {
    source: routing.source,
    confidence: routing.confidence,
    hasGeneralContent: routing.hasGeneralContent,
    hasUnassignedContent: routing.hasUnassignedContent,
    confirmedAt: routing.confirmedAt,
    updatedAt: routing.updatedAt,
    repairIds: routing.repairLinks.map((link) => link.repairId).sort((a, b) => a - b),
  };
}

export async function readPostIntakeRouting(db: PostIntakeRoutingDb, customerId: number, messageId: number) {
  const message = await db.inquiryMessage.findFirst({
    where: {
      id: postIntakeRoutingId(messageId),
      lineUser: { linkedCustomerId: postIntakeRoutingId(customerId) },
      inquiry: { lineUser: { linkedCustomerId: customerId } },
    },
    select: {
      id: true,
      lineUserId: true,
      inquiry: { select: { lineUserId: true } },
      postIntakeRouting: {
        select: {
          customerId: true, source: true, confidence: true, hasGeneralContent: true,
          hasUnassignedContent: true, confirmedAt: true, updatedAt: true,
          repairLinks: { select: { repairId: true } },
        },
      },
    },
  });
  if (!message || message.lineUserId !== message.inquiry.lineUserId) {
    throw new PostIntakeRoutingNotFoundError("Message not owned by customer");
  }
  if (message.postIntakeRouting && message.postIntakeRouting.customerId !== customerId) {
    throw new PostIntakeRoutingConflictError("Routing belongs to a previous customer link");
  }
  return { messageId: message.id, routing: safeRouting(message.postIntakeRouting) };
}

async function writePostIntakeRouting(
  db: PostIntakeRoutingDb,
  customerId: number,
  messageId: number,
  targets: Targets,
  source: "AI" | "MANUAL",
  confidence: InquiryAiConfidence | null,
  evidence: string | null,
  now: Date,
) {
  postIntakeRoutingId(customerId);
  postIntakeRoutingId(messageId);
  return db.$transaction(async (tx) => {
    const initial = await tx.inquiryMessage.findUnique({ where: { id: messageId }, select: { lineUserId: true } });
    if (!initial) throw new PostIntakeRoutingNotFoundError("Message not found");
    await lockLineUserInquiryTransaction(tx, initial.lineUserId);

    // Ownership is authoritative only after the per-LineUser lock, and both
    // message and Inquiry must still point to that same linked LineUser.
    const message = await tx.inquiryMessage.findFirst({
      where: {
        id: messageId,
        lineUserId: initial.lineUserId,
        lineUser: { linkedCustomerId: customerId },
        inquiry: { lineUserId: initial.lineUserId, lineUser: { linkedCustomerId: customerId } },
      },
      select: { id: true },
    });
    if (!message) throw new PostIntakeRoutingNotFoundError("Message not owned by customer");

    const existing = await tx.inquiryMessagePostIntakeRouting.findUnique({
      where: { inquiryMessageId: messageId }, select: { id: true, customerId: true, source: true },
    });
    if (existing && existing.customerId !== customerId) {
      throw new PostIntakeRoutingConflictError("Routing ownership changed");
    }
    if (source === "AI" && existing?.source === "MANUAL") {
      return { status: "manual_preserved" as const };
    }

    if (targets.repairIds.length) {
      const repairs = await tx.repair.findMany({
        where: { id: { in: targets.repairIds }, customerId }, select: { id: true },
      });
      if (repairs.length !== targets.repairIds.length) {
        throw new PostIntakeRoutingConflictError("Every Repair must belong to this customer");
      }
    }

    const routing = await tx.inquiryMessagePostIntakeRouting.upsert({
      where: { inquiryMessageId: messageId },
      create: {
        inquiryMessageId: messageId, customerId, source, confidence, evidence,
        hasGeneralContent: targets.hasGeneralContent,
        hasUnassignedContent: targets.hasUnassignedContent,
        confirmedAt: source === "MANUAL" ? now : null,
      },
      update: {
        source, confidence, evidence,
        hasGeneralContent: targets.hasGeneralContent,
        hasUnassignedContent: targets.hasUnassignedContent,
        confirmedAt: source === "MANUAL" ? now : null,
      },
      select: { id: true },
    });
    await tx.inquiryMessagePostIntakeRepairLink.deleteMany({ where: { routingId: routing.id } });
    if (targets.repairIds.length) {
      try {
        await tx.inquiryMessagePostIntakeRepairLink.createMany({
          data: targets.repairIds.map((repairId) => ({ routingId: routing.id, repairId, customerId })),
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new PostIntakeRoutingConflictError("Repair ownership changed during link creation");
        }
        throw error;
      }
    }
    return { status: "saved" as const };
  });
}

export async function upsertManualPostIntakeRouting(
  db: PostIntakeRoutingDb, customerId: number, messageId: number, body: unknown, now = new Date(),
) {
  const targets = parseManualPostIntakeRouting(body);
  const result = await writePostIntakeRouting(db, customerId, messageId, targets, "MANUAL", null, null, now);
  if (result.status !== "saved") throw new PostIntakeRoutingConflictError("Manual routing was not saved");
  return readPostIntakeRouting(db, customerId, messageId);
}

// Server-only entry point for Task206G. No endpoint or automatic classifier is added here.
export async function upsertAiPostIntakeRouting(
  db: PostIntakeRoutingDb, customerId: number, messageId: number, body: unknown,
) {
  const input = parseAiPostIntakeRouting(body);
  return writePostIntakeRouting(db, customerId, messageId, input, "AI", input.confidence, input.evidence, new Date());
}
