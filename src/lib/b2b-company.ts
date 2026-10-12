import type { Customer, PrismaClient } from "@prisma/client";

export class B2BCompanyError extends Error {}

export function assertBusinessCustomer(customer: Pick<Customer, "id" | "type"> | null): asserts customer is Pick<Customer, "id" | "type"> {
  if (!customer || customer.type !== "business") {
    throw new B2BCompanyError("会社に所属できるのは業者顧客のみです。");
  }
}

export function assertBillingMembership(
  companyId: number,
  member: { companyId: number; customer: Pick<Customer, "id" | "type"> } | null,
) {
  if (!member || member.companyId !== companyId || member.customer.type !== "business") {
    throw new B2BCompanyError("請求先は同じ会社に所属する業者顧客を選択してください。");
  }
}

/** Only an intact one-store group can return to standalone billing. */
export function assertDissolvableCompany(
  customerId: number,
  company: { billingCustomerId: number | null } | null,
  members: readonly { customerId: number }[],
) {
  if (!company || company.billingCustomerId !== customerId || members.length !== 1 || members[0].customerId !== customerId) {
    throw new B2BCompanyError("単独店舗で請求先がこの顧客の会社のみ解除できます。再読み込みして確認してください。");
  }
}

export type BillingCustomerResolution = {
  sourceCustomerId: number;
  companyId: number | null;
  billingCustomerId: number;
};

/** Task207C contract: resolve billing identity only; never change Repair/Shipment ownership. */
export async function resolveEffectiveBillingCustomer(
  db: Pick<PrismaClient, "customer" | "b2BCompanyMembership">,
  sourceCustomerId: number,
): Promise<BillingCustomerResolution> {
  const source = await db.customer.findUnique({
    where: { id: sourceCustomerId },
    select: { id: true, type: true },
  });
  if (!source) throw new B2BCompanyError("依頼元顧客が見つかりません。");

  const membership = await db.b2BCompanyMembership.findUnique({
    where: { customerId: sourceCustomerId },
    include: { company: { include: { billingMembership: { include: { customer: { select: { id: true, type: true } } } } } } },
  });
  if (!membership) {
    return { sourceCustomerId, companyId: null, billingCustomerId: sourceCustomerId };
  }
  assertBusinessCustomer(source);
  const company = membership.company;
  assertBillingMembership(company.id, company.billingMembership);
  if (company.billingCustomerId !== company.billingMembership!.customerId) {
    throw new B2BCompanyError("会社の請求先設定が不整合です。");
  }
  return { sourceCustomerId, companyId: company.id, billingCustomerId: company.billingCustomerId! };
}
