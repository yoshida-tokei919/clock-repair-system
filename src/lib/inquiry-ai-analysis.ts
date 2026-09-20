import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildInquiryAiInputSnapshot,
  fingerprintInquiryAiInput,
} from "./inquiry-ai-context";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";

const ANALYSIS_STATUSES = ["COMPLETED", "NEEDS_REVIEW", "FAILED"] as const;
const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
const FIELDS = ["BRAND", "MODEL", "PRODUCT_REF", "CASE_REF", "CALIBER", "BASE_CALIBER", "MOVEMENT_TYPE", "ERA"] as const;
const SOURCE_TYPES = ["CUSTOMER_STATED", "IMAGE_OBSERVED", "WEB_INFERRED", "AI_INFERRED", "TECHNICIAN_CONFIRMED"] as const;
const REVIEW_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;

type AnalysisStatus = typeof ANALYSIS_STATUSES[number];
type Confidence = typeof CONFIDENCES[number];
type CandidateField = typeof FIELDS[number];
type SourceType = typeof SOURCE_TYPES[number];
type ReviewStatus = typeof REVIEW_STATUSES[number];

export type InquiryAiAnalysisDb = Pick<PrismaClient, "inquiry" | "inquiryAiAnalysis" | "$transaction">;

export class InquiryAiAnalysisInputError extends Error {}
export class InquiryAiAnalysisStaleError extends Error {}
export class InquiryAiAnalysisNotFoundError extends Error {}
export class InquiryAiAnalysisIdempotencyConflictError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function string(value: unknown, name: string, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new InquiryAiAnalysisInputError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new InquiryAiAnalysisInputError(`${name} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw new InquiryAiAnalysisInputError(`${name} is required`);
  return normalized || undefined;
}
function enumValue<T extends readonly string[]>(value: unknown, values: T, name: string, required = false): T[number] | undefined {
  if (value === undefined || value === null) {
    if (required) throw new InquiryAiAnalysisInputError(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string" || !values.includes(value)) throw new InquiryAiAnalysisInputError(`${name} is invalid`);
  return value as T[number];
}
function safeInteger(value: unknown, name: string, minimum = 0, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new InquiryAiAnalysisInputError(`${name} is required`);
    return undefined;
  }
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new InquiryAiAnalysisInputError(`${name} is invalid`);
  return value as number;
}
function json(value: unknown, name: string, arrayOnly = false): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (arrayOnly && !Array.isArray(value)) throw new InquiryAiAnalysisInputError(`${name} must be an array`);
  try { JSON.stringify(value); } catch { throw new InquiryAiAnalysisInputError(`${name} must be JSON`); }
  return value as Prisma.InputJsonValue;
}
function positiveIdArray(value: unknown, name: string) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new InquiryAiAnalysisInputError(`${name} must be an array of positive safe integers`);
  }
  if (new Set(value).size !== value.length) throw new InquiryAiAnalysisInputError(`${name} must not contain duplicates`);
  return value as number[];
}

type Candidate = {
  field: CandidateField; rank: number; value: string; confidence?: Confidence; evidence?: string; observedText?: string;
  sourceType: SourceType; sourceMessageIds?: number[]; sourceImageIds?: number[]; reviewStatus: ReviewStatus;
};
type Watch = {
  position: number; label?: string; summary?: string; segmentationConfidence?: Confidence;
  faults?: Prisma.InputJsonValue; requestedWork?: Prisma.InputJsonValue; supplementalFacts?: Prisma.InputJsonValue;
  missingInformation?: Prisma.InputJsonValue; missingPhotos?: Prisma.InputJsonValue; candidates: Candidate[];
};
export type ParsedInquiryAiAnalysis = {
  inputFingerprint: string; idempotencyKey: string; status: AnalysisStatus; modelProvider: string; modelName: string; promptVersion: string;
  conversationSummary?: string; watchCount?: number; watchCountConfidence?: Confidence; unresolvedPoints?: Prisma.InputJsonValue;
  errorMessage?: string; watches: Watch[];
};

export function parseInquiryAiAnalysisPayload(value: unknown): ParsedInquiryAiAnalysis {
  const input = record(value);
  if (!input) throw new InquiryAiAnalysisInputError("JSON object required");
  const status = enumValue(input.status, ANALYSIS_STATUSES, "status", true)!;
  const watchesInput = input.watches;
  if (!Array.isArray(watchesInput)) throw new InquiryAiAnalysisInputError("watches must be an array");
  const watches = watchesInput.map((raw, watchIndex) => {
    const watch = record(raw);
    if (!watch) throw new InquiryAiAnalysisInputError(`watches[${watchIndex}] must be an object`);
    if (!Array.isArray(watch.candidates)) throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates must be an array`);
    return {
      position: safeInteger(watch.position, `watches[${watchIndex}].position`, 1, true)!,
      label: string(watch.label, `watches[${watchIndex}].label`), summary: string(watch.summary, `watches[${watchIndex}].summary`),
      segmentationConfidence: enumValue(watch.segmentationConfidence, CONFIDENCES, `watches[${watchIndex}].segmentationConfidence`),
      faults: json(watch.faults, `watches[${watchIndex}].faults`), requestedWork: json(watch.requestedWork, `watches[${watchIndex}].requestedWork`),
      supplementalFacts: json(watch.supplementalFacts, `watches[${watchIndex}].supplementalFacts`),
      missingInformation: json(watch.missingInformation, `watches[${watchIndex}].missingInformation`, true), missingPhotos: json(watch.missingPhotos, `watches[${watchIndex}].missingPhotos`, true),
      candidates: watch.candidates.map((rawCandidate, candidateIndex) => {
        const candidate = record(rawCandidate);
        if (!candidate) throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates[${candidateIndex}] must be an object`);
        const sourceType = enumValue(candidate.sourceType, SOURCE_TYPES, `watches[${watchIndex}].candidates[${candidateIndex}].sourceType`, true)!;
        if (sourceType === "TECHNICIAN_CONFIRMED") {
          throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates[${candidateIndex}].sourceType is not allowed for AI analysis`);
        }
        const reviewStatus = enumValue(candidate.reviewStatus, REVIEW_STATUSES, `watches[${watchIndex}].candidates[${candidateIndex}].reviewStatus`) ?? "PENDING";
        if (reviewStatus !== "PENDING") {
          throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates[${candidateIndex}].reviewStatus is not allowed for AI analysis`);
        }
        const sourceMessageIds = positiveIdArray(candidate.sourceMessageIds, `watches[${watchIndex}].candidates[${candidateIndex}].sourceMessageIds`);
        const sourceImageIds = positiveIdArray(candidate.sourceImageIds, `watches[${watchIndex}].candidates[${candidateIndex}].sourceImageIds`);
        if (sourceType === "CUSTOMER_STATED" && !sourceMessageIds?.length) {
          throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates[${candidateIndex}].sourceMessageIds is required for CUSTOMER_STATED`);
        }
        if (sourceType === "IMAGE_OBSERVED" && !sourceImageIds?.length) {
          throw new InquiryAiAnalysisInputError(`watches[${watchIndex}].candidates[${candidateIndex}].sourceImageIds is required for IMAGE_OBSERVED`);
        }
        return {
          field: enumValue(candidate.field, FIELDS, `watches[${watchIndex}].candidates[${candidateIndex}].field`, true)!,
          rank: safeInteger(candidate.rank, `watches[${watchIndex}].candidates[${candidateIndex}].rank`, 0) ?? 0,
          value: string(candidate.value, `watches[${watchIndex}].candidates[${candidateIndex}].value`, true)!,
          confidence: enumValue(candidate.confidence, CONFIDENCES, `watches[${watchIndex}].candidates[${candidateIndex}].confidence`),
          evidence: string(candidate.evidence, `watches[${watchIndex}].candidates[${candidateIndex}].evidence`), observedText: string(candidate.observedText, `watches[${watchIndex}].candidates[${candidateIndex}].observedText`),
          sourceType,
          sourceMessageIds,
          sourceImageIds,
          reviewStatus,
        };
      }),
    };
  });
  if (new Set(watches.map((watch) => watch.position)).size !== watches.length) throw new InquiryAiAnalysisInputError("watch positions must be unique");
  const parsed = {
    inputFingerprint: string(input.inputFingerprint, "inputFingerprint", true)!, idempotencyKey: string(input.idempotencyKey, "idempotencyKey", true)!, status,
    modelProvider: string(input.modelProvider, "modelProvider", true)!, modelName: string(input.modelName, "modelName", true)!, promptVersion: string(input.promptVersion, "promptVersion", true)!,
    conversationSummary: string(input.conversationSummary, "conversationSummary"), watchCount: safeInteger(input.watchCount, "watchCount", 0),
    watchCountConfidence: enumValue(input.watchCountConfidence, CONFIDENCES, "watchCountConfidence"), unresolvedPoints: json(input.unresolvedPoints, "unresolvedPoints", true),
    errorMessage: string(input.errorMessage, "errorMessage"), watches,
  };
  if (parsed.status === "FAILED" && !parsed.errorMessage) throw new InquiryAiAnalysisInputError("errorMessage is required for FAILED");
  if ((parsed.status === "COMPLETED" || parsed.status === "NEEDS_REVIEW") && !parsed.conversationSummary) {
    throw new InquiryAiAnalysisInputError("conversationSummary is required for COMPLETED or NEEDS_REVIEW");
  }
  return parsed;
}

