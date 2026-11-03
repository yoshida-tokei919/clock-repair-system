import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { ConsolidatedInvoiceError, createConsolidatedInvoice } from "@/lib/consolidated-invoice";
import { calculateInvoicePaymentSummary } from "@/lib/invoice-payment";
import { consolidatedDeliveryKey, consolidatedPaymentTotals } from "@/lib/consolidated-invoice-operations";
import { invoiceDeliveryKey, resolveInvoiceLineDestination } from "@/lib/invoice-delivery-routing";
import { isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";

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
      include: { publication: { select: { status: true, publicToken: true, storageKey: true, hash: true, fileSize: true, publishedAt: true } },
        sources: { include: { deliveryNotes: true, invoice: { select: { id: true, invoiceNumber: true, customerId: true,
          issuedDate: true, totalAmount: true, taxAmount: true, shippingFeeAmount: true,
          sentAt: true, lineSendRetryKey: true, lineSendStartedAt: true, pdfFiles: { select: { sentAt: true } },
          status: true, grossTotalAmount: true,
          paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
            payment: { select: { status: true, kind: true, refunds: { select: { amount: true, status: true } } } } } } } } }, orderBy: { id: "asc" } } } }),
  ]);
  const eligible = invoices.filter(invoice => invoice.customer.b2bCompanyMembership?.company.billingCustomerId != null)
    .map(invoice => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber,
      grossTotalAmount: invoice.grossTotalAmount, issuedDate: invoice.issuedDate,
      sourceCustomerId: invoice.customer.id,
      sourceCustomerName: invoice.customer.companyName || invoice.customer.name,
      companyId: invoice.customer.b2bCompanyMembership!.companyId,
      companyName: invoice.customer.b2bCompanyMembership!.company.name,
      billingCustomerId: invoice.customer.b2bCompanyMembership!.company.billingCustomerId! }));
  const sourceIds = bundles.flatMap(bundle => bundle.sources.map(source => source.invoiceId));
  const [deliveryRows, prepayments] = await Promise.all([
    prisma.lineManagerSendOutbox.findMany({ where: { idempotencyKey: { in: [
      ...bundles.map(bundle => consolidatedDeliveryKey(bundle.id)), ...sourceIds.map(invoiceDeliveryKey),
    ] } },
      select: { idempotencyKey: true, status: true } }),
    prisma.payment.findMany({ where: { kind: "REPAIR_PREPAYMENT", repair: { invoiceId: { in: sourceIds } } },
      select: { repair: { select: { invoiceId: true } } } }),
  ]);
  const deliveryByKey = new Map(deliveryRows.map(row => [row.idempotencyKey, row.status]));
  const prepaymentInvoiceIds = new Set(prepayments.map(row => row.repair?.invoiceId));
  const result = await Promise.all(bundles.map(async bundle => {
    let sourceSafe = bundle.sources.length >= 2;
    let legacyDeliverySafe = true;
    let unpaidSafe = true;
    const sources = bundle.sources.map(({ invoice, ...source }) => {
      const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
      sourceSafe &&= (invoice.status === "issued" || invoice.status === "paid") && invoice.invoiceNumber === source.invoiceNumber &&
        invoice.customerId === source.sourceCustomerId && invoice.issuedDate.getTime() === source.issuedDate.getTime() &&
        invoice.totalAmount === source.totalAmount && invoice.taxAmount === source.taxAmount &&
        invoice.shippingFeeAmount === source.shippingFeeAmount && invoice.grossTotalAmount === source.grossTotalAmount &&
        source.grossTotalAmount > 0 && source.grossTotalAmount === source.totalAmount + source.taxAmount + source.shippingFeeAmount;
      unpaidSafe &&= invoice.status === "issued" && summary.outstandingBalance === source.grossTotalAmount &&
        invoice.paymentAllocations.length === 0 && !prepaymentInvoiceIds.has(invoice.id);
      legacyDeliverySafe &&= !invoice.sentAt && !invoice.lineSendRetryKey &&
        !invoice.lineSendStartedAt && !invoice.pdfFiles.some(file => file.sentAt) &&
        !deliveryByKey.has(invoiceDeliveryKey(invoice.id));
      return { ...source, paidAmount: summary.paidAmount, outstandingBalance: summary.outstandingBalance,
        paymentStatus: summary.outstandingBalance === 0 ? "PAID" : summary.paidAmount > 0 ? "PARTIAL" : "UNPAID" };
    });
    const { paidAmount, outstandingBalance, paymentStatus } = consolidatedPaymentTotals(sources);
    const outboxStatus = deliveryByKey.get(consolidatedDeliveryKey(bundle.id));
    const pdfReady = isCurrentConsolidatedPdf(bundle.publication) && !!bundle.publication.publishedAt &&
      validConsolidatedShareToken(bundle.publication.publicToken);
    sourceSafe &&= sources.reduce((sum, source) => sum + source.grossTotalAmount, 0) === bundle.grossTotalAmount;
    const operationalSafe = sourceSafe && legacyDeliverySafe;
    const newDeliverySafe = operationalSafe && unpaidSafe && paymentStatus === "UNPAID";
    const destination = outboxStatus || !pdfReady || !newDeliverySafe ? null : await resolveInvoiceLineDestination(prisma, bundle.billingCustomerId);
    return { ...bundle, sources, paidAmount, outstandingBalance,
      paymentStatus,
      deliveryMethod: outboxStatus ? "LINE" : !operationalSafe ? "BLOCKED" : !newDeliverySafe ? "NONE" : destination ? "LINE" : "POSTAL",
      deliveryStatus: outboxStatus ?? (!operationalSafe ? "BLOCKED" : !newDeliverySafe ? "NO_NEW_DELIVERY" : destination ? "READY" : "PRINT_PENDING"), pdfReady,
      canConfirmPayment: operationalSafe && unpaidSafe && paymentStatus === "UNPAID", operationalSafe };
  }));
  return NextResponse.json({ eligible, bundles: result });
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
