import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileInquiryMessageRepairLinks,
  reconcileInquiryRepairMessageLinks,
} from "./inquiry-message-repair-links";

type Classification = {
  id: number;
  inquiryId: number;
  scope: "WATCHES" | "COMMON" | "UNASSIGNED";
  watchIds: number[];
  repairIds: number[];
};

function fixture(classifications: Classification[], watches: Array<{ id: number; inquiryId: number; promotedRepairId: number | null }>) {
  const writes: Array<{ operation: string; query: any }> = [];
  const tx: any = {
    inquiryMessageClassification: {
      findUnique: async ({ where }: any) => {
        const classification = classifications.find((row) => row.id === where.id);
        if (!classification) return null;
        return {
          inquiryId: classification.inquiryId,
          scope: classification.scope,
          watchLinks: classification.watchIds.map((id) => ({
            inquiryWatch: { promotedRepairId: watches.find((watch) => watch.id === id)?.promotedRepairId ?? null },
          })),
          repairLinks: classification.repairIds.map((repairId) => ({ repairId })),
        };
      },
      findMany: async (query: any) => {
        assert.equal(query.take, 100);
        return classifications
          .filter((row) => row.inquiryId === query.where.inquiryId && row.id > query.where.id.gt)
          .sort((a, b) => a.id - b.id)
          .slice(0, query.take)
          .map(({ id }) => ({ id }));
      },
    },
    inquiryWatch: {
      findMany: async (query: any) => watches
        .filter((watch) => watch.inquiryId === query.where.inquiryId && watch.promotedRepairId !== null)
        .map(({ promotedRepairId }) => ({ promotedRepairId })),
    },
    inquiryMessageRepairLink: {
      deleteMany: async (query: any) => {
        writes.push({ operation: "delete", query });
        const classification = classifications.find((row) => row.id === query.where.classificationId)!;
        classification.repairIds = classification.repairIds.filter((id) => !query.where.repairId.in.includes(id));
      },
      createMany: async (query: any) => {
        writes.push({ operation: "create", query });
        for (const { classificationId, repairId } of query.data) {
          classifications.find((row) => row.id === classificationId)!.repairIds.push(repairId);
        }
      },
    },
  };
  return { tx, writes };
}

test("WATCHES links only promoted watches and adds a later promotion once", async () => {
  const classification: Classification = { id: 1, inquiryId: 7, scope: "WATCHES", watchIds: [11, 12], repairIds: [] };
  const watches = [
    { id: 11, inquiryId: 7, promotedRepairId: 101 },
    { id: 12, inquiryId: 7, promotedRepairId: null as number | null },
  ];
  const { tx, writes } = fixture([classification], watches);
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(classification.repairIds, [101]);
  watches[1].promotedRepairId = 102;
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(classification.repairIds, [101, 102]);
  assert.deepEqual(writes.map((write) => write.query.data), [
    [{ classificationId: 1, repairId: 101 }],
    [{ classificationId: 1, repairId: 102 }],
  ]);
});

test("COMMON links all and only promoted Repairs in its source Inquiry", async () => {
  const classification: Classification = { id: 1, inquiryId: 7, scope: "COMMON", watchIds: [], repairIds: [] };
  const { tx } = fixture([classification], [
    { id: 11, inquiryId: 7, promotedRepairId: 101 },
    { id: 12, inquiryId: 7, promotedRepairId: null },
    { id: 13, inquiryId: 7, promotedRepairId: 103 },
    { id: 14, inquiryId: 8, promotedRepairId: 104 },
  ]);
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(classification.repairIds, [101, 103]);
});

test("UNASSIGNED removes stale links; exact desired state makes no writes", async () => {
  const classification: Classification = { id: 1, inquiryId: 7, scope: "UNASSIGNED", watchIds: [], repairIds: [101] };
  const { tx, writes } = fixture([classification], []);
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(classification.repairIds, []);
  assert.deepEqual(writes[0], {
    operation: "delete",
    query: { where: { classificationId: 1, repairId: { in: [101] } } },
  });
  writes.length = 0;
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(writes, []);
});

test("matching nonempty Repair links also make no writes", async () => {
  const classification: Classification = { id: 1, inquiryId: 7, scope: "WATCHES", watchIds: [11], repairIds: [101] };
  const { tx, writes } = fixture([classification], [{ id: 11, inquiryId: 7, promotedRepairId: 101 }]);
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(writes, []);
});

test("reclassification replaces stale Repair A with promoted Repair B", async () => {
  const classification: Classification = { id: 1, inquiryId: 7, scope: "WATCHES", watchIds: [12], repairIds: [101] };
  const { tx, writes } = fixture([classification], [
    { id: 11, inquiryId: 7, promotedRepairId: 101 },
    { id: 12, inquiryId: 7, promotedRepairId: 102 },
  ]);
  await reconcileInquiryMessageRepairLinks(tx, 1);
  assert.deepEqual(classification.repairIds, [102]);
  assert.deepEqual(writes.map((write) => write.operation), ["delete", "create"]);
});

test("missing classification fails closed without writes", async () => {
  const { tx, writes } = fixture([], []);
  await assert.rejects(() => reconcileInquiryMessageRepairLinks(tx, 999), /classification 999 not found/);
  assert.deepEqual(writes, []);
});

test("Inquiry reconciliation pages within that Inquiry and leaves others untouched", async () => {
  const classifications: Classification[] = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1, inquiryId: 7, scope: "UNASSIGNED", watchIds: [], repairIds: [101],
  }));
  classifications.push({ id: 102, inquiryId: 8, scope: "UNASSIGNED", watchIds: [], repairIds: [102] });
  const { tx, writes } = fixture(classifications, []);
  await reconcileInquiryRepairMessageLinks(tx, 7);
  assert.equal(writes.length, 101);
  assert.deepEqual(classifications[101].repairIds, [102]);
});
