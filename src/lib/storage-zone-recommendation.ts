import type { PartsReadiness } from "./repair-parts-readiness";

export const STORAGE_ZONES = [
  "受付処理待ち", "見積り待ち", "見積り調査中", "承認待ち", "部品待ち",
  "作業待ち", "ランニングテスト中", "発送・引渡し待ち", "要確認",
] as const;

export type StorageZone = (typeof STORAGE_ZONES)[number];
export type StorageExpectation = "REQUIRED" | "OPTIONAL" | "NONE";
export type StorageZoneComparison = "MATCH" | "MISMATCH" | "UNASSIGNED" | "OPTIONAL_UNASSIGNED" | "NO_STORAGE_EXPECTED";

export type StorageZoneRecommendation = {
  recommendedZone: StorageZone | null;
  allowedZones: StorageZone[];
  storageExpectation: StorageExpectation;
  reasonCode: string;
  reason: string;
  attention: string[];
};

type Input = {
  status: string;
  approvalStatus: string;
  customerType: string;
  planningState: { blocked: boolean; blockReason: string | null } | null;
  partsReadiness: Pick<PartsReadiness, "state">;
};

function recommendation(
  storageExpectation: StorageExpectation,
  recommendedZone: StorageZone | null,
  allowedZones: StorageZone[],
  reasonCode: string,
  reason: string,
): StorageZoneRecommendation {
  return { storageExpectation, recommendedZone, allowedZones, reasonCode, reason, attention: [] };
}

export function resolveStorageZoneRecommendation(input: Input): StorageZoneRecommendation {
  const { status, approvalStatus, customerType, planningState, partsReadiness } = input;
  let result: StorageZoneRecommendation;
  if (status === "送付待ち") {
    result = recommendation("NONE", null, [], "NOT_RECEIVED", "現物受領前のため保管場所の割当は不要です。");
  } else if (status === "受付") {
    result = recommendation("REQUIRED", "受付処理待ち", ["受付処理待ち"], "INTAKE", "受付処理中の現物です。");
  } else if (status === "見積中") {
    result = recommendation("REQUIRED", "見積り待ち", ["見積り待ち", "見積り調査中"], "ESTIMATE", "通常は見積り待ちです。専用の調査中保存状態がないため、見積り調査中も許容します。");
  } else if (status === "承認待ち") {
    result = recommendation("REQUIRED", "承認待ち", ["承認待ち"], "AWAITING_APPROVAL", "顧客の承認待ちです。");
  } else if (["部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み"].includes(status)) {
    result = recommendation("REQUIRED", "部品待ち", ["部品待ち"], "PARTS_STATUS", "部品待ち系の状態です。入荷済みだけでは部品割当完了とはみなしません。");
  } else if (["作業待ち", "作業中", "作業完了"].includes(status)) {
    if (planningState?.blocked) {
      result = planningState.blockReason === "WAITING_PARTS"
        ? recommendation("REQUIRED", "部品待ち", ["部品待ち"], "BLOCKED_WAITING_PARTS", "部品待ちの明示的な作業中断を優先します。")
        : recommendation("REQUIRED", "要確認", ["要確認"], "BLOCKED_OTHER", "作業中断中ですが専用の物理ゾーンがないため、保管場所の確認が必要です。");
    } else if (status === "作業完了") {
      result = recommendation("REQUIRED", "ランニングテスト中", ["ランニングテスト中", "発送・引渡し待ち"], "WORK_COMPLETED", "ランニングテスト中を推奨します。完了イベントと発送状態の正本がないため、発送・引渡し待ちも許容します。");
    } else if (["WAITING", "WAITING_UNKNOWN"].includes(partsReadiness.state)) {
      result = recommendation("REQUIRED", "部品待ち", ["部品待ち"], "PARTS_NOT_READY", "部品準備判定で不足が確認されています。");
    } else if (partsReadiness.state === "LEGACY_UNKNOWN") {
      result = recommendation(status === "作業中" ? "OPTIONAL" : "REQUIRED", "作業待ち", ["作業待ち", "要確認"], "PARTS_LEGACY_UNKNOWN", "部品準備状態が正本化できないため、要確認ゾーンも許容します。");
      result.attention.push("部品準備状態が正本化できません。");
    } else if (status === "作業中") {
      result = recommendation("OPTIONAL", "作業待ち", ["作業待ち", "要確認"], "WORK_IN_PROGRESS", "作業中専用ゾーンがないため、ベンチ上などの未割当も許容します。");
    } else {
      result = recommendation("REQUIRED", "作業待ち", ["作業待ち"], "READY_FOR_WORK", "部品準備済み、または部品不要の作業待ちです。");
    }
  } else if (status === "納品済み") {
    result = recommendation("NONE", null, [], "DELIVERED", "納品済みのため現役の保管場所割当は不要です。");
  } else if (status === "キャンセル") {
    result = recommendation("OPTIONAL", "発送・引渡し待ち", ["発送・引渡し待ち", "要確認"], "CANCELLED", "返却前の保管はあり得ます。返却完了はこの状態だけでは判断できません。");
  } else if (status === "保留") {
    result = recommendation("REQUIRED", "要確認", ["要確認"], "ON_HOLD", "保留中の保管場所を確認してください。");
  } else {
    result = recommendation("REQUIRED", "要確認", ["要確認"], "UNKNOWN_STATUS", "未知の案件状態のため保管場所を確認してください。");
    result.attention.push(`未知の案件状態: ${status}`);
  }

  if (status === "承認待ち" && approvalStatus !== "pending") {
    result.attention.push("案件状態と承認状態の整合確認が必要です。");
  }
  if (customerType === "individual" &&
      ["部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち", "作業中", "作業完了"].includes(status) &&
      approvalStatus !== "approved") {
    result.attention.push("個人顧客の作業段階ですが、承認済みではありません。整合確認が必要です。");
  }
  if (approvalStatus === "rejected" && !["保留", "キャンセル", "納品済み"].includes(status)) {
    result.attention.push("承認却下と案件状態の整合確認が必要です。");
  }
  return result;
}

