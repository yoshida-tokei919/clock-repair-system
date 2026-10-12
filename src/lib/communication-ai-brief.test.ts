import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerCommunicationHub } from "./customer-communication-hub";
import {
  CommunicationAiInputError,
  CommunicationAiStaleError,
  communicationAiFingerprint,
  getLatestCommunicationAiBrief,
  parseCommunicationAiBrief,
  getRepairCommunicationAiContext,
  resolveCustomerCommunicationAiContext,
  resolveRepairCommunicationAiContext,
  saveCommunicationAiBrief,
} from "./communication-ai-brief";

const fingerprint = "a".repeat(64);

function briefInput(overrides: Record<string, unknown> = {}) {
  return {
    targetType: "REPAIR",
    targetId: 10,
    inputFingerprint: fingerprint,
    modelProvider: "OpenAI",
    modelName: "test-model",
    promptVersion: "task206g1-v1",
    summary: "Current repair summary",
    unresolvedItems: ["Confirm dial color"],
    customerRequirements: ["Keep original crown"],
    decisions: ["Order part after approval"],
    replyDraft: "Thank you. I will confirm the part availability.",
    ...overrides,
  };
}

test("AI brief input requires a target, source fingerprint, and at least one output", () => {
  assert.throws(() => parseCommunicationAiBrief({}), CommunicationAiInputError);
  assert.throws(() => parseCommunicationAiBrief({
    targetType: "CUSTOMER", targetId: 1, inputFingerprint: fingerprint,
    modelProvider: "OpenAI", modelName: "test", promptVersion: "v1",
  }), CommunicationAiInputError);
  assert.throws(() => parseCommunicationAiBrief(briefInput({ replyDraft: "x".repeat(5001) })), CommunicationAiInputError);
  const parsed = parseCommunicationAiBrief(briefInput());
  assert.equal(parsed.targetType, "REPAIR");
  assert.equal(parsed.replyDraft, "Thank you. I will confirm the part availability.");
});

function customerHub(sendableIds = [5]): any {
  return {
    customer: { id: 7 }, inquirySummaries: [], messages: [{
      id: 1, inquiryId: 2, inquiryStatus: "OPEN", direction: "INBOUND", messageType: "TEXT",
      body: "Same text", occurredAt: new Date("2026-10-01T00:00:00Z"), files: [],
      classification: null, postIntakeRouting: null,
    }], pendingOutboxes: [], hasEarlierMessages: false, hasEarlierInquirySummaries: false, routingRevision: "first", summaryHistoryRevision: "first", pendingOutboxRevision: "empty", destinationRevision: sendableIds.join(","),
    destinations: sendableIds.map((lineUserId) => ({ lineUserId, sendAvailable: true })),
  };
}

test("Customer fingerprint changes on classification, routing, and sendable destination changes", () => {
  const hub = customerHub();
  const first = resolveCustomerCommunicationAiContext(7, hub);
  const classified = resolveCustomerCommunicationAiContext(7, {
    ...hub, messages: [{ ...hub.messages[0], classification: {
      scope: "WATCHES", source: "MANUAL", confidence: null, confirmedAt: new Date("2026-10-02T00:00:00Z"),
      watchIds: [3], repairIds: [10],
    } }],
  });
  const routed = resolveCustomerCommunicationAiContext(7, {
    ...hub, messages: [{ ...hub.messages[0], postIntakeRouting: {
      source: "MANUAL", confidence: null, hasGeneralContent: false, hasUnassignedContent: false,
      confirmedAt: new Date("2026-10-02T00:00:00Z"), repairIds: [10],
    } }],
  });
  const olderRouting = resolveCustomerCommunicationAiContext(7, { ...hub, routingRevision: "changed" });
  const multiple = resolveCustomerCommunicationAiContext(7, customerHub([5, 6]));
  const differentSoleDestination = resolveCustomerCommunicationAiContext(7, customerHub([6]));
  for (const changed of [classified, routed, olderRouting, multiple, differentSoleDestination]) {
    assert.notEqual(first.inputFingerprint, changed.inputFingerprint);
  }
  assert.equal(first.replyDraftAllowed, true);
  assert.equal(multiple.replyDraftAllowed, false);
  assert.equal(multiple.context.sendableDestinationCount, 2);
  assert.equal(JSON.stringify(multiple.context).includes("lineUserId"), false);
  assert.equal(JSON.stringify(multiple.context).includes("externalMessageId"), false);
  assert.equal("routingRevision" in first.context, false);
  assert.deepEqual(first.context, olderRouting.context);
});

