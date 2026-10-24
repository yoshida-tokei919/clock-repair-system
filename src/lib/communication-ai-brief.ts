import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { getCustomerCommunicationHub } from "./customer-communication-hub";
import { getRepairLineChat } from "./repair-line-chat";
import { InquiryLineChatNotFoundError } from "./inquiry-line-chat";
import { getCustomerRoutingRevision } from "./communication-routing-revision";
import { getRepairPendingOutboxRevision } from "./communication-pending-outbox-revision";

export type CommunicationAiTargetType = "CUSTOMER" | "REPAIR";
export type CommunicationAiTarget = { targetType: CommunicationAiTargetType; targetId: number };

type CommunicationAiDb = PrismaClient;
type CommunicationAiBriefRow = {
  id: number;
  customerId: number;
  repairId: number | null;
  inputFingerprint: string;
  dedupeKey: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  summary: string | null;
  unresolvedItems: unknown;
  customerRequirements: unknown;
  decisions: unknown;
  replyDraft: string | null;
  createdAt: Date;
};
type CommunicationAiBriefStore = {
  findFirst: (args: unknown) => Promise<CommunicationAiBriefRow | null>;
  findUnique: (args: unknown) => Promise<CommunicationAiBriefRow | null>;
  create: (args: unknown) => Promise<CommunicationAiBriefRow>;
};
type ResolvedContext = Awaited<ReturnType<typeof getCommunicationAiContext>>;

const MAX_METADATA_LENGTH = 128;
const MAX_SUMMARY_LENGTH = 12_000;
const MAX_REPLY_LENGTH = 5_000;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 1_000;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export class CommunicationAiInputError extends Error {}
export class CommunicationAiNotFoundError extends Error {}
export class CommunicationAiStaleError extends Error {}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requiredString(value: unknown, name: string, maxLength = MAX_METADATA_LENGTH) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new CommunicationAiInputError(`${name} is invalid`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength || !value.trim()) {
    throw new CommunicationAiInputError(`${name} is invalid`);
  }
  return value.trim();
}

function stringList(value: unknown, name: string) {
  if (value === undefined || value === null) return [] as string[];
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw new CommunicationAiInputError(`${name} is invalid`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim() || item.length > MAX_LIST_ITEM_LENGTH) {
      throw new CommunicationAiInputError(`${name}[${index}] is invalid`);
    }
    return item.trim();
  });
}

export function parseCommunicationAiTarget(value: unknown): CommunicationAiTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommunicationAiInputError("Invalid target");
  const body = value as Record<string, unknown>;
  if ((body.targetType !== "CUSTOMER" && body.targetType !== "REPAIR") || !positiveId(body.targetId)) {
    throw new CommunicationAiInputError("Invalid target");
  }
  return { targetType: body.targetType, targetId: body.targetId };
}

export function parseCommunicationAiBrief(value: unknown) {
  const target = parseCommunicationAiTarget(value);
  const body = value as Record<string, unknown>;
  if (typeof body.inputFingerprint !== "string" || !FINGERPRINT_PATTERN.test(body.inputFingerprint)) {
    throw new CommunicationAiInputError("inputFingerprint is invalid");
  }
  const summary = optionalString(body.summary, "summary", MAX_SUMMARY_LENGTH);
  const replyDraft = optionalString(body.replyDraft, "replyDraft", MAX_REPLY_LENGTH);
  const unresolvedItems = stringList(body.unresolvedItems, "unresolvedItems");
  const customerRequirements = stringList(body.customerRequirements, "customerRequirements");
  const decisions = stringList(body.decisions, "decisions");
  if (!summary && !replyDraft && unresolvedItems.length === 0 && customerRequirements.length === 0 && decisions.length === 0) {
    throw new CommunicationAiInputError("At least one AI brief field is required");
  }
  return {
    ...target,
    inputFingerprint: body.inputFingerprint,
    modelProvider: requiredString(body.modelProvider, "modelProvider"),
    modelName: requiredString(body.modelName, "modelName"),
    promptVersion: requiredString(body.promptVersion, "promptVersion"),
    summary,
    unresolvedItems,
    customerRequirements,
    decisions,
    replyDraft,
  };
}

