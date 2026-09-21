import assert from "node:assert/strict";
import test from "node:test";

import {
  REPAIR_INTAKE_STATUS,
  REPAIR_INTAKE_INVITE_TTL_DAYS,
  RepairIntakeError,
  createCustomerRepairIntakeInvite,
  createInquiryRepairIntakeInvite,
  createLineUserRepairIntakeInvite,
  generateRepairIntakeToken,
  getRepairIntakeInviteState,
  normalizePostalCode,
  parseRepairIntakePayload,
  repairIntakeErrorResponse,
  returnAddressSnapshotData,
  structuredCustomerAddressData,
  submitRepairIntake,
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

test("normalizes accepted postal-code formats to seven ASCII digits", () => {
  assert.equal(normalizePostalCode("1234567"), "1234567");
  assert.equal(normalizePostalCode("123-4567"), "1234567");
  assert.equal(normalizePostalCode("１２３－４５６７"), "1234567");
  assert.equal(normalizePostalCode("123456"), null);
  assert.equal(normalizePostalCode("12345678"), null);
  assert.equal(normalizePostalCode("abc123-4567xyz"), null);
});

const customerInput = {
  name: "Customer", postalCode: "１２３－４５６７", prefecture: "東京都", city: "千代田区", street: "丸の内1-1", building: "時計ビル", phone: "0312345678", email: "customer@example.com",
};
const returnAddressInput = {
  name: "Return recipient", postalCode: "987-6543", prefecture: "大阪府", city: "大阪市", street: "北区2-2", building: "返送ビル", phone: "0612345678",
};
const watchesInput = [
  { timepieceType: "WRISTWATCH", driveType: "QUARTZ", brandId: 1 },
  { timepieceType: "WALL_CLOCK", driveType: "MECHANICAL", brandId: 2 },
];

test("uses the customer address for each return snapshot when the checkbox is on", () => {
  const parsed = parseRepairIntakePayload({ customer: customerInput, returnAddressSameAsCustomer: true, watches: watchesInput });
  assert.deepEqual(structuredCustomerAddressData(parsed.customer), {
    zipCode: "1234567", prefecture: "東京都", city: "千代田区", street: "丸の内1-1", building: "時計ビル", address: "東京都千代田区丸の内1-1時計ビル",
  });
  const snapshots = parsed.watches.map(() => returnAddressSnapshotData(parsed.returnAddress));
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots, [
    { returnRecipientName: "Customer", returnPostalCode: "1234567", returnPrefecture: "東京都", returnCity: "千代田区", returnStreet: "丸の内1-1", returnBuilding: "時計ビル", returnPhone: "0312345678" },
    { returnRecipientName: "Customer", returnPostalCode: "1234567", returnPrefecture: "東京都", returnCity: "千代田区", returnStreet: "丸の内1-1", returnBuilding: "時計ビル", returnPhone: "0312345678" },
  ]);
});

