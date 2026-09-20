import assert from "node:assert/strict";
import test from "node:test";
import { buildInquiryAiInputSnapshot, fingerprintInquiryAiInput } from "./inquiry-ai-context";
import {
  InquiryAiAnalysisInputError,
  InquiryAiAnalysisStaleError,
  saveInquiryAiAnalysis,
} from "./inquiry-ai-analysis";

function createFakeDb() {
  const inquiry = {
    id: 7,
    lineUserId: 3,
    messages: [{ id: 11, direction: "INBOUND", messageType: "TEXT", body: "Please repair this", receivedAt: new Date("2026-09-18T00:00:00.000Z"), sentAt: null, status: "received", createdAt: new Date("2026-09-18T00:00:00.000Z") }],
    files: [{ id: 22, inquiryMessageId: 11, mimeType: "image/webp", fileSize: 10, width: 1, height: 1, uploadStatus: "STORED", objectKey: "inquiries/7/image.webp", createdAt: new Date("2026-09-18T00:00:00.000Z"), updatedAt: new Date("2026-09-18T00:00:00.000Z") }],
  };
  const analyses: any[] = [];
  const reviewWatches: any[] = [];
  const updates: any[] = [];
  const calls: string[] = [];
  const db: any = {
    inquiry: {
      findUnique: async ({ select }: any) => { calls.push(select?.lineUserId ? "lock-target" : "final-context"); return inquiry; },
      update: async ({ data }: any) => { calls.push("inquiry-update"); updates.push(data); return data; },
    },
    inquiryAiAnalysis: {
      findUnique: async ({ where }: any) => analyses.find((analysis) => analysis.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        calls.push("analysis-create");
        const analysisId = analyses.length + 1;
        const watches = data.watches.create.map((watch: any, watchIndex: number) => ({
          id: analysisId * 100 + watchIndex + 1,
          ...watch,
          candidates: watch.candidates.create.map((candidate: any, candidateIndex: number) => ({
            id: analysisId * 1000 + watchIndex * 100 + candidateIndex + 1,
            ...candidate,
          })),
        }));
        const result = { id: analysisId, ...data, watches };
        analyses.push(result);
        return result;
      },
    },
    inquiryWatch: {
      findUnique: async ({ where }: any) => {
        calls.push("review-watch-find");
        return reviewWatches.find((watch) => watch.inquiryId === where.inquiryId_position.inquiryId && watch.position === where.inquiryId_position.position) ?? null;
      },
      create: async ({ data }: any) => {
        calls.push("review-watch-create");
        const watch = {
          id: reviewWatches.length + 1,
          ...data,
          fieldValues: data.fieldValues.create.map((value: any, index: number) => ({ id: index + 1, ...value })),
        };
        reviewWatches.push(watch);
        return watch;
      },
      update: async ({ where, data }: any) => {
        calls.push("review-watch-update");
        const watch = reviewWatches.find((item) => item.id === where.id);
        Object.assign(watch, data);
        return watch;
      },
    },
    inquiryWatchFieldValue: {
      create: async ({ data }: any) => {
        calls.push("review-field-create");
        const watch = reviewWatches.find((item) => item.id === data.inquiryWatchId);
        const value = { id: watch.fieldValues.length + 1, ...data };
        watch.fieldValues.push(value);
        return value;
      },
      update: async ({ where, data }: any) => {
        calls.push("review-field-update");
        const value = reviewWatches.flatMap((watch) => watch.fieldValues).find((item) => item.id === where.id);
        Object.assign(value, data);
        return value;
      },
    },
    $executeRaw: async () => { calls.push("advisory-lock"); },
    $transaction: async (callback: any) => callback(db),
  };
  return { db, inquiry, analyses, reviewWatches, updates, calls };
}

