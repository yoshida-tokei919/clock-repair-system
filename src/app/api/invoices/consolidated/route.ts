import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { ConsolidatedInvoiceError, createConsolidatedInvoice } from "@/lib/consolidated-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const [invoices, bundles] = await Promise.all([
    prisma.invoice.findMany({ where: { status: { in: ["issued", "paid"] }, consolidatedSource: null,
      customer: { type: "business", b2bCompanyMembership: { isNot: null } } },
    select: { id: true, invoiceNumber: true, grossTotalAmount: true, issuedDate: true,
      customer: { select: { id: true, name: true, companyName: true,
        b2bCompanyMembership: { select: { companyId: true,
          company: { select: { name: true, billingCustomerId: true } } } } } } },
    orderBy: { issuedDate: "desc" }, take: 300 }),
    prisma.consolidatedInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 100,
      include: { sources: { include: { deliveryNotes: true }, orderBy: { id: "asc" } } } }),
  ]);
  const eligible = invoices.filter(invoice => invoice.customer.b2bCompanyMembership?.company.billingCustomerId != null)
    .map(invoice => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber,
      grossTotalAmount: invoice.grossTotalAmount, issuedDate: invoice.issuedDate,
      sourceCustomerId: invoice.customer.id,
      sourceCustomerName: invoice.customer.companyName || invoice.customer.name,
      companyId: invoice.customer.b2bCompanyMembership!.companyId,
      companyName: invoice.customer.b2bCompanyMembership!.company.name,
      billingCustomerId: invoice.customer.b2bCompanyMembership!.company.billingCustomerId! }));
  return NextResponse.json({ eligible, bundles });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  const input = body as { invoiceIds?: unknown; companyId?: unknown; billingCustomerId?: unknown };
  if (!Array.isArray(input.invoiceIds) || typeof input.companyId !== "number" || typeof input.billingCustomerId !== "number") {
    return NextResponse.json({ error: "会社・請求先と請求書を選択してください。" }, { status: 400 });
  }
  try {
    const bundle = await createConsolidatedInvoice(prisma, {
      invoiceIds: input.invoiceIds, companyId: input.companyId, billingCustomerId: input.billingCustomerId,
    });
    return NextResponse.json(bundle, { status: 201 });
  } catch (error) {
    if (error instanceof ConsolidatedInvoiceError) return NextResponse.json({ error: error.message }, { status: 409 });
    // Unique-source and serializable conflicts both require a refreshed selection.
    console.error("Consolidated invoice creation failed", error);
    return NextResponse.json({ error: "請求書の状態が変更されました。再読み込みしてください。" }, { status: 409 });
  }
}