async function currentInput(db: InquiryAiAnalysisDb, inquiryId: number) {
  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId }, select: { id: true, messages: { select: { id: true, direction: true, messageType: true, body: true, receivedAt: true, sentAt: true, status: true, createdAt: true } }, files: { select: { id: true, inquiryMessageId: true, mimeType: true, fileSize: true, width: true, height: true, uploadStatus: true, objectKey: true, createdAt: true, updatedAt: true } } } });
  if (!inquiry) throw new InquiryAiAnalysisNotFoundError("Inquiry not found");
  const snapshot = buildInquiryAiInputSnapshot({ inquiryId: inquiry.id, messages: inquiry.messages, files: inquiry.files });
  return { inquiry, snapshot, fingerprint: fingerprintInquiryAiInput(snapshot) };
}

function assertSources(parsed: ParsedInquiryAiAnalysis, input: Awaited<ReturnType<typeof currentInput>>) {
  const messageIds = new Set(input.inquiry.messages.map((message) => message.id));
  const inboundMessageIds = new Set(input.inquiry.messages
    .filter((message) => message.direction === "INBOUND")
    .map((message) => message.id));
  const imageIds = new Set(input.inquiry.files.filter((file) => file.uploadStatus === "STORED").map((file) => file.id));
  for (const watch of parsed.watches) for (const candidate of watch.candidates) {
    if (candidate.sourceMessageIds?.some((id) => !messageIds.has(id)) || candidate.sourceImageIds?.some((id) => !imageIds.has(id))) {
      throw new InquiryAiAnalysisInputError("candidate source IDs are not in this Inquiry's current AI context");
    }
    if (candidate.sourceType === "CUSTOMER_STATED" && !candidate.sourceMessageIds?.some((id) => inboundMessageIds.has(id))) {
      throw new InquiryAiAnalysisInputError("CUSTOMER_STATED candidates must cite an inbound InquiryMessage");
    }
  }
}

