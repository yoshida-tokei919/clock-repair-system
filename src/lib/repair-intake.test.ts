import assert from "node:assert/strict";
import test from "node:test";

import {
  REPAIR_INTAKE_STATUS,
  RepairIntakeError,
  generateRepairIntakeToken,
  getRepairIntakeInviteState,
  repairIntakeErrorResponse,
} from "./repair-intake";

test("uses shipment-waiting as the intake repair status", () => {
  assert.equal(REPAIR_INTAKE_STATUS, "送付待ち");
});

test("generates URL-safe, high-entropy repair intake tokens", () => {
  const tokens = new Set(Array.from({ length: 100 }, () => generateRepairIntakeToken()));

  assert.equal(tokens.size, 100);
  for (const token of Array.from(tokens)) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  }
});

test("accepts only an unused, unexpired intake invite", async () => {
  const now = Date.now();
  const db = {
    repairIntakeInvite: {
      findUnique: async () => ({
        expiresAt: new Date(now + 60_000),
        usedAt: null,
        customerId: 12,
        lineUserId: null,
        customer: { name: "Test Customer", zipCode: "100-0001", phone: "0312345678", email: "test@example.com" },
        lineUser: null,
        repairs: [],
      }),
    },
  };

  const result = await getRepairIntakeInviteState("valid-token", db as never);
  assert.equal(result.valid, true);
  assert.equal(result.hasLinkedCustomer, true);
  assert.deepEqual(result.prefill, {
    name: "Test Customer",
    postalCode: "100-0001",
    phone: "0312345678",
    email: "test@example.com",
  });
});

test("returns only invite-linked repairs for a used, unexpired intake invite", async () => {
  const db = {
    repairIntakeInvite: {
      findUnique: async () => ({
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
        customerId: 12,
        lineUserId: null,
        customer: null,
        lineUser: null,
        repairs: [{ id: 41, inquiryNumber: "C-041" }, { id: 42, inquiryNumber: "C-042" }],
      }),
    },
  };

  const result = await getRepairIntakeInviteState("used-token", db as never);
  assert.deepEqual(result, {
    completed: true,
    repairs: [{ id: 41, inquiryNumber: "C-041" }, { id: 42, inquiryNumber: "C-042" }],
    count: 2,
  });
  assert.equal("shippingAddress" in result, false);
});

test("rejects expired intake invites, including previously used invites", async () => {
  const expiredDb = {
    repairIntakeInvite: {
      findUnique: async () => ({ expiresAt: new Date(Date.now() - 1), usedAt: new Date(), customerId: null, lineUserId: null, repairs: [] }),
    },
  };

  await assert.rejects(
    () => getRepairIntakeInviteState("expired-token", expiredDb as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "EXPIRED_TOKEN",
  );
});

test("keeps a used-token POST response as HTTP 409", () => {
  assert.equal(repairIntakeErrorResponse(new RepairIntakeError("USED_TOKEN", "already used"))?.status, 409);
});