function payload(fake: ReturnType<typeof createFakeDb>, status: "COMPLETED" | "NEEDS_REVIEW" | "FAILED" = "COMPLETED") {
  const inputFingerprint = fingerprintInquiryAiInput(buildInquiryAiInputSnapshot({ inquiryId: fake.inquiry.id, messages: fake.inquiry.messages, files: fake.inquiry.files }));
  return {
    inputFingerprint, idempotencyKey: `key-${status}`, status, modelProvider: "OpenAI", modelName: "test-model", promptVersion: "v1",
    conversationSummary: "A concise summary", watchCount: 1, watchCountConfidence: "HIGH", unresolvedPoints: ["serial unreadable"],
    ...(status === "FAILED" ? { errorMessage: "model timeout" } : {}),
    watches: [{ position: 1, label: "Watch 1", faults: ["stopped"], requestedWork: ["overhaul"], missingInformation: [], missingPhotos: [], candidates: [{ field: "BRAND", rank: 0, value: "Rolex", confidence: "HIGH", evidence: "dial text", observedText: "ROLEX", sourceType: "IMAGE_OBSERVED", sourceMessageIds: [11], sourceImageIds: [22] }] }],
  };
}

test("analysis write validates sources, maps nested rows, and updates COMPLETED Inquiry", async () => {
  const fake = createFakeDb();
  const result = await saveInquiryAiAnalysis(fake.db, 7, payload(fake));
  assert.equal(result.deduplicated, false);
  assert.equal(fake.analyses.length, 1);
  assert.equal(fake.analyses[0].watches[0].candidates[0].value, "Rolex");
  assert.deepEqual(fake.reviewWatches[0], {
    id: 1,
    inquiryId: 7,
    position: 1,
    sourceAiWatchId: 101,
    label: "Watch 1",
    summary: undefined,
    faults: ["stopped"],
    requestedWork: ["overhaul"],
    supplementalFacts: undefined,
    missingInformation: [],
    missingPhotos: [],
    fieldValues: [{ id: 1, field: "BRAND", value: "Rolex", source: "AI_CANDIDATE", sourceAiCandidateId: 1001 }],
  });
  assert.equal(fake.updates[0].status, "AI_PROCESSED");
  assert.equal(fake.updates[0].conversationSummary, "A concise summary");
  assert.deepEqual(fake.calls.slice(-7), ["lock-target", "advisory-lock", "final-context", "analysis-create", "review-watch-find", "review-watch-create", "inquiry-update"]);
});

test("reanalysis refreshes pending AI values but preserves confirmed values in one review draft", async () => {
  const fake = createFakeDb();
  await saveInquiryAiAnalysis(fake.db, 7, payload(fake));
  fake.reviewWatches[0].fieldValues[0].confirmationStatus = "CONFIRMED";
  const reanalysis = payload(fake);
  reanalysis.idempotencyKey = "key-reanalysis";
  reanalysis.watches[0].candidates[0].value = "OMEGA";
  await saveInquiryAiAnalysis(fake.db, 7, reanalysis);

  assert.equal(fake.reviewWatches.length, 1);
  assert.equal(fake.reviewWatches[0].sourceAiWatchId, 201);
  assert.equal(fake.reviewWatches[0].fieldValues[0].value, "Rolex");
  assert.equal(fake.reviewWatches[0].fieldValues[0].confirmationStatus, "CONFIRMED");
});

test("reanalysis preserves a pending manual value and accepts a Base Cal candidate", async () => {
  const fake = createFakeDb();
  const first = payload(fake);
  first.watches[0].candidates[0].field = "BASE_CALIBER";
  first.watches[0].candidates[0].value = "ETA 2892.A2";
  await saveInquiryAiAnalysis(fake.db, 7, first);
  assert.equal(fake.reviewWatches[0].fieldValues[0].field, "BASE_CALIBER");

  fake.reviewWatches[0].fieldValues[0].value = "ETA 2824-2";
  fake.reviewWatches[0].fieldValues[0].source = "MANUAL";
  fake.reviewWatches[0].fieldValues[0].confirmationStatus = "PENDING";
  const reanalysis = payload(fake);
  reanalysis.idempotencyKey = "key-manual-reanalysis";
  reanalysis.watches[0].candidates[0].field = "BASE_CALIBER";
  reanalysis.watches[0].candidates[0].value = "ETA 2892.A2";
  await saveInquiryAiAnalysis(fake.db, 7, reanalysis);

  assert.equal(fake.reviewWatches[0].fieldValues[0].value, "ETA 2824-2");
  assert.equal(fake.reviewWatches[0].fieldValues[0].source, "MANUAL");
  assert.equal(fake.reviewWatches[0].fieldValues[0].confirmationStatus, "PENDING");
});

