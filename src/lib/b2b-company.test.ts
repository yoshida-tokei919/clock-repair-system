import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  assertBillingMembership, assertBusinessCustomer, assertDissolvableCompany, B2BCompanyError, resolveEffectiveBillingCustomer,
} from "./b2b-company";

test("membership accepts business stores and rejects B2C", () => {
  assert.doesNotThrow(() => assertBusinessCustomer({ id: 1, type: "business" }));
  assert.throws(() => assertBusinessCustomer({ id: 2, type: "individual" }), B2BCompanyError);
  assert.throws(() => assertBusinessCustomer(null), B2BCompanyError);
});

test("billing destination must be a business member of the same company", () => {
  assert.doesNotThrow(() => assertBillingMembership(10, { companyId: 10, customer: { id: 1, type: "business" } }));
  assert.throws(() => assertBillingMembership(10, { companyId: 11, customer: { id: 1, type: "business" } }), B2BCompanyError);
  assert.throws(() => assertBillingMembership(10, { companyId: 10, customer: { id: 2, type: "individual" } }), B2BCompanyError);
  assert.throws(() => assertBillingMembership(10, null), B2BCompanyError);
});

test("only the sole billing member can dissolve a company", () => {
  const company = { billingCustomerId: 4 };
  assert.doesNotThrow(() => assertDissolvableCompany(4, company, [{ customerId: 4 }]));
  assert.throws(() => assertDissolvableCompany(4, company, []), B2BCompanyError);
  assert.throws(() => assertDissolvableCompany(4, company, [{ customerId: 4 }, { customerId: 5 }]), B2BCompanyError);
  assert.throws(() => assertDissolvableCompany(4, company, [{ customerId: 5 }]), B2BCompanyError);
  assert.throws(() => assertDissolvableCompany(4, { billingCustomerId: 5 }, [{ customerId: 4 }]), B2BCompanyError);
  assert.throws(() => assertDissolvableCompany(4, null, [{ customerId: 4 }]), B2BCompanyError);
});

function db(sourceType: string, membership: unknown) {
  return {
    customer: { findUnique: async () => ({ id: 4, type: sourceType }) },
    b2BCompanyMembership: { findUnique: async () => membership },
  } as unknown as Pick<PrismaClient, "customer" | "b2BCompanyMembership">;
}

test("standalone B2B and B2C resolve to the source Customer", async () => {
  for (const type of ["business", "individual"]) {
    assert.deepEqual(await resolveEffectiveBillingCustomer(db(type, null), 4), {
      sourceCustomerId: 4, companyId: null, billingCustomerId: 4,
    });
  }
});

test("grouped store resolves the designated billing member", async () => {
  const membership = {
    companyId: 10,
    company: {
      id: 10, billingCustomerId: 5,
      billingMembership: { companyId: 10, customerId: 5, customer: { id: 5, type: "business" } },
    },
  };
  assert.deepEqual(await resolveEffectiveBillingCustomer(db("business", membership), 4), {
    sourceCustomerId: 4, companyId: 10, billingCustomerId: 5,
  });
  await assert.rejects(resolveEffectiveBillingCustomer(db("individual", membership), 4), B2BCompanyError);
  await assert.rejects(resolveEffectiveBillingCustomer(db("business", {
    ...membership, company: { ...membership.company, billingMembership: { ...membership.company.billingMembership, companyId: 11 } },
  }), 4), B2BCompanyError);
  await assert.rejects(resolveEffectiveBillingCustomer(db("business", {
    ...membership, company: { ...membership.company, billingMembership: null },
  }), 4), B2BCompanyError);
});
