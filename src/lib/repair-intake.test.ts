import assert from "node:assert/strict";
import test from "node:test";

import {
  REPAIR_INTAKE_STATUS,
  RepairIntakeError,
  generateRepairIntakeToken,
  getRepairIntakeInviteState,
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
      }),
    },
  };

  const result = await getRepairIntakeInviteState("valid-token", db as never);
  assert.equal(result.valid, true);
  assert.equal(result.hasLinkedCustomer, true);
});

test("rejects expired and already-used intake invites", async () => {
  const expiredDb = {
    repairIntakeInvite: {
      findUnique: async () => ({ expiresAt: new Date(Date.now() - 1), usedAt: null, customerId: null, lineUserId: null }),
    },
  };
  const usedDb = {
    repairIntakeInvite: {
      findUnique: async () => ({ expiresAt: new Date(Date.now() + 60_000), usedAt: new Date(), customerId: null, lineUserId: null }),
    },
  };

  await assert.rejects(
    () => getRepairIntakeInviteState("expired-token", expiredDb as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "EXPIRED_TOKEN",
  );
  await assert.rejects(
    () => getRepairIntakeInviteState("used-token", usedDb as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "USED_TOKEN",
  );
});