function customerSnapshot(targetId: number, hub: NonNullable<Awaited<ReturnType<typeof getCustomerCommunicationHub>>>) {
  return {
    version: 1,
    targetType: "CUSTOMER" as const,
    targetId,
    customerId: hub.customer.id,
    inquirySummaries: hub.inquirySummaries.map((item) => ({
      inquiryId: item.inquiryId,
      status: item.status,
      summary: item.summary,
      firstReceivedAt: iso(item.firstReceivedAt),
      lastReceivedAt: iso(item.lastReceivedAt),
      analysisCompletedAt: iso(item.analysisCompletedAt),
    })),
    messages: hub.messages.map((message) => ({
      id: message.id,
      sourceKind: message.sourceKind,
      verifiedAt: message.sourceKind === "LINE_MANAGER_HISTORY" ? iso(message.verifiedAt) : null,
      inquiryId: message.inquiryId,
      inquiryStatus: message.inquiryStatus,
      direction: message.direction,
      messageType: message.messageType,
      body: message.body,
      occurredAt: iso(message.occurredAt),
      files: message.files.map((file) => ({ id: file.id, mimeType: file.mimeType, uploadStatus: file.uploadStatus })),
      classification: message.classification ? {
        scope: message.classification.scope, source: message.classification.source,
        confidence: message.classification.confidence, confirmedAt: iso(message.classification.confirmedAt),
        watchIds: message.classification.watchIds,
        repairIds: message.classification.repairIds,
      } : null,
      postIntakeRouting: message.postIntakeRouting ? {
        source: message.postIntakeRouting.source, confidence: message.postIntakeRouting.confidence,
        hasGeneralContent: message.postIntakeRouting.hasGeneralContent,
        hasUnassignedContent: message.postIntakeRouting.hasUnassignedContent,
        confirmedAt: iso(message.postIntakeRouting.confirmedAt),
        repairIds: message.postIntakeRouting.repairIds,
      } : null,
    })),
    pendingOutboxes: hub.pendingOutboxes.map((outbox) => ({
      text: outbox.text,
      status: outbox.status,
      approvedAt: iso(outbox.approvedAt),
    })),
    hasEarlierMessages: hub.hasEarlierMessages,
    hasEarlierInquirySummaries: hub.hasEarlierInquirySummaries,
    sendableDestinationCount: hub.destinations.filter((destination) => destination.sendAvailable).length,
    replyDraftAllowed: hub.destinations.filter((destination) => destination.sendAvailable).length === 1,
  };
}

function repairSnapshot(targetId: number, chat: Awaited<ReturnType<typeof getRepairLineChat>>, customerCommunicationWatermark: number | null) {
  return {
    version: 1,
    targetType: "REPAIR" as const,
    targetId,
    customerId: chat.customerId,
    sourceInquiryId: chat.sourceInquiryId,
    promotedAt: iso(chat.promotedAt),
    originAiSummary: chat.originAiSummary ? {
      inquiryId: chat.originAiSummary.inquiryId,
      status: chat.originAiSummary.status,
      summary: chat.originAiSummary.summary,
      firstReceivedAt: iso(chat.originAiSummary.firstReceivedAt),
      lastReceivedAt: iso(chat.originAiSummary.lastReceivedAt),
      analysisCompletedAt: iso(chat.originAiSummary.analysisCompletedAt),
    } : null,
    messages: chat.messages.map((message) => ({
      id: message.id,
      inquiryId: message.inquiryId,
      direction: message.direction,
      messageType: message.messageType,
      body: message.body,
      receivedAt: iso(message.receivedAt),
      sentAt: iso(message.sentAt),
      createdAt: iso(message.createdAt),
      status: message.status,
      editable: message.editable,
      relatedRepairIds: [...message.relatedRepairIds].sort((a, b) => a - b),
      classification: message.classification ? {
        scope: message.classification.scope,
        source: message.classification.source,
        confidence: message.classification.confidence,
        confirmedAt: iso(message.classification.confirmedAt),
        watchIds: [...message.classification.watchIds].sort((a, b) => a - b),
      } : null,
      files: message.files.map((file) => ({
        id: file.id,
        mimeType: file.mimeType,
        width: file.width,
        height: file.height,
        uploadStatus: file.uploadStatus,
      })),
    })),
    pendingOutboxes: chat.pendingOutboxes.map((outbox) => ({
      text: outbox.text,
      status: outbox.status,
      approvedAt: iso(outbox.approvedAt),
      relatedRepairIds: [...outbox.relatedRepairIds].sort((a, b) => a - b),
    })),
    hasEarlierMessages: chat.hasEarlierMessages,
    customerCommunicationWatermark,
  };
}

