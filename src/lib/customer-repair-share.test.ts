import assert from "node:assert/strict";
import test from "node:test";

import { resolveCustomerRepairShareScope } from "./customer-repair-share";

function dbFixture(
  anchor: { id: number; customerId: number; repairIntakeInviteId: number | null; customer: { type: string } } | null,
  siblings: Array<{ id: number; publicToken: string | null }> = [],
) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      repair: {
        findUnique: async (args: unknown) => {
          calls.push({ kind: "findUnique", args });
          return anchor;
        },
        findMany: async (args: unknown) => {
          calls.push({ kind: "findMany", args });
          return siblings;
        },
      },
    },
  };
}

test("groups only tokenized B2C repairs from the same intake and customer", async () => {
  const fixture = dbFixture(
    { id: 12, customerId: 7, repairIntakeInviteId: 90, customer: { type: "individual" } },
    [{ id: 12, publicToken: "anchor" }, { id: 14, publicToken: "sibling" }],
  );

  const result = await resolveCustomerRepairShareScope(fixture.db, "anchor");
  assert.deepEqual(result, { anchorRepairId: 12, repairIds: [12, 14], grouped: true, customerId: 7, repairIntakeInviteId: 90 });
  assert.deepEqual(fixture.calls[1], {
    kind: "findMany",
    args: {
      where: { repairIntakeInviteId: 90, customerId: 7 },
      orderBy: { id: "asc" },
      select: { id: true, publicToken: true },
    },
  });
});

test("does not group B2B repair tokens", async () => {
  const fixture = dbFixture({ id: 12, customerId: 7, repairIntakeInviteId: 90, customer: { type: "business" } });
  const result = await resolveCustomerRepairShareScope(fixture.db, "anchor");
  assert.deepEqual(result, { anchorRepairId: 12, repairIds: [12], grouped: false });
  assert.equal(fixture.calls.length, 1);
});

test("does not group a Repair without an intake boundary", async () => {
  const fixture = dbFixture({ id: 12, customerId: 7, repairIntakeInviteId: null, customer: { type: "individual" } });
  const result = await resolveCustomerRepairShareScope(fixture.db, "anchor");
  assert.deepEqual(result, { anchorRepairId: 12, repairIds: [12], grouped: false });
  assert.equal(fixture.calls.length, 1);
});

test("fails closed to the anchor when a legacy sibling has no public token", async () => {
  const fixture = dbFixture(
    { id: 12, customerId: 7, repairIntakeInviteId: 90, customer: { type: "individual" } },
    [{ id: 12, publicToken: "anchor" }, { id: 14, publicToken: null }],
  );
  const result = await resolveCustomerRepairShareScope(fixture.db, "anchor");
  assert.deepEqual(result, { anchorRepairId: 12, repairIds: [12], grouped: false });
});

test("fails closed when the intake query no longer contains the anchor", async () => {
  const fixture = dbFixture(
    { id: 12, customerId: 7, repairIntakeInviteId: 90, customer: { type: "individual" } },
    [{ id: 14, publicToken: "sibling" }],
  );
  const result = await resolveCustomerRepairShareScope(fixture.db, "anchor");
  assert.deepEqual(result, { anchorRepairId: 12, repairIds: [12], grouped: false });
});

test("uses exact public-token lookup and rejects blank or unknown tokens", async () => {
  const blank = dbFixture(null);
  assert.equal(await resolveCustomerRepairShareScope(blank.db, "   "), null);
  assert.equal(blank.calls.length, 0);

  const unknown = dbFixture(null);
  assert.equal(await resolveCustomerRepairShareScope(unknown.db, "1"), null);
  assert.deepEqual(unknown.calls[0], {
    kind: "findUnique",
    args: {
      where: { publicToken: "1" },
      select: {
        id: true,
        customerId: true,
        repairIntakeInviteId: true,
        customer: { select: { type: true } },
      },
    },
  });
});
