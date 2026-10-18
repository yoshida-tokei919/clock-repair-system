import assert from "node:assert/strict";
import test from "node:test";
import { getRecentRepairComments, getRepairCommentAccess, parseRepairCommentId, repairCommentsUrl } from "./repair-comments";

test("comment links and repair IDs are strict", () => {
  assert.equal(parseRepairCommentId("12"), 12);
  for (const value of ["0", "-1", "1x", "1.5", "9007199254740992", ""]) assert.equal(parseRepairCommentId(value), null);
  assert.equal(repairCommentsUrl(12, 34), "/repairs/12/comments#message-34");
});

test("comment access checks admin before repair lookup", async () => {
  let lookedUp = false;
  const denied = await getRepairCommentAccess("12", async () => new Response(null, { status: 401 }), async () => { lookedUp = true; return true; });
  assert.equal(denied.response?.status, 401);
  assert.equal(lookedUp, false);
  const invalid = await getRepairCommentAccess("12x", async () => null, async () => { lookedUp = true; return true; });
  assert.equal(invalid.response?.status, 400);
  assert.equal(lookedUp, false);
  const missing = await getRepairCommentAccess("12", async () => null, async () => false);
  assert.equal(missing.response?.status, 404);
  const allowed = await getRepairCommentAccess("12", async () => null, async (id) => id === 12);
  assert.equal(allowed.repairId, 12);
});

test("conversation query is bounded to the requested Repair and chronological", async () => {
  const rows = [{ id: 2 }, { id: 1 }];
  const result = await getRecentRepairComments(12, async (query) => {
    assert.deepEqual(query.where, { repairId: 12, senderType: { in: ["partner", "shop"] } });
    assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.equal(query.take, 200);
    return rows;
  });
  assert.deepEqual(result.map((row) => row.id), [1, 2]);
});
