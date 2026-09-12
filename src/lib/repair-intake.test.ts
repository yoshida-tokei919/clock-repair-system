import assert from "node:assert/strict";
import test from "node:test";

import {
  REPAIR_INTAKE_STATUS,
  REPAIR_INTAKE_INVITE_TTL_DAYS,
  RepairIntakeError,
  createCustomerRepairIntakeInvite,
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

test("reuses an active B2C invite instead of issuing another token", async () => {
  const activeInvite = { id: 8, token: "active", expiresAt: new Date("2026-09-20T00:00:00Z"), usedAt: null, createdAt: new Date() };
  const db = {
    customer: { findUnique: async () => ({ id: 12, type: "individual" }) },
    repairIntakeInvite: {
      findFirst: async () => activeInvite,
      create: async () => { throw new Error("should not create"); },
    },
  };

  const result = await createCustomerRepairIntakeInvite(12, db as never, new Date("2026-09-13T00:00:00Z"));
  assert.equal(result.reused, true);
  assert.equal(result.invite.token, "active");
});

test("issues a seven-day invite only for B2C customers", async () => {
  const created: { value: { data: { customerId: number | null; expiresAt: Date } } | null } = { value: null };
  const db = {
    customer: { findUnique: async () => ({ id: 12, type: "individual" }) },
    repairIntakeInvite: {
      findFirst: async () => null,
      create: async (args: { data: { customerId: number | null; expiresAt: Date } }) => {
        created.value = args;
        return { id: 9, token: "new", ...args.data, usedAt: null, createdAt: new Date() };
      },
    },
  };
  const now = new Date("2026-09-13T12:00:00Z");
  const result = await createCustomerRepairIntakeInvite(12, db as never, now);
  assert.equal(result.reused, false);
  assert.equal(created.value?.data.customerId, 12);
  assert.equal(created.value?.data.expiresAt.getTime(), now.getTime() + REPAIR_INTAKE_INVITE_TTL_DAYS * 86_400_000);

  await assert.rejects(
    () => createCustomerRepairIntakeInvite(99, { ...db, customer: { findUnique: async () => ({ id: 99, type: "business" }) } } as never, now),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "B2B_CUSTOMER",
  );
});

async function assertNewInviteWhenNoActiveInvite() {
  let createCount = 0;
  const db = {
    customer: { findUnique: async () => ({ id: 12, type: "individual" }) },
    repairIntakeInvite: {
      findFirst: async () => null,
      create: async (args: { data: { customerId: number | null; expiresAt: Date } }) => {
        createCount += 1;
        return { id: 9, token: "new", ...args.data, usedAt: null, createdAt: new Date() };
      },
    },
  };

  const result = await createCustomerRepairIntakeInvite(12, db as never, new Date("2026-09-13T12:00:00Z"));
  assert.equal(result.reused, false);
  assert.equal(createCount, 1);
}

test("issues a new invite when only used staff-issued invites exist", async () => {
  await assertNewInviteWhenNoActiveInvite();
});

test("issues a new invite when only expired staff-issued invites exist", async () => {
  await assertNewInviteWhenNoActiveInvite();
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
