export type CustomerPhoto = {
  id: number;
  stage: string | null;
  category: string;
  customerVisible: boolean;
};

export function selectCustomerRepairPhotos<T extends CustomerPhoto>(status: string, photos: readonly T[]) {
  const visible = photos.filter(photo => photo.customerVisible === true);
  const front = visible.find(photo => photo.stage === "RECEPTION" && photo.category === "FRONT");
  const back = visible.find(photo => photo.stage === "RECEPTION" && photo.category === "BACK");
  const thumbnail = front ?? back ?? null;
  // Keep the pre-existing WORK category precedence, rather than exposing
  // previously hidden legacy OTHER photos with customerVisible=true.
  const workMovement = visible.filter(photo => photo.stage === "WORK" && photo.category === "MOVEMENT_OPEN");
  const showLegacyWork = workMovement.length ? "MOVEMENT_OPEN" : "REPAIR_DETAIL";
  const progress = status === "作業中"
    ? visible.filter(photo => photo.stage === "WORK" && (
      photo.category === showLegacyWork ||
      photo.category === "MOVEMENT_DISASSEMBLED" ||
      photo.category === "FAULT_DETAIL"
    ))
    : status === "作業完了" || status === "納品済み"
      ? visible.filter(photo => photo.stage === "COMPLETION" && (photo.category === "FRONT" || photo.category === "BACK"))
      : [];
  return { thumbnail, progress };
}

export function isCustomerRepairPhotoShown<T extends CustomerPhoto>(status: string, photos: readonly T[], photoId: number) {
  const selected = selectCustomerRepairPhotos(status, photos);
  return selected.thumbnail?.id === photoId || selected.progress.some(photo => photo.id === photoId);
}