test("Customer pending outbox identity and state change freshness without exposing row IDs", () => {
  const hub = customerHub();
  const outbox = { id: 41, text: "same reply", status: "APPROVED", approvedAt: new Date("2026-10-01T00:00:00Z") };
  const first = resolveCustomerCommunicationAiContext(7, { ...hub, pendingOutboxes: [outbox], pendingOutboxRevision: "row-41-approved" });
  const replaced = resolveCustomerCommunicationAiContext(7, { ...hub, pendingOutboxes: [{ ...outbox, id: 42 }], pendingOutboxRevision: "row-42-approved" });
  const claimed = resolveCustomerCommunicationAiContext(7, { ...hub, pendingOutboxes: [{ ...outbox, status: "CLAIMED" }], pendingOutboxRevision: "row-41-claimed" });
  assert.deepEqual(first.context.pendingOutboxes, replaced.context.pendingOutboxes);
  assert.deepEqual(first.context.pendingOutboxes, [{ text: "same reply", status: "APPROVED", approvedAt: "2026-10-01T00:00:00.000Z" }]);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  assert.notEqual(first.inputFingerprint, claimed.inputFingerprint);
  assert.equal(JSON.stringify(first.context).includes("sendId"), false);
});

test("Repair fingerprint changes on a new unrouted customer message", async () => {
  let newestId = 21;
  const db: any = { inquiry: { findUnique: async () => ({ lineUser: { linkedCustomerId: 7, lineManagerChat: null } }) }, lineManagerSendOutbox: { findMany: async () => [] }, inquiryMessage: { findMany: async () => [], findFirst: async ({ where, select }: any) => {
    assert.deepEqual(where, {
      lineUser: { linkedCustomerId: 7 }, inquiry: { lineUser: { linkedCustomerId: 7 } },
    });
    assert.deepEqual(select, { id: true });
    return { id: newestId };
  } } };
  const chat: any = {
    customerId: 7, sourceInquiryId: 2, promotedAt: null, originAiSummary: null,
    messages: [], pendingOutboxes: [], hasEarlierMessages: false, sendAvailable: true,
  };
  const before = await getRepairCommunicationAiContext(db, 10, chat);
  newestId = 22; // New inbound is still unclassified, so the Repair projection is unchanged.
  const after = await getRepairCommunicationAiContext(db, 10, chat);
  assert.notEqual(before.inputFingerprint, after.inputFingerprint);
  assert.equal(after.context.customerCommunicationWatermark, 22);
  assert.deepEqual(after.context.messages, []);
});

test("an old Repair routing change stales an unchanged 200-message projection and watermark", async () => {
  let oldRepairIds = [10];
  const db: any = { inquiry: { findUnique: async () => ({ lineUser: { linkedCustomerId: 7, lineManagerChat: null } }) }, lineManagerSendOutbox: { findMany: async () => [] }, inquiryMessage: {
    findFirst: async () => ({ id: 999 }),
    findMany: async () => [{
      id: 1, classification: null,
      postIntakeRouting: { customerId: 7, source: "MANUAL", confidence: null,
        hasGeneralContent: false, hasUnassignedContent: false, confirmedAt: null,
        repairLinks: oldRepairIds.map((repairId) => ({ repairId })) },
    }],
  } };
  const chat: any = { customerId: 7, sourceInquiryId: 2, promotedAt: null,
    originAiSummary: null, messages: Array.from({ length: 200 }, (_, index) => ({
      id: 800 + index, inquiryId: 2, direction: "INBOUND", messageType: "TEXT", body: "same",
      receivedAt: null, sentAt: null, createdAt: new Date("2026-10-01T00:00:00Z"),
      status: "received", editable: false, relatedRepairIds: [10], classification: null, files: [],
    })), pendingOutboxes: [], hasEarlierMessages: true, sendAvailable: true };
  const before = await getRepairCommunicationAiContext(db, 10, chat);
  oldRepairIds = [];
  const after = await getRepairCommunicationAiContext(db, 10, chat);
  assert.equal(before.context.customerCommunicationWatermark, after.context.customerCommunicationWatermark);
  assert.deepEqual(before.context.messages, after.context.messages);
  assert.equal("routingRevision" in before.context, false);
  assert.notEqual(before.inputFingerprint, after.inputFingerprint);
});