async function getRepairDestinationState(db: CommunicationAiDb, chat: Awaited<ReturnType<typeof getRepairLineChat>>) {
  if (chat.sourceInquiryId === null) return { available: false, revision: communicationAiFingerprint(null) };
  const inquiry = await db.inquiry.findUnique({
    where: { id: chat.sourceInquiryId },
    select: { lineUser: { select: { linkedCustomerId: true, lineManagerChat: { select: {
      id: true, evidenceInquiryMessageId: true, verifiedAt: true, updatedAt: true,
    } } } } },
  });
  const mapping = inquiry?.lineUser.linkedCustomerId === chat.customerId ? inquiry.lineUser.lineManagerChat : null;
  return { available: Boolean(mapping), revision: communicationAiFingerprint(mapping) };
}

export function communicationAiFingerprint(snapshot: unknown) {
  return sha256(JSON.stringify(snapshot));
}

export function resolveCustomerCommunicationAiContext(
  targetId: number,
  hub: NonNullable<Awaited<ReturnType<typeof getCustomerCommunicationHub>>>,
) {
  const snapshot = customerSnapshot(targetId, hub);
  // Server-only revisions affect freshness without exposing hidden history or row identities.
  return { targetType: "CUSTOMER" as const, targetId, customerId: hub.customer.id, inputFingerprint: communicationAiFingerprint({ snapshot, destinationRevision: hub.destinationRevision, summaryHistoryRevision: hub.summaryHistoryRevision, routingRevision: hub.routingRevision, pendingOutboxRevision: hub.pendingOutboxRevision }), context: snapshot, replyDraftAllowed: snapshot.replyDraftAllowed };
}

export function resolveRepairCommunicationAiContext(
  targetId: number,
  chat: Awaited<ReturnType<typeof getRepairLineChat>>,
  customerCommunicationWatermark: number | null = null,
  routingRevision = "",
  destinationState = { available: chat.sendAvailable, revision: "" },
  pendingOutboxRevision = "",
) {
  const snapshot = repairSnapshot(targetId, chat, customerCommunicationWatermark);
  return { targetType: "REPAIR" as const, targetId, customerId: chat.customerId, inputFingerprint: communicationAiFingerprint({ snapshot, routingRevision, pendingOutboxRevision, repairDestinationRevision: destinationState.revision }), context: snapshot, replyDraftAllowed: chat.sendAvailable && destinationState.available };
}

export async function getRepairCommunicationAiContext(db: CommunicationAiDb, targetId: number, chat: Awaited<ReturnType<typeof getRepairLineChat>>) {
  const [latest, routingRevision, destinationState, pendingOutboxRevision] = await Promise.all([db.inquiryMessage.findFirst({
    where: {
      lineUser: { linkedCustomerId: chat.customerId },
      inquiry: { lineUser: { linkedCustomerId: chat.customerId } },
    },
    orderBy: { id: "desc" },
    select: { id: true },
  }), getCustomerRoutingRevision(db, chat.customerId), getRepairDestinationState(db, chat), getRepairPendingOutboxRevision(db, targetId, chat.customerId, chat.sourceInquiryId)]);
  return resolveRepairCommunicationAiContext(targetId, chat, latest?.id ?? null, routingRevision, destinationState, pendingOutboxRevision);
}

