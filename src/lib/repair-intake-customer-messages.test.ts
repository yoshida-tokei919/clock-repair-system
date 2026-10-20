import assert from "node:assert/strict";
import test from "node:test";
import { INTAKE_LOAD_ERROR, INTAKE_SUBMIT_ERROR, repairIntakeCustomerMessage } from "./repair-intake-customer-messages";

test("customer intake messages distinguish link, validation, and transient failures in Japanese", () => {
  assert.match(repairIntakeCustomerMessage("INVALID_TOKEN", INTAKE_LOAD_ERROR), /リンク/);
  assert.match(repairIntakeCustomerMessage("INVALID_INPUT", INTAKE_SUBMIT_ERROR), /入力内容/);
  assert.match(repairIntakeCustomerMessage("INVALID_BRAND", INTAKE_SUBMIT_ERROR), /ブランド/);
  assert.match(repairIntakeCustomerMessage("INQUIRY_NOT_READY", INTAKE_SUBMIT_ERROR), /受付/);
  assert.doesNotMatch(repairIntakeCustomerMessage("INVALID_INPUT", INTAKE_SUBMIT_ERROR), /リンク/);
  assert.equal(repairIntakeCustomerMessage("UNKNOWN", INTAKE_SUBMIT_ERROR), INTAKE_SUBMIT_ERROR);
  assert.equal(repairIntakeCustomerMessage(undefined, INTAKE_LOAD_ERROR), INTAKE_LOAD_ERROR);
});