test("Repair pending outbox identity and state change freshness without exposing row IDs", () => {
  const chat: any = { customerId: 7, sourceInquiryId: 2, promotedAt: null, originAiSummary: null,
    messages: [], hasEarlierMessages: false, sendAvailable: true,
    pendingOutboxes: [{ id: 51, text: "same reply", status: "APPROVED", approvedAt: new Date("2026-10-01T00:00:00Z"), relatedRepairIds: [10] }],
  };
  const first = resolveRepairCommunicationAiContext(10, chat, null, "", undefined, "row-51-approved");
  const replaced = resolveRepairCommunicationAiContext(10, { ...chat, pendingOutboxes: [{ ...chat.pendingOutboxes[0], id: 52 }] }, null, "", undefined, "row-52-approved");
  const claimed = resolveRepairCommunicationAiContext(10, { ...chat, pendingOutboxes: [{ ...chat.pendingOutboxes[0], status: "CLAIMED" }] }, null, "", undefined, "row-51-claimed");
  assert.deepEqual(first.context.pendingOutboxes, replaced.context.pendingOutboxes);
  assert.equal("id" in first.context.pendingOutboxes[0], false);
  assert.equal("sendId" in first.context.pendingOutboxes[0], false);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  assert.notEqual(first.inputFingerprint, claimed.inputFingerprint);
});

test("Repair mapping replacement, loss, and recovery change freshness and reply eligibility", async () => {
  const originalMapping = { id: 300030,
    evidenceInquiryMessageId: 210021,
    verifiedAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") };
  let mapping: typeof originalMapping | null = originalMapping;
  const db: any = { inquiry: { findUnique: async ({ select }: any) => {
    assert.deepEqual(select.lineUser.select.lineManagerChat.select, {
      id: true, evidenceInquiryMessageId: true, verifiedAt: true, updatedAt: true,
    });
    return { lineUser: { linkedCustomerId: 7, lineManagerChat: mapping } };
  } },
    inquiryMessage: { findFirst: async () => ({ id: 22 }), findMany: async () => [] }, lineManagerSendOutbox: { findMany: async () => [] } };
  const chat: any = { customerId: 7, sourceInquiryId: 2, promotedAt: null, originAiSummary: null,
    messages: [], pendingOutboxes: [], hasEarlierMessages: false, sendAvailable: true,
    mappingVerifiedAt: originalMapping.verifiedAt };
  const first = await getRepairCommunicationAiContext(db, 10, chat);
  mapping = { ...originalMapping, updatedAt: new Date("2026-10-02T00:00:00Z") };
  const updated = await getRepairCommunicationAiContext(db, 10, chat);
  mapping = { ...originalMapping, id: 300031 };
  const replaced = await getRepairCommunicationAiContext(db, 10, chat);
  mapping = null;
  const lost = await getRepairCommunicationAiContext(db, 10, { ...chat, sendAvailable: false });
  mapping = { ...originalMapping, id: 300031 };
  const recovered = await getRepairCommunicationAiContext(db, 10, chat);
  assert.notEqual(first.inputFingerprint, updated.inputFingerprint);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  assert.notEqual(replaced.inputFingerprint, lost.inputFingerprint);
  assert.notEqual(lost.inputFingerprint, recovered.inputFingerprint);
  assert.equal(lost.replyDraftAllowed, false);
  assert.equal(recovered.replyDraftAllowed, true);
  assert.equal(replaced.replyDraftAllowed, true);
  assert.deepEqual(first.context, replaced.context);
  assert.equal(first.context.customerCommunicationWatermark, replaced.context.customerCommunicationWatermark);
  const visible = JSON.stringify(replaced.context);
  for (const forbidden of ["repairDestinationRevision", "destinationRevision", "routingRevision", "managerBotId", "managerChatId", "evidenceInquiryMessageId", "300031", "210021"]) {
    assert.equal(visible.includes(forbidden), false, forbidden);
  }
});

test("recreated verified mapping for the same LINE user changes Customer fingerprint without exposing its identity", async () => {
  let mappingId = 30;
  const db: any = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: {
      id: mappingId, evidenceInquiryMessageId: 21, verifiedAt: new Date("2026-10-01T00:00:00Z"),
    } }] },
    inquiry: { findFirst: async () => ({ id: 2 }), findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  };
  const first = resolveCustomerCommunicationAiContext(7, (await getCustomerCommunicationHub(db, 7))!);
  mappingId = 31;
  const replaced = resolveCustomerCommunicationAiContext(7, (await getCustomerCommunicationHub(db, 7))!);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  assert.equal(first.replyDraftAllowed, true);
  assert.equal(replaced.replyDraftAllowed, true);
  const context = JSON.stringify(replaced.context);
  for (const forbidden of ["mappingId", "evidenceInquiryMessageId", "lineUserId", "managerChatId", "managerBotId", "destinationRevision"]) {
    assert.equal(context.includes(forbidden), false, forbidden);
  }
});

