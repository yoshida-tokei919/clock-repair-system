import assert from "node:assert/strict";
import test from "node:test";
import { isCustomerRepairPhotoShown, selectCustomerRepairPhotos } from "./customer-repair-photos";
import { newPhotoSharing, photoSharingFallbacks, repairPhotoCategories, repairPhotoStageFromStatus } from "./repair-photo-sharing";

const photo = (id: number, stage: string, category: string, customerVisible = true) => ({ id, stage, category, customerVisible });
const photos = [
  photo(1, "RECEPTION", "BACK"), photo(2, "RECEPTION", "FRONT"),
  photo(3, "WORK", "MOVEMENT_DISASSEMBLED"), photo(4, "WORK", "FAULT_DETAIL"),
  photo(5, "COMPLETION", "FRONT"), photo(6, "WORK", "REPAIR_DETAIL", false),
  photo(7, "RECEPTION", "OTHER"), photo(8, "COMPLETION", "OTHER"),
  photo(9, "WORK", "OTHER"), photo(10, "WORK", "MOVEMENT_OPEN"),
  photo(11, "WORK", "REPAIR_DETAIL"),
];

test("customer photo selector prefers reception front, then back, and never uses hidden or other reception photos", () => {
  assert.equal(selectCustomerRepairPhotos("受付", photos).thumbnail?.id, 2);
  assert.equal(selectCustomerRepairPhotos("受付", photos.filter(item => item.id !== 2)).thumbnail?.id, 1);
  assert.equal(selectCustomerRepairPhotos("受付", photos.map(item => ({ ...item, customerVisible: false }))).thumbnail, null);
  assert.deepEqual(selectCustomerRepairPhotos("受付", photos).progress, []);
});

test("work and completion keep old visibility limits and allow expressly shared new categories", () => {
  assert.deepEqual(selectCustomerRepairPhotos("作業中", photos).progress.map(item => item.id), [3, 4, 10]);
  assert.deepEqual(selectCustomerRepairPhotos("作業中", photos.filter(item => item.id !== 10)).progress.map(item => item.id), [3, 4, 11]);
  assert.deepEqual(selectCustomerRepairPhotos("作業完了", photos).progress.map(item => item.id), [5]);
  assert.deepEqual(selectCustomerRepairPhotos("納品済み", photos).progress.map(item => item.id), [5]);
  assert.equal(isCustomerRepairPhotoShown("受付", photos, 3), false);
  assert.equal(isCustomerRepairPhotoShown("作業中", photos, 6), false);
  assert.equal(isCustomerRepairPhotoShown("作業中", photos, 9), false);
  assert.equal(isCustomerRepairPhotoShown("作業中", photos, 11), false);
  assert.equal(isCustomerRepairPhotoShown("作業完了", photos, 8), false);
  assert.equal(isCustomerRepairPhotoShown("作業完了", photos, 10), false);
});

test("nine categories and stage-aware capture defaults", () => {
  assert.equal(repairPhotoCategories.length, 9);
  assert.equal(new Set(repairPhotoCategories).size, 9);
  for (const stage of ["RECEPTION", "WORK", "COMPLETION", null] as const) {
    for (const category of repairPhotoCategories) {
      assert.equal(newPhotoSharing(stage, category).customerVisible, stage === "RECEPTION" && category === "FRONT");
    }
  }
  assert.equal(newPhotoSharing("WORK", "FRONT", { customerVisible: true }).customerVisible, false);
  assert.equal(newPhotoSharing("WORK", "FAULT_DETAIL", { customerVisible: true }).customerVisible, true);
  assert.equal(photoSharingFallbacks.MOVEMENT_DISASSEMBLED.publicCaseVisible, false);
  assert.equal(photoSharingFallbacks.FAULT_DETAIL.snsVisible, false);
  assert.equal(repairPhotoStageFromStatus("作業中"), "WORK");
  assert.equal(repairPhotoStageFromStatus("納品済み"), "COMPLETION");
  assert.equal(repairPhotoStageFromStatus("受付"), "RECEPTION");
});
