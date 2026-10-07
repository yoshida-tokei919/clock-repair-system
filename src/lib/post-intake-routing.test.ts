import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  parseAiPostIntakeRouting,
  parseManualPostIntakeRouting,
  PostIntakeRoutingConflictError,
  PostIntakeRoutingInputError,
  PostIntakeRoutingNotFoundError,
  postIntakeRoutingErrorStatus,
  readPostIntakeRouting,
  upsertAiPostIntakeRouting,
  upsertManualPostIntakeRouting,
} from "./post-intake-routing";

const mixed = { repairIds: [21, 22], hasGeneralContent: true, hasUnassignedContent: true };
const onlyGeneral = { repairIds: [], hasGeneralContent: true, hasUnassignedContent: false };

function fakeDb() {
  const state = {
    message: { id: 7, lineUserId: 10, inquiryLineUserId: 10, customerId: 3, inquiryCustomerId: 3 },
    repairs: [{ id: 21, customerId: 3 }, { id: 22, customerId: 3 }, { id: 23, customerId: 4 }],
    routing: null as any,
    links: [] as { repairId: number; customerId: number }[],
    writes: [] as string[],
    calls: [] as string[],
    afterLock: undefined as undefined | (() => void),
    linkCreateError: undefined as unknown,
  };
  const matches = (where: any) => {
    const message = state.message;
    return where.id === message.id &&
      (where.lineUserId === undefined || where.lineUserId === message.lineUserId) &&
      where.lineUser?.linkedCustomerId === message.customerId &&
      where.inquiry?.lineUser?.linkedCustomerId === message.inquiryCustomerId &&
      (where.inquiry?.lineUserId === undefined || where.inquiry.lineUserId === message.inquiryLineUserId);
  };
  const inquiryMessage = {
    findUnique: async ({ where }: any) => {
      state.calls.push("initial-message");
      return where.id === state.message.id ? { lineUserId: state.message.lineUserId } : null;
    },
    findFirst: async ({ where }: any) => {
      state.calls.push("owned-message");
      if (!matches(where)) return null;
      return {
        id: state.message.id,
        lineUserId: state.message.lineUserId,
        inquiry: { lineUserId: state.message.inquiryLineUserId },
        postIntakeRouting: state.routing ? {
          ...state.routing,
          repairLinks: state.links.map((link) => ({ ...link, externalMessageId: "secret" })),
          evidence: "secret evidence",
        } : null,
      };
    },
  };
  const tx = {
    inquiryMessage,
    $executeRaw: async () => {
      state.calls.push("lock");
      state.afterLock?.();
    },
    inquiryMessagePostIntakeRouting: {
      findUnique: async () => {
        state.calls.push("existing-routing");
        return state.routing && { id: state.routing.id, customerId: state.routing.customerId, source: state.routing.source };
      },
      upsert: async ({ create, update }: any) => {
        state.writes.push("routing-upsert");
        state.routing = {
          ...(state.routing ?? { id: 80, customerId: create.customerId }),
          ...(state.routing ? update : create),
          updatedAt: new Date("2026-10-07T00:00:00Z"),
          externalMessageId: "secret-external-id",
          managerId: "secret-manager-id",
          objectKey: "secret-r2-key",
        };
        return { id: 80 };
      },
    },
    inquiryMessagePostIntakeRepairLink: {
      deleteMany: async () => { state.writes.push("links-delete"); state.links = []; },
      createMany: async ({ data }: any) => {
        state.writes.push("links-create");
        if (state.linkCreateError) throw state.linkCreateError;
        state.links = data.map(({ repairId, customerId }: any) => ({ repairId, customerId }));
      },
    },
    repair: {
      findMany: async ({ where }: any) => {
        state.calls.push("repairs");
        return state.repairs.filter((repair) => where.id.in.includes(repair.id) && repair.customerId === where.customerId);
      },
    },
  };
  return { state, db: { inquiryMessage, $transaction: async (fn: any) => fn(tx) } as any };
}

test("parsers require meaningful targets, bounded unique repairs, and reject browser AI fields", () => {
  assert.deepEqual(parseManualPostIntakeRouting(mixed), mixed);
  assert.deepEqual(parseManualPostIntakeRouting(onlyGeneral), onlyGeneral);
  assert.deepEqual(parseAiPostIntakeRouting({ ...mixed, confidence: "HIGH", evidence: "watch mentioned" }),
    { ...mixed, confidence: "HIGH", evidence: "watch mentioned" });
  for (const body of [
    null, {}, { repairIds: [], hasGeneralContent: false, hasUnassignedContent: false },
    { ...mixed, repairIds: [21, 21] }, { ...mixed, repairIds: [0] },
    { ...mixed, repairIds: ["21"] }, { ...mixed, repairIds: Array.from({ length: 21 }, (_, i) => i + 1) },
    { ...mixed, confidence: "HIGH" }, { ...mixed, evidence: null }, { ...mixed, source: "AI" },
  ]) assert.throws(() => parseManualPostIntakeRouting(body), PostIntakeRoutingInputError);
  assert.throws(() => parseAiPostIntakeRouting({ ...mixed, confidence: "INVALID" }), PostIntakeRoutingInputError);
});

test("manual routing saves multiple repairs and both general and unresolved content", async () => {
  const { db, state } = fakeDb();
  const now = new Date("2026-10-07T01:00:00Z");
  const result = await upsertManualPostIntakeRouting(db, 3, 7, mixed, now);
  assert.equal(state.routing.source, "MANUAL");
  assert.equal(state.routing.confirmedAt, now);
  assert.equal(state.routing.confidence, null);
  assert.deepEqual(state.links.map((link) => link.repairId), [21, 22]);
  assert.deepEqual(result.routing?.repairIds, [21, 22]);
  assert.equal(result.routing?.hasGeneralContent, true);
  assert.equal(result.routing?.hasUnassignedContent, true);
  assert.deepEqual(state.calls.slice(0, 3), ["initial-message", "lock", "owned-message"]);
});

