import assert from "node:assert/strict";
import test from "node:test";
import {
  LINE_MANAGER_MAPPING_INTERNAL_LIMITS,
  LineManagerMappingInputError,
  listLineManagerMappingCandidates,
  parseLineManagerMappingVerification,
  verifyLineManagerMapping,
} from "./line-manager-mapping-internal";

test("candidate query is bounded, unmapped, and only asks for inbound evidence", async () => {
  let query: any;
  const db: any = { lineUser: { findMany: async (value: any) => { query = value; return []; } } };
  assert.deepEqual(await listLineManagerMappingCandidates(db), []);
  assert.equal(query.take, LINE_MANAGER_MAPPING_INTERNAL_LIMITS.CANDIDATE_LIMIT);
  assert.equal(query.where.lineManagerChat, null);
  assert.equal(query.where.inquiryMessages.some.direction, "INBOUND");
  assert.equal(query.where.inquiryMessages.some.externalMessageId.not, "");
  assert.equal(query.select.inquiryMessages.take, LINE_MANAGER_MAPPING_INTERNAL_LIMITS.EVIDENCE_LIMIT);
  assert.equal(query.select.inquiryMessages.where.direction, "INBOUND");
  assert.deepEqual(query.select.inquiryMessages.select, { id: true, externalMessageId: true, receivedAt: true });
});

test("candidate result exposes only safe evidence and filters blank ids", async () => {
  const db: any = { lineUser: { findMany: async () => [{
    id: 7, displayName: "must not escape", lineUserId: "LINE-string-id",
    inquiryMessages: [
      { id: 11, externalMessageId: " message-1 ", receivedAt: new Date("2026-09-23T00:00:00Z"), body: "private" },
      { id: 10, externalMessageId: " \t", receivedAt: new Date("2026-09-22T00:00:00Z"), body: "private" },
    ],
  }] } };
  const items = await listLineManagerMappingCandidates(db);
  assert.deepEqual(items, [{ lineUserId: 7, evidence: [{ inquiryMessageId: 11, externalMessageId: " message-1 ", receivedAt: new Date("2026-09-23T00:00:00Z") }] }]);
  assert.equal(JSON.stringify(items).includes("displayName"), false);
  assert.equal(JSON.stringify(items).includes("private"), false);
  assert.equal(JSON.stringify(items).includes("LINE-string-id"), false);
});

test("verification parser accepts exact valid fields and rejects malformed values", () => {
  const valid = { lineUserId: 2, evidenceInquiryMessageId: 3, evidenceManagerMessageId: "m", managerBotId: "b", managerChatId: "c" };
  assert.deepEqual(parseLineManagerMappingVerification(valid), valid);
  for (const invalid of [null, [], { ...valid, lineUserId: 0 }, { ...valid, lineUserId: 1.2 }, { ...valid, evidenceInquiryMessageId: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, managerBotId: " " }, { ...valid, managerChatId: "" }, { ...valid, evidenceManagerMessageId: "\n" }]) {
    assert.throws(() => parseLineManagerMappingVerification(invalid), LineManagerMappingInputError);
  }
});

test("verification delegates only exact parsed evidence to the verified mapping primitive", async () => {
  const body = { lineUserId: 2, evidenceInquiryMessageId: 3, evidenceManagerMessageId: "m", managerBotId: "b", managerChatId: "c" };
  let received: any;
  const create: any = async (_db: unknown, input: unknown) => { received = input; return { id: 9, lineUserId: 2, verifiedAt: new Date("2026-09-23T00:00:00Z"), managerBotId: "b", managerChatId: "c" }; };
  assert.deepEqual(await verifyLineManagerMapping({} as any, body, create), { id: 9, lineUserId: 2, verifiedAt: new Date("2026-09-23T00:00:00Z") });
  assert.deepEqual(received, body);
});