test("Customer reply draft save requires exactly one sendable destination", async () => {
  const rows: any[] = [];
  const db: any = { communicationAiBrief: {
    findUnique: async () => null,
    create: async ({ data }: any) => { rows.push(data); return { id: 1, ...data }; },
  } };
  const input = briefInput({ targetType: "CUSTOMER", targetId: 7 });
  const ambiguous: any = { targetType: "CUSTOMER", targetId: 7, customerId: 7, inputFingerprint: fingerprint, replyDraftAllowed: false, context: {} };
  await assert.rejects(saveCommunicationAiBrief(db, input, async () => ambiguous), CommunicationAiInputError);
  assert.equal(rows.length, 0);
  await saveCommunicationAiBrief(db, { ...input, replyDraft: null }, async () => ambiguous);
  assert.equal(rows.length, 1);
  const sole = { ...ambiguous, replyDraftAllowed: true };
  await saveCommunicationAiBrief(db, input, async () => sole);
  assert.equal(rows.length, 2);
});

test("communication fingerprints are deterministic and change with visible context", () => {
  const first = communicationAiFingerprint({ messages: [{ id: 1, body: "A" }] });
  assert.equal(first, communicationAiFingerprint({ messages: [{ id: 1, body: "A" }] }));
  assert.notEqual(first, communicationAiFingerprint({ messages: [{ id: 1, body: "B" }] }));
});