test("cross-customer Repair is rejected before any write", async () => {
  const { db, state } = fakeDb();
  await assert.rejects(upsertManualPostIntakeRouting(db, 3, 7, { ...mixed, repairIds: [21, 23] }), PostIntakeRoutingConflictError);
  assert.deepEqual(state.writes, []);
});

test("link insertion FK race maps to 409 without classifying unrelated Prisma failures", async () => {
  const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError("database failure", {
    code, clientVersion: "5.7.0",
  });
  const { db, state } = fakeDb();
  state.linkCreateError = knownError("P2003");
  await assert.rejects(upsertManualPostIntakeRouting(db, 3, 7, mixed), (error: unknown) => {
    assert.equal(error instanceof PostIntakeRoutingConflictError, true);
    assert.equal(postIntakeRoutingErrorStatus(error, true), 409);
    return true;
  });
  assert.equal(postIntakeRoutingErrorStatus(knownError("P2003"), true), 500);
  assert.equal(postIntakeRoutingErrorStatus(knownError("P2025"), true), 500);
  assert.equal(postIntakeRoutingErrorStatus(knownError("P2034"), true), 409);
  assert.equal(postIntakeRoutingErrorStatus(knownError("P2034"), false), 500);
  assert.equal(postIntakeRoutingErrorStatus(new PostIntakeRoutingConflictError("stale"), true), 409);
  assert.equal(postIntakeRoutingErrorStatus(new PostIntakeRoutingInputError("invalid"), true), 400);
  assert.equal(postIntakeRoutingErrorStatus(new PostIntakeRoutingNotFoundError("missing"), true), 404);
});

test("message ownership is re-read after lock; another Inquiry or LineUser is rejected", async () => {
  for (const change of [
    (state: ReturnType<typeof fakeDb>["state"]) => { state.message.inquiryLineUserId = 11; },
    (state: ReturnType<typeof fakeDb>["state"]) => { state.message.customerId = 4; },
    (state: ReturnType<typeof fakeDb>["state"]) => { state.message.inquiryCustomerId = 4; },
  ]) {
    const { db, state } = fakeDb();
    state.afterLock = () => change(state);
    await assert.rejects(upsertManualPostIntakeRouting(db, 3, 7, mixed), PostIntakeRoutingNotFoundError);
    assert.deepEqual(state.writes, []);
  }
});

test("manual replaces AI, while later AI preserves MANUAL with zero writes", async () => {
  const { db, state } = fakeDb();
  const ai = { ...onlyGeneral, confidence: "MEDIUM", evidence: "general inquiry" };
  assert.deepEqual(await upsertAiPostIntakeRouting(db, 3, 7, ai), { status: "saved" });
  assert.equal(state.routing.source, "AI");
  await upsertManualPostIntakeRouting(db, 3, 7, mixed);
  assert.equal(state.routing.source, "MANUAL");
  assert.equal(state.routing.confidence, null);
  assert.equal(state.routing.evidence, null);
  const before = [...state.writes];
  assert.deepEqual(await upsertAiPostIntakeRouting(db, 3, 7, ai), { status: "manual_preserved" });
  assert.deepEqual(state.writes, before);
  assert.deepEqual(state.links.map((link) => link.repairId), [21, 22]);
});

test("manual may replace earlier manual targets without accepting AI metadata", async () => {
  const { db, state } = fakeDb();
  await upsertManualPostIntakeRouting(db, 3, 7, mixed);
  const later = new Date("2026-10-08T01:00:00Z");
  const result = await upsertManualPostIntakeRouting(db, 3, 7, onlyGeneral, later);
  assert.equal(state.routing.confirmedAt, later);
  assert.deepEqual(state.links, []);
  assert.deepEqual(result.routing?.repairIds, []);
  assert.equal(result.routing?.hasGeneralContent, true);
  assert.equal(result.routing?.hasUnassignedContent, false);
});

test("read exposes only routing flags, source, confidence, dates, and Repair IDs", async () => {
  const { db, state } = fakeDb();
  await upsertManualPostIntakeRouting(db, 3, 7, mixed);
  const payload = await readPostIntakeRouting(db, 3, 7);
  const serialized = JSON.stringify(payload);
  assert.deepEqual(Object.keys(payload).sort(), ["messageId", "routing"]);
  assert.deepEqual(Object.keys(payload.routing!).sort(), [
    "confidence", "confirmedAt", "hasGeneralContent", "hasUnassignedContent", "repairIds", "source", "updatedAt",
  ]);
  for (const secret of ["secret-external-id", "secret-manager-id", "secret-r2-key", "secret evidence"]) {
    assert.equal(serialized.includes(secret), false);
  }
  state.message.inquiryLineUserId = 11;
  await assert.rejects(readPostIntakeRouting(db, 3, 7), PostIntakeRoutingNotFoundError);
});

test("routing from a previous customer link is never exposed to the current customer", async () => {
  const { db, state } = fakeDb();
  await upsertManualPostIntakeRouting(db, 3, 7, mixed);
  state.message.customerId = 4;
  state.message.inquiryCustomerId = 4;
  await assert.rejects(readPostIntakeRouting(db, 4, 7), PostIntakeRoutingConflictError);
  assert.deepEqual(state.links.map((link) => link.repairId), [21, 22]);
});