export async function getCommunicationAiContext(db: CommunicationAiDb, target: CommunicationAiTarget) {
  if (target.targetType === "CUSTOMER") {
    const hub = await getCustomerCommunicationHub(db, target.targetId);
    if (!hub) throw new CommunicationAiNotFoundError("Customer not found");
    return resolveCustomerCommunicationAiContext(target.targetId, hub);
  }
  try {
    const chat = await getRepairLineChat(db, target.targetId);
    return getRepairCommunicationAiContext(db, target.targetId, chat);
  } catch (error) {
    if (error instanceof InquiryLineChatNotFoundError) throw new CommunicationAiNotFoundError("Repair not found");
    throw error;
  }
}

export async function getLatestCommunicationAiBrief(
  db: CommunicationAiDb,
  target: CommunicationAiTarget,
  resolvedContext?: ResolvedContext,
) {
  const current = resolvedContext ?? await getCommunicationAiContext(db, target);
  const briefStore = (db as unknown as { communicationAiBrief: CommunicationAiBriefStore }).communicationAiBrief;
  const row = await briefStore.findFirst({
    where: target.targetType === "CUSTOMER"
      ? { customerId: current.customerId, repairId: null }
      : { customerId: current.customerId, repairId: target.targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      inputFingerprint: true,
      modelProvider: true,
      modelName: true,
      promptVersion: true,
      summary: true,
      unresolvedItems: true,
      customerRequirements: true,
      decisions: true,
      replyDraft: true,
      createdAt: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    summary: row.summary,
    unresolvedItems: row.unresolvedItems,
    customerRequirements: row.customerRequirements,
    decisions: row.decisions,
    replyDraft: current.replyDraftAllowed ? row.replyDraft : null,
    createdAt: row.createdAt,
    stale: row.inputFingerprint !== current.inputFingerprint,
  };
}

type ContextResolver = (db: CommunicationAiDb, target: CommunicationAiTarget) => Promise<ResolvedContext>;

export async function saveCommunicationAiBrief(
  db: CommunicationAiDb,
  raw: unknown,
  resolveContext: ContextResolver = getCommunicationAiContext,
) {
  const input = parseCommunicationAiBrief(raw);
  const target = { targetType: input.targetType, targetId: input.targetId } satisfies CommunicationAiTarget;
  const normalized = {
    targetType: input.targetType,
    targetId: input.targetId,
    inputFingerprint: input.inputFingerprint,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    promptVersion: input.promptVersion,
    summary: input.summary,
    unresolvedItems: input.unresolvedItems,
    customerRequirements: input.customerRequirements,
    decisions: input.decisions,
    replyDraft: input.replyDraft,
  };
  const dedupeKey = sha256(JSON.stringify(normalized));
  const briefStore = (db as unknown as { communicationAiBrief: CommunicationAiBriefStore }).communicationAiBrief;
  const current = await resolveContext(db, target);
  if (current.inputFingerprint !== input.inputFingerprint) throw new CommunicationAiStaleError("Communication context changed");
  if (input.targetType === "CUSTOMER" && input.replyDraft && !current.replyDraftAllowed) {
    throw new CommunicationAiInputError("Customer replyDraft requires exactly one sendable LINE destination");
  }

  const existing = await briefStore.findUnique({ where: { dedupeKey } });
  if (existing) {
    const after = await resolveContext(db, target);
    return { brief: existing, deduplicated: true, stale: after.inputFingerprint !== input.inputFingerprint };
  }

  try {
    const brief = await briefStore.create({
      data: {
        customerId: current.customerId,
        repairId: input.targetType === "REPAIR" ? input.targetId : null,
        inputFingerprint: input.inputFingerprint,
        dedupeKey,
        modelProvider: input.modelProvider,
        modelName: input.modelName,
        promptVersion: input.promptVersion,
        summary: input.summary,
        unresolvedItems: input.unresolvedItems,
        customerRequirements: input.customerRequirements,
        decisions: input.decisions,
        replyDraft: input.replyDraft,
      },
    });
    const after = await resolveContext(db, target);
    return { brief, deduplicated: false, stale: after.inputFingerprint !== input.inputFingerprint };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002") {
      const concurrent = await briefStore.findUnique({ where: { dedupeKey } });
      if (concurrent) {
        const after = await resolveContext(db, target);
        return { brief: concurrent, deduplicated: true, stale: after.inputFingerprint !== input.inputFingerprint };
      }
    }
    throw error;
  }
}