test("Repair context fingerprint includes its safe origin summary and related message projection", () => {
  const chat: any = {
    customerId: 7,
    sourceInquiryId: 2,
    promotedAt: new Date("2026-10-01T00:00:00Z"),
    originAiSummary: {
      inquiryId: 2,
      status: "CLOSED",
      summary: "Original inquiry summary",
      firstReceivedAt: new Date("2026-09-30T00:00:00Z"),
      lastReceivedAt: new Date("2026-10-01T00:00:00Z"),
      analysisCompletedAt: new Date("2026-09-30T12:00:00Z"),
    },
    messages: [{
      id: 11, inquiryId: 3, direction: "INBOUND", messageType: "TEXT", body: "New message",
      receivedAt: new Date("2026-10-02T00:00:00Z"), sentAt: null, createdAt: new Date("2026-10-02T00:00:00Z"),
      status: "received", editable: false, relatedRepairIds: [10], classification: null, files: [],
    }],
    pendingOutboxes: [],
    hasEarlierMessages: false,
  };
  const first = resolveRepairCommunicationAiContext(10, chat);
  const changed = resolveRepairCommunicationAiContext(10, {
    ...chat,
    messages: [{ ...chat.messages[0], body: "Changed message" }],
  });
  assert.equal(first.customerId, 7);
  assert.equal(first.context.originAiSummary?.inquiryId, 2);
  assert.notEqual(first.inputFingerprint, changed.inputFingerprint);
  const serialized = JSON.stringify(first.context);
  for (const forbidden of ["managerBotId", "managerChatId", "signedUrl", "objectKey", "N8N_INTERNAL_TOKEN"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("saving is immutable, rejects stale context, and exact retries deduplicate", async () => {
  const rows: any[] = [];
  const store = {
    findUnique: async ({ where }: any) => rows.find((row) => row.dedupeKey === where.dedupeKey) ?? null,
    create: async ({ data }: any) => {
      const row = { id: rows.length + 1, createdAt: new Date("2026-10-12T00:00:00Z"), ...data };
      rows.push(row);
      return row;
    },
  };
  const db: any = { communicationAiBrief: store };
  const context: any = {
    targetType: "REPAIR" as const,
    targetId: 10,
    customerId: 7,
    inputFingerprint: fingerprint,
    context: {},
  };
  const resolve = async () => context;

  const first = await saveCommunicationAiBrief(db, briefInput(), resolve);
  assert.equal(first.deduplicated, false);
  assert.equal(first.stale, false);
  assert.equal(first.brief.customerId, 7);
  assert.equal(first.brief.repairId, 10);
  assert.equal(rows.length, 1);

  const retry = await saveCommunicationAiBrief(db, briefInput(), resolve);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.stale, false);
  assert.equal(retry.brief.id, first.brief.id);
  assert.equal(rows.length, 1);

  await assert.rejects(
    saveCommunicationAiBrief(db, briefInput({ replyDraft: "A newer proposal" }), async () => ({ ...context, inputFingerprint: "b".repeat(64) })),
    CommunicationAiStaleError,
  );
  assert.equal(rows.length, 1);
});



test("save reports stale when communication changes during persistence", async () => {
  const rows: any[] = [];
  const db: any = { communicationAiBrief: {
    findUnique: async () => null,
    create: async ({ data }: any) => {
      const row = { id: 1, createdAt: new Date("2026-10-12T00:00:00Z"), ...data };
      rows.push(row);
      return row;
    },
  } };
  let calls = 0;
  const result = await saveCommunicationAiBrief(db, briefInput(), async () => {
    calls += 1;
    return {
      targetType: "REPAIR", targetId: 10, customerId: 7,
      inputFingerprint: calls === 1 ? fingerprint : "b".repeat(64),
      context: {},
    } as any;
  });
  assert.equal(rows.length, 1);
  assert.equal(result.stale, true);
  assert.equal(calls, 2);
});

test("latest brief is marked stale instead of being silently treated as current", async () => {
  const db: any = {
    communicationAiBrief: {
      findFirst: async () => ({
        id: 3,
        inputFingerprint: "b".repeat(64),
        modelProvider: "OpenAI",
        modelName: "test-model",
        promptVersion: "v1",
        summary: "Old summary",
        unresolvedItems: [],
        customerRequirements: [],
        decisions: [],
        replyDraft: "Old reply",
        createdAt: new Date("2026-10-11T00:00:00Z"),
      }),
    },
  };
  const latest = await getLatestCommunicationAiBrief(db, { targetType: "REPAIR", targetId: 10 }, {
    targetType: "REPAIR", targetId: 10, customerId: 7, inputFingerprint: fingerprint, context: {}, replyDraftAllowed: true,
  } as any);
  assert.equal(latest?.stale, true);
  assert.equal(latest?.replyDraft, "Old reply");
});

test("exact dedupe retry reports stale when context changes during its lookup", async () => {
  let calls = 0;
  const existing: any = { id: 4, customerId: 7, repairId: 10, inputFingerprint: fingerprint };
  const db: any = { communicationAiBrief: {
    findUnique: async () => existing,
    create: async () => { throw new Error("dedupe must not create"); },
  } };
  const result = await saveCommunicationAiBrief(db, briefInput(), async () => {
    calls++;
    return { targetType: "REPAIR", targetId: 10, customerId: 7,
      inputFingerprint: calls === 1 ? fingerprint : "b".repeat(64), context: {} } as any;
  });
  assert.equal(calls, 2);
  assert.equal(result.brief, existing);
  assert.equal(result.deduplicated, true);
  assert.equal(result.stale, true);
});

test("an existing Customer draft is hidden when destinations become ambiguous", async () => {
  const db: any = { communicationAiBrief: { findFirst: async () => ({
    id: 1, inputFingerprint: fingerprint, modelProvider: "test", modelName: "test", promptVersion: "v1",
    summary: "Still useful", unresolvedItems: [], customerRequirements: [], decisions: [],
    replyDraft: "Do not offer this draft", createdAt: new Date("2026-10-12T00:00:00Z"),
  }) } };
  const latest = await getLatestCommunicationAiBrief(db, { targetType: "CUSTOMER", targetId: 7 }, {
    targetType: "CUSTOMER", targetId: 7, customerId: 7, inputFingerprint: fingerprint,
    context: {}, replyDraftAllowed: false,
  } as any);
  assert.equal(latest?.summary, "Still useful");
  assert.equal(latest?.replyDraft, null);
});