test("uses the separate return address when the checkbox is off", () => {
  const parsed = parseRepairIntakePayload({ customer: customerInput, returnAddressSameAsCustomer: false, returnAddress: returnAddressInput, watches: watchesInput });
  assert.deepEqual(returnAddressSnapshotData(parsed.returnAddress), {
    returnRecipientName: "Return recipient", returnPostalCode: "9876543", returnPrefecture: "大阪府", returnCity: "大阪市", returnStreet: "北区2-2", returnBuilding: "返送ビル", returnPhone: "0612345678",
  });
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

test("issues a seven-day customer-less invite for an unlinked LINE user", async () => {
  const created: { value: { data: { customerId: number | null; lineUserId: number | null; expiresAt: Date } } | null } = { value: null };
  const db = {
    lineUser: { findUnique: async () => ({ id: 41, linkedCustomerId: null }) },
    repairIntakeInvite: {
      findFirst: async () => null,
      create: async (args: { data: { customerId: number | null; lineUserId: number | null; expiresAt: Date } }) => {
        created.value = args;
        return { id: 10, token: "line-new", ...args.data, usedAt: null, createdAt: new Date() };
      },
    },
  };
  const now = new Date("2026-09-13T12:00:00Z");
  const result = await createLineUserRepairIntakeInvite(41, db as never, now);

  assert.equal(result.reused, false);
  assert.equal(created.value?.data.customerId, null);
  assert.equal(created.value?.data.lineUserId, 41);
  assert.equal(created.value?.data.expiresAt.getTime(), now.getTime() + REPAIR_INTAKE_INVITE_TTL_DAYS * 86_400_000);
});

test("reuses an active invite for an unlinked LINE user", async () => {
  const activeInvite = { id: 10, token: "line-active", expiresAt: new Date("2026-09-20T00:00:00Z"), usedAt: null, createdAt: new Date() };
  const db = {
    lineUser: { findUnique: async () => ({ id: 41, linkedCustomerId: null }) },
    repairIntakeInvite: { findFirst: async () => activeInvite, create: async () => { throw new Error("should not create"); } },
  };
  const result = await createLineUserRepairIntakeInvite(41, db as never, new Date("2026-09-13T00:00:00Z"));
  assert.equal(result.reused, true);
  assert.equal(result.invite.token, "line-active");
});

test("rejects missing and already linked LINE users", async () => {
  const invites = { findFirst: async () => null, create: async () => { throw new Error("should not create"); } };
  await assert.rejects(
    () => createLineUserRepairIntakeInvite(41, { lineUser: { findUnique: async () => null }, repairIntakeInvite: invites } as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "LINE_USER_NOT_FOUND",
  );
  await assert.rejects(
    () => createLineUserRepairIntakeInvite(41, { lineUser: { findUnique: async () => ({ id: 41, linkedCustomerId: 12 }) }, repairIntakeInvite: invites } as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "LINE_USER_ALREADY_LINKED",
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
        revokedAt: null,
        customerId: 12,
        lineUserId: null,
        inquiryId: null,
        customer: { name: "Test Customer", zipCode: "100-0001", prefecture: "東京都", city: "千代田区", street: "丸の内1-1", building: "テストビル", phone: "0312345678", email: "test@example.com" },
        lineUser: null,
        repairs: [],
        inquiryWatches: [],
      }),
    },
  };

  const result = await getRepairIntakeInviteState("valid-token", db as never);
  assert.equal(result.valid, true);
  assert.equal(result.hasLinkedCustomer, true);
  assert.deepEqual(result.prefill, {
    name: "Test Customer",
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    street: "丸の内1-1",
    building: "テストビル",
    phone: "0312345678",
    email: "test@example.com",
  });
});

test("does not infer structured prefill fields from a legacy address string", async () => {
  const db = {
    repairIntakeInvite: {
      findUnique: async () => ({
        expiresAt: new Date(Date.now() + 60_000), usedAt: null, revokedAt: null, customerId: 12, lineUserId: null, inquiryId: null,
        customer: { name: "Legacy Customer", zipCode: "100-0001", prefecture: null, city: null, street: null, building: null, address: "東京都千代田区丸の内1-1", phone: "0312345678", email: null },
        lineUser: null, repairs: [], inquiryWatches: [],
      }),
    },
  };
  const result = await getRepairIntakeInviteState("legacy-token", db as never);
  assert.deepEqual(result.prefill, {
    name: "Legacy Customer", postalCode: "100-0001", prefecture: null, city: null, street: null, building: null, phone: "0312345678", email: null,
  });
});

test("returns only invite-linked repairs for a used, unexpired intake invite", async () => {
  const db = {
    repairIntakeInvite: {
      findUnique: async () => ({
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
        revokedAt: null,
        customerId: 12,
        lineUserId: null,
        inquiryId: null,
        customer: null,
        lineUser: null,
        repairs: [{ id: 41, inquiryNumber: "C-041" }, { id: 42, inquiryNumber: "C-042" }],
        inquiryWatches: [],
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
      findUnique: async () => ({ expiresAt: new Date(Date.now() - 1), usedAt: new Date(), revokedAt: null, customerId: null, lineUserId: null, inquiryId: null, repairs: [], inquiryWatches: [] }),
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

function requestedInquiryWatch(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, position: id, inquiryId: 70, decision: "REQUESTED", brandId: 10, modelId: 20,
    referenceId: 30, caseReferenceId: 31, caliberId: 40, baseCaliberId: 41,
    promotedWatchId: null, promotedRepairId: null, promotedAt: null,
    fieldValues: [
      { field: "BRAND", value: "10", confirmationStatus: "CONFIRMED" },
      { field: "MODEL", value: "20", confirmationStatus: "CONFIRMED" },
      { field: "PRODUCT_REF", value: "30", confirmationStatus: "CONFIRMED" },
      { field: "CASE_REF", value: "31", confirmationStatus: "CONFIRMED" },
      { field: "CALIBER", value: "40", confirmationStatus: "CONFIRMED" },
      { field: "BASE_CALIBER", value: "41", confirmationStatus: "CONFIRMED" },
    ],
    ...overrides,
  };
}

function promotionMasterTx() {
  return {
    $executeRaw: async () => undefined,
    brand: { findUnique: async () => ({ id: 10 }) },
    model: { findUnique: async () => ({ id: 20, brandId: 10 }) },
    watchReference: { findUnique: async (args: { where: { id: number } }) => ({ id: args.where.id, modelId: 20 }) },
    caliber: { findUnique: async (args: { where: { id: number } }) => ({ id: args.where.id }) },
  };
}

test("binds an Inquiry invite only to requested, unpromoted watches", async () => {
  const allWatches = [
    requestedInquiryWatch(1),
    requestedInquiryWatch(2, { decision: "PENDING" }),
    requestedInquiryWatch(3, { decision: "DECLINED" }),
    requestedInquiryWatch(4, { promotedAt: new Date("2026-09-12T00:00:00Z"), promotedWatchId: 44, promotedRepairId: 55 }),
  ];
  const created: { data?: { inquiryWatches: { create: Array<{ inquiryWatchId: number }> } } } = {};
  const tx = {
    ...promotionMasterTx(),
    inquiry: { findUnique: async () => ({ id: 70, lineUserId: 7, lineUser: { linkedCustomer: null } }) },
    inquiryWatch: { findMany: async (args: { where: { decision: string; promotedAt: null } }) => allWatches.filter((watch) => watch.decision === args.where.decision && watch.promotedAt === args.where.promotedAt) },
    repairIntakeInvite: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      create: async (args: typeof created) => { created.data = args.data; return { id: 90, token: "inquiry-token", ...args.data }; },
    },
  };
  const db = { $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) };

  await createInquiryRepairIntakeInvite(70, new Date("2026-09-13T00:00:00Z"), db as never);
  assert.deepEqual(created.data?.inquiryWatches.create, [{ inquiryWatchId: 1 }]);
});

test("revokes a stale active Inquiry invite before issuing one for the changed watch set", async () => {
  const updates: unknown[] = [];
  const tx = {
    ...promotionMasterTx(),
    inquiry: { findUnique: async () => ({ id: 70, lineUserId: 7, lineUser: { linkedCustomer: null } }) },
    inquiryWatch: { findMany: async () => [requestedInquiryWatch(2)] },
    repairIntakeInvite: {
      findMany: async () => [{ id: 89, inquiryWatches: [{ inquiryWatchId: 1 }] }],
      updateMany: async (args: unknown) => { updates.push(args); return { count: 1 }; },
      create: async (args: { data: { inquiryWatches: { create: Array<{ inquiryWatchId: number }> } } }) => ({ id: 90, token: "replacement", ...args.data }),
    },
  };
  const db = { $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) };

  const result = await createInquiryRepairIntakeInvite(70, new Date("2026-09-13T00:00:00Z"), db as never);
  assert.equal(result.reused, false);
  assert.deepEqual(updates, [{ where: { id: { in: [89] }, usedAt: null, revokedAt: null }, data: { revokedAt: new Date("2026-09-13T00:00:00Z") } }]);
  assert.deepEqual((result.invite as unknown as { inquiryWatches: { create: Array<{ inquiryWatchId: number }> } }).inquiryWatches.create, [{ inquiryWatchId: 2 }]);
});

function inquirySubmitDb(watch: Record<string, unknown>, reviewWatches: Record<string, unknown>[] = [watch]) {
  const createdWatches: unknown[] = [];
  const createdRepairs: unknown[] = [];
  const updatedInquiryWatches: unknown[] = [];
  const updatedInquiries: unknown[] = [];
  const tx = {
    ...promotionMasterTx(),
    $queryRaw: async () => [{ id: 12 }],
    repairIntakeInvite: {
      findUnique: async () => ({ id: 90, token: "bound-token", expiresAt: new Date("2026-10-01T00:00:00Z"), usedAt: null, revokedAt: null, inquiryId: 70, customerId: null, lineUserId: 7, lineUser: { id: 7, linkedCustomerId: null }, inquiryWatches: [{ inquiryWatch: watch }] }),
      updateMany: async () => ({ count: 1 }),
    },
    customer: {
      findUnique: async () => null,
      create: async () => ({ id: 12, type: "individual" }),
      update: async () => ({ id: 12, type: "individual" }),
    },
    lineUser: { update: async () => undefined },
    repair: {
      findMany: async () => [],
      create: async (args: unknown) => { createdRepairs.push(args); return { id: 300, inquiryNumber: "C-001" }; },
    },
    watch: { create: async (args: unknown) => { createdWatches.push(args); return { id: 200 }; } },
    repairStatusLog: { create: async () => undefined },
    inquiryWatch: {
      findMany: async () => reviewWatches,
      update: async (args: { where: { id: number }; data: Record<string, unknown> }) => {
        updatedInquiryWatches.push(args);
        const updated = reviewWatches.find((item) => item.id === args.where.id);
        if (updated) Object.assign(updated, args.data);
        return undefined;
      },
    },
    inquiry: { update: async (args: unknown) => { updatedInquiries.push(args); return undefined; } },
    brand: { findUnique: async () => ({ id: 10 }), findMany: async () => [] },
  };
  return {
    db: { $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) },
    createdWatches, createdRepairs, updatedInquiryWatches, updatedInquiries,
  };
}

test("submits an Inquiry-bound invite without customer watch fields and promotes its formal master IDs", async () => {
  const fixture = inquirySubmitDb(requestedInquiryWatch(1));
  const result = await submitRepairIntake("bound-token", { customer: customerInput, returnAddressSameAsCustomer: true }, fixture.db as never);

  assert.deepEqual(result.repairs, [{ id: 300, inquiryNumber: "C-001" }]);
  assert.deepEqual(fixture.createdWatches, [{ data: { customerId: 12, brandId: 10, modelId: 20, referenceId: 30, caseReferenceId: 31, caliberId: 40, baseCaliberId: 41 } }]);
  assert.equal((fixture.createdRepairs[0] as { data: { status: string } }).data.status, REPAIR_INTAKE_STATUS);
  assert.equal((fixture.updatedInquiryWatches[0] as { where: { id: number } }).where.id, 1);
  assert.deepEqual(fixture.updatedInquiries, [{ where: { id: 70 }, data: { status: "CLOSED" } }]);
});

test("rejects an Inquiry-bound invite when a bound watch is no longer requested", async () => {
  const fixture = inquirySubmitDb(requestedInquiryWatch(1, { decision: "PENDING" }));
  await assert.rejects(
    () => submitRepairIntake("bound-token", { customer: customerInput, returnAddressSameAsCustomer: true }, fixture.db as never),
    (error: unknown) => error instanceof RepairIntakeError && error.code === "INQUIRY_NOT_READY",
  );
  assert.equal(fixture.createdWatches.length, 0);
  assert.equal(fixture.createdRepairs.length, 0);
});

test("rejects an Inquiry-bound invite when the post-lock watch decision changed", async () => {
  for (const decision of ["PENDING", "DECLINED"]) {
    const fixture = inquirySubmitDb(requestedInquiryWatch(1), [requestedInquiryWatch(1, { decision })]);
    await assert.rejects(
      () => submitRepairIntake("bound-token", { customer: customerInput, returnAddressSameAsCustomer: true }, fixture.db as never),
      (error: unknown) => error instanceof RepairIntakeError && error.code === "INQUIRY_NOT_READY",
    );
    assert.equal(fixture.createdWatches.length, 0);
    assert.equal(fixture.createdRepairs.length, 0);
  }
});
