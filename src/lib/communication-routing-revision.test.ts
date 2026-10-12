import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerRoutingRevision } from "./communication-routing-revision";

test("old routing links change revision across bounded ID-keyset pages", async () => {
  const queries: any[] = [];
  const rows = Array.from({ length: 201 }, (_, index) => ({
    id: index + 1,
    classification: {
      scope: "WATCHES", source: "MANUAL", confidence: null, confirmedAt: null,
      watchLinks: [{ inquiryWatchId: 2 }, { inquiryWatchId: 1 }],
      repairLinks: [{ repairId: 10 }],
    },
    postIntakeRouting: null,
  }));
  const db: any = { inquiryMessage: { findMany: async (query: any) => {
    queries.push(query);
    return rows.filter((row) => row.id > query.where.id.gt).slice(0, query.take);
  } } };
  const before = await getCustomerRoutingRevision(db, 7);
  rows[0].classification.repairLinks = [];
  const removed = await getCustomerRoutingRevision(db, 7);
  rows[0].classification.repairLinks = [{ repairId: 11 }];
  const added = await getCustomerRoutingRevision(db, 7);
  assert.notEqual(before, removed);
  assert.notEqual(removed, added);
  assert.deepEqual(queries.slice(0, 2).map((query) => [query.where.id.gt, query.take]), [[0, 200], [200, 200]]);
  assert.deepEqual(queries[0].where.OR, [
    { classification: { isNot: null } }, { postIntakeRouting: { isNot: null } },
  ]);
  assert.deepEqual(queries[0].where.lineUser, { linkedCustomerId: 7 });
  assert.deepEqual(queries[0].where.inquiry, { lineUser: { linkedCustomerId: 7 } });
  assert.deepEqual(queries[0].select.classification.select.repairLinks.where, { repair: { customerId: 7 } });
  assert.deepEqual(queries[0].select.postIntakeRouting.select.repairLinks.where, { customerId: 7, repair: { customerId: 7 } });
  assert.equal(queries[0].select.externalMessageId, undefined);
});

test("another Customer's post-intake routing does not enter the revision", async () => {
  let otherRepairId = 10;
  const db: any = { inquiryMessage: { findMany: async () => [{
    id: 1, classification: null,
    postIntakeRouting: { customerId: 8, source: "MANUAL", confidence: null,
      hasGeneralContent: false, hasUnassignedContent: false, confirmedAt: null,
      repairLinks: [{ repairId: otherRepairId }] },
  }] } };
  const before = await getCustomerRoutingRevision(db, 7);
  otherRepairId = 11;
  const after = await getCustomerRoutingRevision(db, 7);
  assert.equal(before, after);
});