type SavedInquiryAiWatch = {
  id: number;
  position: number;
  label: string | null;
  summary: string | null;
  faults: unknown;
  requestedWork: unknown;
  supplementalFacts: unknown;
  missingInformation: unknown;
  missingPhotos: unknown;
  candidates: Array<{ id: number; field: string; rank: number; value: string }>;
};

function preferredAiCandidates(candidates: SavedInquiryAiWatch["candidates"]) {
  const byField = new Map<string, SavedInquiryAiWatch["candidates"][number]>();
  for (const candidate of candidates) {
    const current = byField.get(candidate.field);
    if (!current || candidate.rank < current.rank || (candidate.rank === current.rank && candidate.id < current.id)) {
      byField.set(candidate.field, candidate);
    }
  }
  return Array.from(byField.values());
}

// AI snapshots are immutable. A review draft is stable per Inquiry + position,
// so reanalysis refreshes pending AI values without replacing manual or
// confirmed values.
async function syncInquiryWatchDrafts(tx: any, inquiryId: number, aiWatches: SavedInquiryAiWatch[]) {
  for (const aiWatch of aiWatches) {
    const selectedCandidates = preferredAiCandidates(aiWatch.candidates);
    const draftData = {
      sourceAiWatchId: aiWatch.id,
      label: aiWatch.label,
      summary: aiWatch.summary,
      faults: aiWatch.faults,
      requestedWork: aiWatch.requestedWork,
      supplementalFacts: aiWatch.supplementalFacts,
      missingInformation: aiWatch.missingInformation,
      missingPhotos: aiWatch.missingPhotos,
    };
    const existing = await tx.inquiryWatch.findUnique({
      where: { inquiryId_position: { inquiryId, position: aiWatch.position } },
      include: { fieldValues: true },
    });
    if (!existing) {
      await tx.inquiryWatch.create({
        data: {
          inquiryId,
          position: aiWatch.position,
          ...draftData,
          fieldValues: {
            create: selectedCandidates.map((candidate) => ({
              field: candidate.field,
              value: candidate.value,
              source: "AI_CANDIDATE",
              sourceAiCandidateId: candidate.id,
            })),
          },
        },
      });
      continue;
    }

    await tx.inquiryWatch.update({ where: { id: existing.id }, data: draftData });
    for (const candidate of selectedCandidates) {
      const current = existing.fieldValues.find((value: any) => value.field === candidate.field);
      if (!current) {
        await tx.inquiryWatchFieldValue.create({
          data: {
            inquiryWatchId: existing.id,
            field: candidate.field,
            value: candidate.value,
            source: "AI_CANDIDATE",
            sourceAiCandidateId: candidate.id,
          },
        });
      } else if (current.source === "AI_CANDIDATE" && current.confirmationStatus === "PENDING") {
        await tx.inquiryWatchFieldValue.update({
          where: { id: current.id },
          data: { value: candidate.value, sourceAiCandidateId: candidate.id },
        });
      }
    }
  }
}

