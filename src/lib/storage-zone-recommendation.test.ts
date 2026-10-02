import assert from "node:assert/strict";
import test from "node:test";
import { compareStorageZone, resolveStorageZone, resolveStorageZoneRecommendation, type StorageLocationNode } from "./storage-zone-recommendation";

type Input = Parameters<typeof resolveStorageZoneRecommendation>[0];
const base: Input = {
  status: "受付", approvalStatus: "pending", customerType: "business",
  planningState: null, partsReadiness: { state: "NOT_REQUIRED" },
};
const recommend = (changes: Partial<Input> = {}) => resolveStorageZoneRecommendation({ ...base, ...changes });
const locations = new Map<number, StorageLocationNode>([
  [1, { id: 1, name: "受付処理待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [2, { id: 2, name: "見積り待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [3, { id: 3, name: "見積り調査中", locationType: "ZONE", parentId: null, isActive: true }],
  [4, { id: 4, name: "ランニングテスト中", locationType: "ZONE", parentId: null, isActive: true }],
  [5, { id: 5, name: "発送・引渡し待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [6, { id: 6, name: "要確認", locationType: "ZONE", parentId: null, isActive: true }],
  [7, { id: 7, name: "部品待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [8, { id: 8, name: "作業待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [9, { id: 9, name: "承認待ち", locationType: "ZONE", parentId: null, isActive: true }],
  [10, { id: 10, name: "棚", locationType: "SHELF", parentId: 2, isActive: true }],
  [11, { id: 11, name: "箱", locationType: "BOX", parentId: 10, isActive: true }],
]);

test("major status mappings retain exact expectations and allowed zones", () => {
  const cases = [
    ["送付待ち", "NONE", null, []],
    ["受付", "REQUIRED", "受付処理待ち", ["受付処理待ち"]],
    ["見積中", "REQUIRED", "見積り待ち", ["見積り待ち", "見積り調査中"]],
    ["承認待ち", "REQUIRED", "承認待ち", ["承認待ち"]],
    ["部品待ち(未注文)", "REQUIRED", "部品待ち", ["部品待ち"]],
    ["部品待ち(注文済み)", "REQUIRED", "部品待ち", ["部品待ち"]],
    ["部品入荷済み", "REQUIRED", "部品待ち", ["部品待ち"]],
    ["作業待ち", "REQUIRED", "作業待ち", ["作業待ち"]],
    ["作業中", "OPTIONAL", "作業待ち", ["作業待ち", "要確認"]],
    ["作業完了", "REQUIRED", "ランニングテスト中", ["ランニングテスト中", "発送・引渡し待ち"]],
    ["納品済み", "NONE", null, []],
    ["キャンセル", "OPTIONAL", "発送・引渡し待ち", ["発送・引渡し待ち", "要確認"]],
    ["保留", "REQUIRED", "要確認", ["要確認"]],
  ] as const;
  for (const [status, expectation, zone, allowed] of cases) {
    const result = recommend({ status });
    assert.equal(result.storageExpectation, expectation, status);
    assert.equal(result.recommendedZone, zone, status);
    assert.deepEqual(result.allowedZones, allowed, status);
    assert.ok(result.reasonCode && result.reason, status);
  }
});

test("both estimate and completed-work zones match", () => {
  for (const id of [2, 3]) assert.equal(compareStorageZone(recommend({ status: "見積中" }), id, locations).comparison, "MATCH");
  for (const id of [4, 5]) assert.equal(compareStorageZone(recommend({ status: "作業完了" }), id, locations).comparison, "MATCH");
});

test("explicit block overrides work states, including completed work", () => {
  for (const status of ["作業待ち", "作業中", "作業完了"]) {
    assert.equal(recommend({ status, planningState: { blocked: true, blockReason: "WAITING_PARTS" } }).recommendedZone, "部品待ち");
    for (const blockReason of ["OTHER", null]) {
      const result = recommend({ status, planningState: { blocked: true, blockReason } });
      assert.deepEqual([result.storageExpectation, result.recommendedZone, result.allowedZones], ["REQUIRED", "要確認", ["要確認"]]);
    }
  }
});

test("canonical readiness states affect work waiting and in-progress, not completed", () => {
  for (const status of ["作業待ち", "作業中"]) {
    for (const state of ["WAITING", "WAITING_UNKNOWN"] as const) {
      const result = recommend({ status, partsReadiness: { state } });
      assert.deepEqual([result.storageExpectation, result.allowedZones], ["REQUIRED", ["部品待ち"]]);
    }
    const legacy = recommend({ status, partsReadiness: { state: "LEGACY_UNKNOWN" } });
    assert.deepEqual(legacy.allowedZones, ["作業待ち", "要確認"]);
    assert.equal(legacy.storageExpectation, status === "作業中" ? "OPTIONAL" : "REQUIRED");
    assert.ok(legacy.attention.some(item => item.includes("部品準備状態")));
  }
  assert.equal(recommend({ status: "作業完了", partsReadiness: { state: "WAITING" } }).recommendedZone, "ランニングテスト中");
});

test("assignment comparison respects optional, none, required and allowed zones", () => {
  assert.equal(compareStorageZone(recommend({ status: "作業中" }), null, locations).comparison, "OPTIONAL_UNASSIGNED");
  assert.equal(compareStorageZone(recommend({ status: "受付" }), null, locations).comparison, "UNASSIGNED");
  for (const status of ["送付待ち", "納品済み"]) {
    assert.equal(compareStorageZone(recommend({ status }), null, locations).comparison, "NO_STORAGE_EXPECTED");
    assert.equal(compareStorageZone(recommend({ status }), 1, locations).comparison, "MISMATCH");
  }
  assert.equal(compareStorageZone(recommend({ status: "見積中" }), 3, locations).comparison, "MATCH");
  assert.equal(compareStorageZone(recommend({ status: "見積中" }), 1, locations).comparison, "MISMATCH");
});

test("approval attentions never change the recommended zone", () => {
  const pendingIndividual = recommend({ status: "作業待ち", customerType: "individual" });
  assert.equal(pendingIndividual.recommendedZone, "作業待ち");
  assert.ok(pendingIndividual.attention.some(item => item.includes("承認済みではありません")));
  assert.deepEqual(recommend({ status: "作業待ち", customerType: "business" }).attention, []);
  assert.ok(recommend({ status: "承認待ち", approvalStatus: "approved" }).attention.length > 0);
  assert.ok(recommend({ status: "受付", approvalStatus: "rejected" }).attention.length > 0);
  assert.deepEqual(recommend({ status: "キャンセル", approvalStatus: "rejected" }).attention, []);
});

test("unknown status routes to review with attention", () => {
  const result = recommend({ status: "unknown" });
  assert.deepEqual([result.storageExpectation, result.recommendedZone, result.allowedZones], ["REQUIRED", "要確認", ["要確認"]]);
  assert.ok(result.attention.some(item => item.includes("unknown")));
});

test("nearest zone ancestor resolves through shelf and box", () => {
  assert.equal(resolveStorageZone(10, locations), "見積り待ち");
  assert.equal(resolveStorageZone(11, locations), "見積り待ち");
  assert.equal(compareStorageZone(recommend({ status: "見積中" }), 11, locations).comparison, "MATCH");
  const nested = new Map(locations);
  nested.set(12, { id: 12, name: "親ゾーン", locationType: "ZONE", parentId: 2, isActive: true });
  assert.equal(resolveStorageZone(12, nested), null);
});

test("cycles, missing or inactive parents, and unknown zones fail safely", () => {
  const invalid = new Map(locations);
  invalid.set(20, { id: 20, name: "循環A", locationType: "SHELF", parentId: 21, isActive: true });
  invalid.set(21, { id: 21, name: "循環B", locationType: "BOX", parentId: 20, isActive: true });
  invalid.set(22, { id: 22, name: "親欠損", locationType: "TRAY", parentId: 999, isActive: true });
  invalid.set(23, { id: 23, name: "無効", locationType: "SHELF", parentId: 2, isActive: false });
  for (const id of [20, 22, 23, 999]) {
    assert.equal(resolveStorageZone(id, invalid), null);
    assert.equal(compareStorageZone(recommend({ status: "見積中" }), id, invalid).comparison, "MISMATCH");
  }
});
