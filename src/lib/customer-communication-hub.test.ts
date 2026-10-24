import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerCommunicationHub, occurredAt, type CustomerCommunicationDb } from "./customer-communication-hub";
import { resolveCustomerCommunicationAiContext } from "./communication-ai-brief";
import { getCustomerSummaryHistoryRevision } from "./communication-summary-revision";

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
      return [{ id: 1, displayName: "A", lineManagerChat: null }, { id: 2, displayName: "B", lineManagerChat: null }];
    } },
    inquiry: { findMany: async (query: any) => { queries.push(query); return [
      { id: 20, status: "OPEN", conversationSummary: "Current summary", firstReceivedAt: date("2026-01-01T00:00:00Z"), lastReceivedAt: date("2026-01-03T00:00:00Z"), analyses: [{ completedAt: date("2026-01-02T12:00:00Z"), createdAt: date("2026-01-02T11:59:00Z") }] },
      { id: 10, status: "CLOSED", conversationSummary: "Older summary", firstReceivedAt: date("2025-12-01T00:00:00Z"), lastReceivedAt: date("2025-12-03T00:00:00Z"), analyses: [{ completedAt: null, createdAt: date("2025-12-02T12:00:00Z") }] },
    ]; } },
    inquiryMessage: { findMany: async (query: any) => {
      queries.push(query);
      if (query.take !== 501) return [];
      return rows.filter((row) => row.direction === query.where.direction &&
        (row.direction === "INBOUND" ? (row.receivedAt !== null) === (query.where.receivedAt !== null) :
          (row.sentAt !== null) === (query.where.sentAt !== null)));
    } },
    lineManagerObservedOutbound: { findMany: async (query: any) => { queries.push(query); return []; } },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;

  const hub = await getCustomerCommunicationHub(db, 7);
  assert.equal(hub?.customer.type, "business");
  assert.equal(hub?.lineUsers.length, 2);
  assert.equal(hub?.messages.length, 500);
  assert.equal(hub?.hasEarlierMessages, true);
  assert.equal(hub?.messages.some((message) => message.id === 2), false);
  assert.equal(hub?.messages[0].id, 4);
  assert.equal(hub?.messages[0].channel, "LINE");
  assert.equal(hub?.messages[1].id, 6);
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
    direction: "INBOUND", receivedAt: { not: null },
  });
  assert.equal(queries[1].take, 501);
  assert.deepEqual(queries[1].orderBy, [{ receivedAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(queries[2].orderBy, [{ sentAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(queries[3].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(queries[4].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(hub?.inquirySummaries.map((item) => [item.inquiryId, item.status, item.summary, item.analysisCompletedAt?.toISOString()]), [
    [20, "OPEN", "Current summary", "2026-01-02T12:00:00.000Z"],
    [10, "CLOSED", "Older summary", "2025-12-02T12:00:00.000Z"],
  ]);
  assert.equal(hub?.hasEarlierInquirySummaries, false);
  assert.equal(queries.length, 9);
  assert.equal(queries[7].take, 200);
  assert.equal(queries[6].take, 21);
  assert.equal(queries[8].take, 200);
  assert.equal(typeof hub?.routingRevision, "string");
});

test("legacy Inquiry summaries show only the newest 20 and flag earlier history", async () => {
  const summaries = Array.from({ length: 26 }, (_, index) => ({
    id: index + 1, status: "OPEN", conversationSummary: `summary ${index + 1}`,
    firstReceivedAt: date("2026-01-01T00:00:00Z"), lastReceivedAt: date(`2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
    analyses: [{ id: index + 1, status: "COMPLETED", conversationSummary: `summary ${index + 1}`,
      createdAt: date("2026-01-01T00:00:00Z"), completedAt: date("2026-01-01T00:00:00Z"), updatedAt: date("2026-01-01T00:00:00Z") }],
  }));
  const queries: any[] = [];
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: null }] },
    inquiry: { findMany: async (query: any) => {
      queries.push(query);
      return query.take === 21 ? [...summaries].reverse().slice(0, query.take) : summaries;
    } },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const first = (await getCustomerCommunicationHub(db, 7))!;
  assert.equal(first.inquirySummaries.length, 20);
  assert.equal(first.inquirySummaries[0].inquiryId, 26);
  assert.equal(first.inquirySummaries.at(-1)?.inquiryId, 7);
  assert.equal(first.hasEarlierInquirySummaries, true);
  assert.equal(queries[0].take, 21);
  assert.deepEqual(queries[0].orderBy, [{ lastReceivedAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(queries[0].where.lineUser, { linkedCustomerId: 7 });
  assert.equal(queries[0].select.analyses.take, 1);

  const original = resolveCustomerCommunicationAiContext(7, first);
  summaries[0].conversationSummary = "edited old summary";
  const edited = resolveCustomerCommunicationAiContext(7, (await getCustomerCommunicationHub(db, 7))!);
  assert.notEqual(original.inputFingerprint, edited.inputFingerprint);
  assert.deepEqual(original.context.inquirySummaries, edited.context.inquirySummaries);
  assert.equal(JSON.stringify(edited.context).includes("edited old summary"), false);
  summaries[0].analyses[0].updatedAt = date("2026-02-01T00:00:00Z");
  const changedProvenance = resolveCustomerCommunicationAiContext(7, (await getCustomerCommunicationHub(db, 7))!);
  assert.notEqual(edited.inputFingerprint, changedProvenance.inputFingerprint);
  assert.equal(JSON.stringify(changedProvenance.context).includes("summaryHistoryRevision"), false);
});

test("summary-history revision uses Customer-filtered deterministic ID keyset pages", async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({
    id: index + 1, customerId: 7, status: "OPEN", conversationSummary: `summary ${index + 1}`,
    firstReceivedAt: date("2026-01-01T00:00:00Z"), lastReceivedAt: date("2026-01-02T00:00:00Z"), analyses: [],
  }));
  rows.push({ ...rows[0], id: 206, customerId: 8, conversationSummary: "other Customer" });
  const queries: any[] = [];
  const db: any = { inquiry: { findMany: async (query: any) => {
    queries.push(query);
    return rows.filter((row) => row.customerId === query.where.lineUser.linkedCustomerId && row.id > query.where.id.gt)
      .sort((a, b) => a.id - b.id).slice(0, query.take);
  } } };
  const first = await getCustomerSummaryHistoryRevision(db, 7);
  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map((query) => query.where.id.gt), [0, 200]);
  for (const query of queries) {
    assert.equal(query.take, 200);
    assert.deepEqual(query.orderBy, { id: "asc" });
    assert.deepEqual(query.where.lineUser, { linkedCustomerId: 7 });
    assert.deepEqual(query.where.conversationSummary, { not: null });
    assert.equal(query.select.analyses.take, 1);
    assert.deepEqual(query.select.analyses.where, { status: { not: "FAILED" } });
    assert.deepEqual(query.select.analyses.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  }
  rows.reverse();
  assert.equal(await getCustomerSummaryHistoryRevision(db, 7), first);
  rows.find((row) => row.id === 206)!.conversationSummary = "changed other Customer";
  assert.equal(await getCustomerSummaryHistoryRevision(db, 7), first);
  rows.find((row) => row.id === 1)!.conversationSummary = "changed old summary";
  assert.notEqual(await getCustomerSummaryHistoryRevision(db, 7), first);
});

test("missing customer returns null; customer without linked LINE users has an empty history", async () => {
  let messageQueries = 0;
  const db = {
    customer: { findUnique: async ({ where }: any) => where.id === 2
      ? { id: 2, type: "individual", name: "Customer", companyName: null } : null },
    lineUser: { findMany: async () => [] },
    inquiryMessage: { findMany: async () => { messageQueries++; return []; } },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  assert.equal(await getCustomerCommunicationHub(db, 1), null);
  const hub = await getCustomerCommunicationHub(db, 2);
  assert.deepEqual(hub?.messages, []);
  assert.equal(hub?.hasEarlierMessages, false);
  assert.equal(messageQueries, 0);
});

test("verified destinations include multiple linked users and only existing anchors are sendable", async () => {
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [
      { id: 5, displayName: "First", lineManagerChat: { verifiedAt: date("2026-01-01T00:00:00Z") } },
      { id: 6, displayName: null, lineManagerChat: { verifiedAt: date("2026-01-02T00:00:00Z") } },
      { id: 7, displayName: "Unverified", lineManagerChat: null },
    ] },
    inquiry: { findFirst: async ({ where }: any) => where.lineUserId === 5 ? { id: 1 } : null, findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const hub = await getCustomerCommunicationHub(db, 7);
  assert.deepEqual(hub?.destinations.map(({ lineUserId, label, sendAvailable }) => ({ lineUserId, label, sendAvailable })), [
    { lineUserId: 5, label: "First", sendAvailable: true },
    { lineUserId: 6, label: "LINEユーザー #6", sendAvailable: false },
  ]);
});

test("one verified linked user is the sole sendable destination", async () => {
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "First", lineManagerChat: { verifiedAt: date("2026-01-01T00:00:00Z") } }] },
    inquiry: { findFirst: async () => ({ id: 21 }), findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const hub = await getCustomerCommunicationHub(db, 7);
  assert.equal(hub?.destinations.length, 1);
  assert.equal(hub?.destinations[0].lineUserId, 5);
  assert.equal(hub?.destinations[0].sendAvailable, true);
});

test("pending projection checks both LINE user identities and excludes terminal statuses", async () => {
  let pendingQuery: any;
  const makeRow = (id: number, inquiryUserId: number, chatUserId: number, status = "APPROVED") => ({
    id, idempotencyKey: `customer-line-reply:7:${inquiryUserId}:key`, text: `reply ${id}`, status, approvedAt: date(`2026-01-0${id}T00:00:00Z`),
    inquiry: { lineUserId: inquiryUserId }, lineManagerChat: { lineUserId: chatUserId },
  });
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "business", name: "A", companyName: "A" }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: null }] },
    inquiry: { findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async (query: any) => {
      if (query.take === 20) pendingQuery = query;
      return [makeRow(1, 5, 5), makeRow(2, 5, 6), makeRow(3, 6, 6), makeRow(4, 5, 5, "POST_UNCONFIRMED"),
        { ...makeRow(5, 5, 5), idempotencyKey: "customer-line-reply:7:6:key" }];
    } },
  } as unknown as CustomerCommunicationDb;
  const hub = await getCustomerCommunicationHub(db, 7);
  assert.deepEqual(hub?.pendingOutboxes.map((row) => row.id), [1, 4]);
  assert.equal(pendingQuery.where.idempotencyKey.startsWith, "customer-line-reply:7:");
  assert.deepEqual(pendingQuery.where.status.in, ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"]);
  assert.deepEqual(pendingQuery.orderBy, [{ approvedAt: "desc" }, { id: "desc" }]);
  assert.equal(pendingQuery.take, 20);
  assert.deepEqual(pendingQuery.where.inquiry.lineUser, { linkedCustomerId: 7 });
  assert.deepEqual(pendingQuery.where.lineManagerChat.lineUser, { linkedCustomerId: 7 });
});

test("adding or removing a routing association older than the visible 500 changes Customer revision", async () => {
  let repairIds = [10];
  const visibleRows = Array.from({ length: 501 }, (_, index) => ({
    id: 501 - index, inquiryId: 2, lineUserId: 5, direction: "INBOUND", messageType: "TEXT",
    body: "unchanged", receivedAt: null, sentAt: null, createdAt: date("2026-01-01T00:00:00Z"),
    inquiry: { status: "OPEN", lineUserId: 5 }, files: [], classification: null, postIntakeRouting: null,
  }));
  const routingRow = () => ({
    id: 1,
    classification: {
      scope: "WATCHES", source: "MANUAL", confidence: null, confirmedAt: date("2026-01-01T00:00:00Z"),
      watchLinks: [{ inquiryWatchId: 3 }],
      repairLinks: repairIds.map((repairId) => ({ repairId, repair: { customerId: 7 } })),
    },
    postIntakeRouting: null,
  });
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: null }] },
    inquiry: { findMany: async () => [] },
    inquiryMessage: { findMany: async (query: any) => query.take === 501
      ? query.where.direction === "INBOUND" && query.where.receivedAt === null ? visibleRows : []
      : [routingRow()] },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const first = await getCustomerCommunicationHub(db, 7);
  repairIds = [];
  const second = await getCustomerCommunicationHub(db, 7);
  assert.notEqual(first?.routingRevision, second?.routingRevision);
  assert.deepEqual(first?.messages, second?.messages);
  assert.equal(first?.messages.length, 500);
  assert.equal(first?.messages.some((message) => message.id === 1), false);
  repairIds = [11];
  const third = await getCustomerCommunicationHub(db, 7);
  assert.notEqual(second?.routingRevision, third?.routingRevision);
});

test("observed Manager history is customer scoped, inquiry free, and suppresses only the exact confirmed source", async () => {
  const when = date("2026-10-24T04:00:00Z");
  const chat = (lineUserId: number, bot: string) => ({ id: lineUserId, lineUserId, managerBotId: bot,
    managerChatId: `chat-${lineUserId}`, verifiedAt: when, evidenceInquiryMessageId: 1, updatedAt: when });
  const observed = (id: number, lineUserId: number, bot: string, externalMessageId: string) => ({
    id, lineUserId, lineManagerChatId: lineUserId, managerBotIdSnapshot: bot,
    managerChatIdSnapshot: `chat-${lineUserId}`, externalMessageId, messageType: "TEXT", body: `observed ${id}`,
    sentAt: date(`2026-10-24T04:0${id}:00Z`), verifiedAt: when, sourceKind: "LINE_MANAGER_HISTORY",
    lineManagerChat: chat(lineUserId, bot),
  });
  const queries: any[] = [];
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [
      { id: 5, displayName: "A", lineManagerChat: chat(5, "bot-a") },
      { id: 6, displayName: "B", lineManagerChat: chat(6, "bot-b") },
    ] },
    inquiry: { findFirst: async () => null, findMany: async () => [] },
    inquiryMessage: { findMany: async (query: any) => {
      return query.where.direction === "OUTBOUND" && query.where.sentAt?.not === null
        ? [{ id: 10, externalMessageId: "duplicate", inquiryId: 100, lineUserId: 5,
        direction: "OUTBOUND", messageType: "TEXT", body: "confirmed", receivedAt: null,
        sentAt: when, createdAt: when, inquiry: { status: "OPEN", lineUserId: 5 }, files: [],
        classification: null, postIntakeRouting: null }] : [];
    } },
    lineManagerObservedOutbound: { findMany: async (query: any) => {
      queries.push(query);
      return [observed(1, 5, "bot-a", "duplicate"), observed(2, 6, "bot-b", "duplicate"),
        observed(3, 5, "bot-a", "unique"),
        { ...observed(4, 5, "bot-a", "stale"), managerChatIdSnapshot: "old-chat" },
        { ...observed(5, 99, "bot-a", "foreign"), lineManagerChat: chat(99, "bot-a") }];
    } },
    lineManagerSendOutbox: { findMany: async (query: any) => {
      if (query.where.status !== "CONFIRMED") return [];
      queries.push(query);
      return [{ managerBotIdSnapshot: "bot-a", confirmedManagerMessageId: "duplicate",
        inquiry: { lineUserId: 5 }, confirmedInquiryMessage: { externalMessageId: "duplicate", lineUserId: 5 } }];
    } },
  } as unknown as CustomerCommunicationDb;
  const hub = (await getCustomerCommunicationHub(db, 7))!;
  assert.deepEqual(hub.messages.map((message) => [message.sourceKind, message.id, message.inquiryId]), [
    ["INQUIRY_MESSAGE", 10, 100], ["LINE_MANAGER_HISTORY", 2, null], ["LINE_MANAGER_HISTORY", 3, null],
  ]);
  assert.equal(hub.messages[1].classification, null);
  assert.equal(hub.messages[1].files.length, 0);
  assert.equal(hub.messages[1].sourceKind === "LINE_MANAGER_HISTORY" && hub.messages[1].verifiedAt.toISOString(), when.toISOString());
  assert.deepEqual(queries[0].where.lineUser, { linkedCustomerId: 7 });
  assert.deepEqual(queries[0].where.lineManagerChat.lineUser, { linkedCustomerId: 7 });
  assert.equal(queries[1].where.status, "CONFIRMED");
  assert.equal(queries[1].where.confirmedInquiryMessage.is.status, "sent");
  assert.deepEqual(queries[1].where.confirmedInquiryMessage.is.inquiry.lineUser, { linkedCustomerId: 7 });
  const fingerprint = resolveCustomerCommunicationAiContext(7, hub);
  assert.equal(fingerprint.context.messages[1].sourceKind, "LINE_MANAGER_HISTORY");
  assert.equal(fingerprint.context.messages[1].verifiedAt, when.toISOString());
});

test("observed rows share the 500 message cap and flag truncated history", async () => {
  const base = date("2026-10-24T00:00:00Z");
  const chat = { id: 5, lineUserId: 5, managerBotId: "bot", managerChatId: "chat", verifiedAt: base,
    evidenceInquiryMessageId: 1, updatedAt: base };
  const rows = Array.from({ length: 501 }, (_, index) => ({
    id: index + 1, lineUserId: 5, lineManagerChatId: 5, managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat",
    externalMessageId: `manager-${index + 1}`, messageType: "TEXT", body: "text", sourceKind: "LINE_MANAGER_HISTORY",
    sentAt: new Date(base.getTime() + index * 1000), verifiedAt: base, lineManagerChat: chat,
  })).reverse();
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: chat }] },
    inquiry: { findFirst: async () => null, findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => rows },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const hub = (await getCustomerCommunicationHub(db, 7))!;
  assert.equal(hub.messages.length, 500);
  assert.equal(hub.hasEarlierMessages, true);
  assert.equal(hub.messages[0].id, 2);
  assert.equal(hub.messages.at(-1)?.id, 501);
});

test("bot change with a colliding provider ID does not suppress a different bot's observation", async () => {
  const when = date("2026-10-24T00:00:00Z");
  const chat = { id: 1, lineUserId: 5, managerBotId: "new-bot", managerChatId: "new-chat", verifiedAt: when,
    evidenceInquiryMessageId: 20, updatedAt: when };
  let confirmedBot: string | null = "old-bot";
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: chat }] },
    inquiry: { findFirst: async () => null, findMany: async () => [] },
    inquiryMessage: { findMany: async () => [] },
    lineManagerObservedOutbound: { findMany: async () => [{
      id: 2, lineUserId: 5, lineManagerChatId: 1, managerBotIdSnapshot: "new-bot",
      managerChatIdSnapshot: "new-chat", externalMessageId: "collision", messageType: "TEXT",
      body: "new bot event", sentAt: when, verifiedAt: when, sourceKind: "LINE_MANAGER_HISTORY",
      lineManagerChat: chat,
    }] },
    lineManagerSendOutbox: { findMany: async (query: any) => query.where.status === "CONFIRMED" && confirmedBot ? [{
      managerBotIdSnapshot: confirmedBot, confirmedManagerMessageId: "collision",
      inquiry: { lineUserId: 5 }, confirmedInquiryMessage: { lineUserId: 5, externalMessageId: "collision" },
    }] : [] },
  } as unknown as CustomerCommunicationDb;
  const collision = (await getCustomerCommunicationHub(db, 7))!;
  assert.deepEqual(collision.messages.map((message) => message.id), [2]);
  confirmedBot = "new-bot";
  const exact = (await getCustomerCommunicationHub(db, 7))!;
  assert.deepEqual(exact.messages, []);
  confirmedBot = null;
  const noImmutableEvidence = (await getCustomerCommunicationHub(db, 7))!;
  assert.deepEqual(noImmutableEvidence.messages.map((message) => message.id), [2]);
});

test("late inserted old events cannot displace newer event times, including null-time fallback", async () => {
  const base = date("2026-01-01T00:00:00Z");
  const newTime = date("2026-10-24T00:00:00Z");
  const old = Array.from({ length: 501 }, (_, index) => ({
    id: index + 1, externalMessageId: `old-${index}`, inquiryId: 10, lineUserId: 5,
    direction: "INBOUND", messageType: "TEXT", body: "old", receivedAt: new Date(base.getTime() + index * 1000),
    sentAt: null, createdAt: new Date(newTime.getTime() + index * 1000),
    inquiry: { status: "OPEN", lineUserId: 5 }, files: [], classification: null, postIntakeRouting: null,
  }));
  const recent = { ...old[0], id: 900, externalMessageId: "recent", body: "recent", receivedAt: newTime, createdAt: base };
  const fallback = { ...old[0], id: 901, externalMessageId: "fallback", body: "fallback", receivedAt: null, createdAt: new Date(newTime.getTime() + 1000) };
  const db = {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: null }] },
    inquiry: { findMany: async () => [] },
    inquiryMessage: { findMany: async (query: any) => {
      if (query.take !== 501) return [];
      const field: "receivedAt" | "sentAt" = query.where.direction === "INBOUND" ? "receivedAt" : "sentAt";
      const nonNull = query.where[field] !== null;
      return [...old, recent, fallback].filter((row) => row.direction === query.where.direction &&
        (row[field] !== null) === nonNull)
        .sort((a, b) => (b[field] ?? b.createdAt).getTime() - (a[field] ?? a.createdAt).getTime() || b.id - a.id)
        .slice(0, query.take);
    } },
    lineManagerObservedOutbound: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  } as unknown as CustomerCommunicationDb;
  const hub = (await getCustomerCommunicationHub(db, 7))!;
  assert.equal(hub.messages.length, 500);
  assert.equal(hub.hasEarlierMessages, true);
  assert.equal(hub.messages.at(-1)?.id, 901);
  assert.equal(hub.messages.at(-2)?.id, 900);
  assert.equal(hub.messages.some((message) => message.id === 1), false);
});