export async function saveInquiryAiAnalysis(db: InquiryAiAnalysisDb, inquiryId: number, payload: unknown) {
  const parsed = parseInquiryAiAnalysisPayload(payload);
  const existing = await db.inquiryAiAnalysis.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
  if (existing) {
    if (existing.inquiryId !== inquiryId) throw new InquiryAiAnalysisIdempotencyConflictError("idempotencyKey belongs to another Inquiry");
    return { analysis: existing, deduplicated: true };
  }
  const inquiryStatus = parsed.status === "COMPLETED" ? "AI_PROCESSED" : parsed.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "AI_PENDING";
  try {
    const result = await db.$transaction(async (tx: any) => {
      const lockTarget = await tx.inquiry.findUnique({ where: { id: inquiryId }, select: { lineUserId: true } });
      if (!lockTarget) throw new InquiryAiAnalysisNotFoundError("Inquiry not found");
      await lockLineUserInquiryTransaction(tx, lockTarget.lineUserId);
      const lockedExisting = await tx.inquiryAiAnalysis.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
      if (lockedExisting) {
        if (lockedExisting.inquiryId !== inquiryId) throw new InquiryAiAnalysisIdempotencyConflictError("idempotencyKey belongs to another Inquiry");
        return { analysis: lockedExisting, deduplicated: true };
      }
      const input = await currentInput(tx, inquiryId);
      if (parsed.inputFingerprint !== input.fingerprint) throw new InquiryAiAnalysisStaleError("AI input context has changed");
      assertSources(parsed, input);
      const created = await tx.inquiryAiAnalysis.create({
        data: {
          inquiryId, status: parsed.status, idempotencyKey: parsed.idempotencyKey, inputFingerprint: input.fingerprint,
          modelProvider: parsed.modelProvider, modelName: parsed.modelName, promptVersion: parsed.promptVersion, inputSnapshot: input.snapshot,
          conversationSummary: parsed.conversationSummary, watchCount: parsed.watchCount, watchCountConfidence: parsed.watchCountConfidence,
          unresolvedPoints: parsed.unresolvedPoints, errorMessage: parsed.errorMessage, completedAt: new Date(),
          watches: { create: parsed.watches.map(({ candidates, ...watch }) => ({ ...watch, candidates: { create: candidates } })) },
        },
        include: { watches: { include: { candidates: true } } },
      });
      await syncInquiryWatchDrafts(tx, inquiryId, created.watches);
      await tx.inquiry.update({ where: { id: inquiryId }, data: {
        status: inquiryStatus,
        ...(parsed.status !== "FAILED" && parsed.conversationSummary ? { conversationSummary: parsed.conversationSummary } : {}),
      } });
      return { analysis: created, deduplicated: false };
    });
    return result;
  } catch (error: any) {
    if (error?.code === "P2002") {
      const concurrent = await db.inquiryAiAnalysis.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
      if (concurrent?.inquiryId === inquiryId) return { analysis: concurrent, deduplicated: true };
      if (concurrent) throw new InquiryAiAnalysisIdempotencyConflictError("idempotencyKey belongs to another Inquiry");
    }
    throw error;
  }
}