export type StorageLocationNode = {
  id: number;
  name: string;
  locationType: string;
  parentId: number | null;
  isActive: boolean;
};

export function resolveStorageZone(locationId: number, locations: ReadonlyMap<number, StorageLocationNode>): StorageZone | null {
  const visited = new Set<number>();
  let id: number | null = locationId;
  while (id !== null && !visited.has(id)) {
    visited.add(id);
    const location: StorageLocationNode | undefined = locations.get(id);
    if (!location || !location.isActive) return null;
    if (location.locationType === "ZONE") {
      return (STORAGE_ZONES as readonly string[]).includes(location.name) ? location.name as StorageZone : null;
    }
    id = location.parentId;
  }
  return null;
}

export function compareStorageZone(
  recommendation: StorageZoneRecommendation,
  activeLocationId: number | null,
  locations: ReadonlyMap<number, StorageLocationNode>,
): { currentZone: StorageZone | null; comparison: StorageZoneComparison } {
  if (activeLocationId === null) {
    return { currentZone: null, comparison: recommendation.storageExpectation === "NONE" ? "NO_STORAGE_EXPECTED" :
      recommendation.storageExpectation === "OPTIONAL" ? "OPTIONAL_UNASSIGNED" : "UNASSIGNED" };
  }
  const currentZone = resolveStorageZone(activeLocationId, locations);
  return { currentZone, comparison: currentZone !== null && recommendation.allowedZones.includes(currentZone) ? "MATCH" : "MISMATCH" };
}

export const STORAGE_COMPARISON_LABELS: Record<StorageZoneComparison, string> = {
  MATCH: "一致", MISMATCH: "不一致", UNASSIGNED: "保管場所未登録",
  OPTIONAL_UNASSIGNED: "未割当許容", NO_STORAGE_EXPECTED: "保管不要",
};