test("AI analysis cannot claim human review or ungrounded provenance, and current summaries are required", async () => {
  const fake = createFakeDb();
  for (const candidatePatch of [
    { reviewStatus: "ACCEPTED" },
    { reviewStatus: "REJECTED" },
    { sourceType: "TECHNICIAN_CONFIRMED" },
    { sourceType: "CUSTOMER_STATED", sourceMessageIds: undefined },
    { sourceType: "IMAGE_OBSERVED", sourceImageIds: undefined },
  ]) {
    const invalid = payload(fake);
    Object.assign(invalid.watches[0].candidates[0], candidatePatch);
    await assert.rejects(() => saveInquiryAiAnalysis(fake.db, 7, invalid), InquiryAiAnalysisInputError);
  }
  const noSummary = { ...payload(fake), conversationSummary: "   " };
  await assert.rejects(() => saveInquiryAiAnalysis(fake.db, 7, noSummary), InquiryAiAnalysisInputError);
});

test("CUSTOMER_STATED candidates cannot cite only outbound messages", async () => {
  const fake = createFakeDb();
  fake.inquiry.messages.push({ id: 12, direction: "OUTBOUND", messageType: "TEXT", body: "reply", receivedAt: null, sentAt: new Date("2026-09-18T01:00:00.000Z"), status: "sent", createdAt: new Date("2026-09-18T01:00:00.000Z") } as any);
  const invalid = payload(fake);
  Object.assign(invalid.watches[0].candidates[0], { sourceType: "CUSTOMER_STATED", sourceMessageIds: [12], sourceImageIds: undefined });

  await assert.rejects(() => saveInquiryAiAnalysis(fake.db, 7, invalid), InquiryAiAnalysisInputError);
});

test("stale fingerprint and invalid source IDs write nothing", async () => {
  const fake = createFakeDb();
  const stale = payload(fake); stale.inputFingerprint = "stale";
  await assert.rejects(() => saveInquiryAiAnalysis(fake.db, 7, stale), InquiryAiAnalysisStaleError);
  const invalid = payload(fake); invalid.watches[0].candidates[0].sourceImageIds = [999];
  await assert.rejects(() => saveInquiryAiAnalysis(fake.db, 7, invalid), InquiryAiAnalysisInputError);
  assert.equal(fake.analyses.length, 0);
  assert.equal(fake.updates.length, 0);
});

test("idempotent retry creates no duplicate and status transitions preserve a FAILED summary", async () => {
  const fake = createFakeDb();
  const completed = payload(fake);
  await saveInquiryAiAnalysis(fake.db, 7, completed);
  const retry = await saveInquiryAiAnalysis(fake.db, 7, completed);
  assert.equal(retry.deduplicated, true);
  assert.equal(fake.analyses.length, 1);

  const review = payload(fake, "NEEDS_REVIEW"); review.idempotencyKey = "review";
  await saveInquiryAiAnalysis(fake.db, 7, review);
  assert.equal(fake.updates.at(-1).status, "NEEDS_REVIEW");
  const failed = { ...payload(fake, "FAILED"), idempotencyKey: "failed", conversationSummary: undefined };
  await saveInquiryAiAnalysis(fake.db, 7, failed);
  assert.equal(fake.updates.at(-1).status, "AI_PENDING");
  assert.equal("conversationSummary" in fake.updates.at(-1), false);
});
