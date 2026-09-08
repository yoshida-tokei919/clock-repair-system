export type RepairPhotoCategory =
  | "FRONT"
  | "CROWN_SIDE"
  | "BACK"
  | "BRACELET"
  | "MOVEMENT_OPEN"
  | "REPAIR_DETAIL"
  | "OTHER";

export type RepairPhotoStage = "RECEPTION" | "WORK" | "COMPLETION";

export const repairPhotoCategories = [
  "FRONT",
  "CROWN_SIDE",
  "BACK",
  "BRACELET",
  "MOVEMENT_OPEN",
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
  BACK: { customerVisible: true, publicCaseVisible: true, snsVisible: false },
  CROWN_SIDE: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  BRACELET: { customerVisible: false, publicCaseVisible: false, snsVisible: false },
  MOVEMENT_OPEN: { customerVisible: true, publicCaseVisible: true, snsVisible: true },
  REPAIR_DETAIL: { customerVisible: true, publicCaseVisible: true, snsVisible: true },
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
