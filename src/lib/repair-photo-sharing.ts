export type RepairPhotoCategory =
  | "FRONT"
  | "CROWN_SIDE"
  | "BACK"
  | "BRACELET"
  | "MOVEMENT_OPEN"
  | "MOVEMENT_DISASSEMBLED"
  | "FAULT_DETAIL"
  | "REPAIR_DETAIL"
  | "OTHER";

export type RepairPhotoStage = "RECEPTION" | "WORK" | "COMPLETION";

export const repairPhotoCategories = [
  "FRONT",
  "CROWN_SIDE",
  "BACK",
  "BRACELET",
  "MOVEMENT_OPEN",
  "MOVEMENT_DISASSEMBLED",
  "FAULT_DETAIL",
  "REPAIR_DETAIL",
  "OTHER",
] as const satisfies readonly RepairPhotoCategory[];

export const repairPhotoStages = ["RECEPTION", "WORK", "COMPLETION"] as const satisfies readonly RepairPhotoStage[];

export const repairPhotoCategoryLabels: Record<RepairPhotoCategory, string> = {
  FRONT: "正面",
  CROWN_SIDE: "リューズ側",
  BACK: "裏面",
  BRACELET: "バンド / ブレス",
  MOVEMENT_OPEN: "ムーブメント",
  MOVEMENT_DISASSEMBLED: "ムーブメント（分解時）",
  FAULT_DETAIL: "不具合箇所",
  REPAIR_DETAIL: "修理箇所",
  OTHER: "その他",
};

export const repairPhotoStageLabels: Record<RepairPhotoStage, string> = {
  RECEPTION: "受付時",
  WORK: "作業中",
  COMPLETION: "作業完了",
};

export type PhotoSharingValues = {
  customerVisible: boolean;
  publicCaseVisible: boolean;
  snsVisible: boolean;
};

export const photoSharingFallbacks: Record<RepairPhotoCategory, PhotoSharingValues> = {
  FRONT: { customerVisible: true, publicCaseVisible: true, snsVisible: true },
  BACK: { customerVisible: false, publicCaseVisible: true, snsVisible: false },
  CROWN_SIDE: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  BRACELET: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  MOVEMENT_OPEN: { customerVisible: false, publicCaseVisible: true, snsVisible: true },
  MOVEMENT_DISASSEMBLED: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  FAULT_DETAIL: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  REPAIR_DETAIL: { customerVisible: false, publicCaseVisible: true, snsVisible: true },
  OTHER: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
};

export function repairPhotoCategory(value: unknown): RepairPhotoCategory {
  return repairPhotoCategories.includes(value as RepairPhotoCategory)
    ? value as RepairPhotoCategory
    : "OTHER";
}

export function repairPhotoStage(value: unknown): RepairPhotoStage | null {
  return repairPhotoStages.includes(value as RepairPhotoStage)
    ? value as RepairPhotoStage
    : null;
}

export function normalizePhotoSharing(values: Partial<PhotoSharingValues>): PhotoSharingValues {
  return {
    customerVisible: values.customerVisible === true,
    publicCaseVisible: values.publicCaseVisible === true,
    snsVisible: values.snsVisible === true,
  };
}

export function repairPhotoStageFromStatus(status: string): RepairPhotoStage | null {
  if (status === "作業中") return "WORK";
  if (status === "作業完了" || status === "納品済み") return "COMPLETION";
  if (["受付", "見積中", "承認待ち", "部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち"].includes(status)) return "RECEPTION";
  return null;
}

export function newPhotoSharing(stage: RepairPhotoStage | null, category: RepairPhotoCategory, preset?: Partial<PhotoSharingValues> | null): PhotoSharingValues {
  const sharing = normalizePhotoSharing(preset ?? photoSharingFallbacks[category]);
  // A category-wide preset can enable another category, but FRONT is only
  // automatic for reception. A missing preset always uses safe fallbacks.
  sharing.customerVisible = category === "FRONT"
    ? stage === "RECEPTION" && sharing.customerVisible
    : sharing.customerVisible;
  return sharing;
}
