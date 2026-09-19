import assert from "node:assert/strict";
import test from "node:test";
import {
  claimSlackNotificationBatch,
  markSlackNotificationFailed,
  markSlackNotificationSent,
} from "./slack-notification-outbox";

test("claim uses a conditional update, so concurrent claimers cannot both claim a row", async () => {
  let claimed = false;
  const db: any = {
    slackNotificationOutbox: {
      findMany: async () => [{ id: 1 }],
      updateMany: async () => {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      },
      findUnique: async () => ({ id: 1, target: "REPAIR_INBOX", text: "safe", processingToken: undefined }),
    },
  };
  // Return the token passed in by observing the update data, like a database row would.
  db.slackNotificationOutbox.updateMany = async (args: any) => {
    if (claimed) return { count: 0 };
    claimed = true;
    db.token = args.data.processingToken;
    return { count: 1 };
  };
  db.slackNotificationOutbox.findUnique = async () => ({ id: 1, target: "REPAIR_INBOX", text: "safe", processingToken: db.token });

  const [first, second] = await Promise.all([claimSlackNotificationBatch(db), claimSlackNotificationBatch(db)]);
  assert.equal(first.length + second.length, 1);
});

test("failed notifications retry, stale PROCESSING rows reclaim, and max-attempt rows are excluded", async () => {
  const calls: any[] = [];
  const db: any = {
    slackNotificationOutbox: {
      findMany: async (args: any) => { calls.push(args); return []; },
    },
  };
  await claimSlackNotificationBatch(db, { now: new Date("2026-09-19T00:00:00.000Z") });
  const where = calls[0].where;
  assert.deepEqual(where.attemptCount, { lt: 5 });
  assert.deepEqual(where.OR[0], { status: { in: ["PENDING", "FAILED"] } });
  assert.equal(where.OR[1].status, "PROCESSING");
  assert.equal(where.OR[1].lastAttemptAt.lt.toISOString(), "2026-09-18T23:50:00.000Z");
});

test("a stale or later failure acknowledgement cannot downgrade SENT", async () => {
  const updates: any[] = [];
  const db: any = { slackNotificationOutbox: { updateMany: async (args: any) => { updates.push(args); return { count: 0 }; } } };
  assert.equal(await markSlackNotificationSent(db, { id: 1, claimToken: "current" }), false);
  assert.equal(await markSlackNotificationFailed(db, { id: 1, claimToken: "old", error: "failed\nwith details" }), false);
  assert.deepEqual(updates[1].where, { id: 1, status: "PROCESSING", processingToken: "old" });
  assert.equal(updates[1].data.lastError, "failed with details");
});

test("only the current claim token can acknowledge delivery", async () => {
  const row: { status: string; processingToken: string | null } = {
    status: "PROCESSING",
    processingToken: "current",
  };
  const db: any = {
    slackNotificationOutbox: {
      updateMany: async ({ where, data }: any) => {
        if (row.status !== where.status || row.processingToken !== where.processingToken) {
          return { count: 0 };
        }
        row.status = data.status;
        row.processingToken = data.processingToken;
        return { count: 1 };
      },
    },
  };

  assert.equal(await markSlackNotificationSent(db, { id: 1, claimToken: "stale" }), false);
  assert.equal(row.status, "PROCESSING");
  assert.equal(await markSlackNotificationSent(db, { id: 1, claimToken: "current" }), true);
  assert.equal(row.status, "SENT");
  assert.equal(await markSlackNotificationFailed(db, { id: 1, claimToken: "current", error: "late failure" }), false);
  assert.equal(row.status, "SENT");
});
