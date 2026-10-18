import assert from "node:assert/strict";
import test from "node:test";
import { cardKey, matchesCard, parseCards, sumCompletedSeconds } from "./work-timer-cards";

test("cards survive storage parsing and same-name LABOR belongs to a Repair-level label group", () => {
  const first = { activityType: "REPAIR" as const, repairId: 42, repairLineItemId: 1, label: "分解" };
  const second = { ...first, repairLineItemId: 2 };
  assert.equal(cardKey(first), cardKey(second));
  const cards = parseCards([{ key: "forged", input: first, title: "分解" },
    { key: "forged2", input: second, title: "分解" }]);
  assert.equal(cards.length, 1);
  assert.equal(matchesCard(cards[0], { activityType: "REPAIR", repairId: 42,
    inquiryId: null, orderRequestId: null, workLabelSnapshot: "分解" }), true);
  assert.equal(matchesCard(cards[0], { activityType: "REPAIR", repairId: 43,
    inquiryId: null, orderRequestId: null, workLabelSnapshot: "分解" }), false);
});

test("completed total uses corrected times and excludes active and invalidated sessions", () => {
  const date = (s: string) => new Date(s);
  assert.equal(sumCompletedSeconds([
    { startedAt: date("2026-01-01T00:00:00Z"), endedAt: date("2026-01-01T00:01:05Z"), invalidatedAt: null },
    { startedAt: date("2026-01-01T01:00:00Z"), endedAt: date("2026-01-01T01:10:00Z"), invalidatedAt: date("2026-01-02T00:00:00Z") },
    { startedAt: date("2026-01-01T02:00:00Z"), endedAt: null, invalidatedAt: null },
  ]), 65);
});

test("invalid cards and stale persisted keys never control matching", () => {
  assert.deepEqual(parseCards([{ input: { activityType: "REPAIR", repairId: -1 }, title: "bad" }]), []);
  assert.equal(parseCards([{ key: "stale", input: { activityType: "ADMIN", label: "事務" }, title: "事務" }])[0].key,
    cardKey({ activityType: "ADMIN", label: "事務" }));
});
