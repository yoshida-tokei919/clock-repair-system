import { hasConsistentInvoiceSnapshots, invoicePdfRepairAmount } from "@/lib/invoice-repair-snapshots";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { renderInvoicePdfBuffer } from "@/lib/invoice-pdf-render";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { authOptions } from "@/lib/auth";
import {
  buildInvoicePdfStorageKey,
  calculateInvoicePdfHash,
  deleteInvoicePdf,
  uploadInvoicePdf,
} from "@/lib/invoice-pdf-storage";
import { publishInvoicePdf } from "@/lib/invoice-pdf-publication";
import { prisma } from "@/lib/prisma";
import { displayIssuedDate, parseIssuedDate } from "@/lib/document-issued-date";
import { invoicePdfParties } from "@/lib/invoice-recipient";
import { historicalCreditSnapshot, historicalRefundAllocationSelect } from "@/lib/b2b-historical-refund-allocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getInvoicePdfFileName(invoiceNumber: string) {
  return `invoice_${invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
}

function buildInvoicePdfData(invoice: NonNullable<Awaited<ReturnType<typeof findInvoiceForPdf>>>, requestedDate?: Date) {
  const parties = invoicePdfParties(invoice);
  const deliveryGroups = new Map<
    string,
    {
      slipNumber: string;
      date: Date;
      repairCount: number;
      amount: number;
    }
  >();

  const rows = hasConsistentInvoiceSnapshots(invoice) ? invoice.repairSnapshots : [];
  for (const row of rows) {
    const groupKey = row.deliveryNoteId
      ? `delivery-note-id:${row.deliveryNoteId}`
      : row.deliverySlipNumber
        ? `delivery-note-slip:${row.deliverySlipNumber}`
        : "unlinked-delivery-note";
    const groupDate = row.deliveryIssuedDate || row.deliveryDateActual || invoice.issuedDate;
    const existing = deliveryGroups.get(groupKey);
    if (existing) {
      existing.repairCount += 1;
      existing.amount += invoicePdfRepairAmount(row, invoice.pricingTaxMode as "EXCLUSIVE" | "INCLUSIVE");
      if (groupDate < existing.date) existing.date = groupDate;
    } else {
      deliveryGroups.set(groupKey, {
        slipNumber: row.deliverySlipNumber || "未紐付け",
        date: groupDate,
        repairCount: 1,
        amount: invoicePdfRepairAmount(row, invoice.pricingTaxMode as "EXCLUSIVE" | "INCLUSIVE"),
      });
    }
  }

  const invoiceItems = Array.from(deliveryGroups.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((group) => ({
      date: displayIssuedDate(group.date),
      slipNumber: group.slipNumber,
      description: `${group.repairCount}点`,
      amount: group.amount,
    }));

  const repairsById = new Map(invoice.repairs.map((repair) => [repair.id, repair]));
  const b2cJobs = rows.map((row) => {
    const repair = repairsById.get(row.repairId);
    return {
      inquiryNumber: row.inquiryNumber,
      watch: {
        brand: repair?.watch.brand.name ?? "",
        timepieceType: repair?.watch.timepieceType,
        timepieceTypeLabel: repair?.watch.timepieceTypeLabel,
        model: repair?.watch.model?.name ?? repair?.watch.modelNameInput ?? "",
        ref: repair?.watch.reference?.name ?? undefined,
        caseRef: repair?.watch.caseReference?.name ?? undefined,
        serial: repair?.watch.serialNumber ?? undefined,
      },
      workDescriptions: (repair?.estimate?.items ?? []).map(
        (item) => item.b2cDisplayNameSnapshot || item.itemName,
      ),
      // The issued snapshot is authoritative; do not derive an amount from estimate items.
      amount: row.subtotalAmount,
    };
  });

  return {
    invoiceNumber: invoice.invoiceNumber,
    date: displayIssuedDate(requestedDate ?? invoice.issuedDate),
    dueDate: invoice.paymentDueDate?.toLocaleDateString("ja-JP") || "",
    customer: parties.recipient,
    sourceCustomerName: parties.sourceCustomerName,
    items: invoiceItems,
    taxRate: 0.1,
    pricingTaxMode: invoice.pricingTaxMode,
    subtotalAmount: invoice.totalAmount,
    discountBasisAmount: invoice.discountBasisAmount,
    discountRateBps: invoice.discountRateBps,
    discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    shippingFeeAmount: invoice.shippingFeeAmount,
    grossTotalAmount: invoice.grossTotalAmount,
    historicalRefundCredits: invoice.customer.type === "business" ? invoice.historicalRefundAllocations
      .filter(row => row.status === "ACTIVE").map(row => ({ amount: row.amount, reference: row.refund.originalSaleReference })) : [],
    prepaymentAppliedAmount: invoice.paymentAllocations.reduce((sum, allocation) =>
      sum + (allocation.payment.kind === "REPAIR_PREPAYMENT" && allocation.payment.status === "SUCCEEDED"
        ? allocation.allocatedAmount - allocation.releases.reduce((released, row) => released + row.amount, 0) : 0), 0),
    bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ",
    b2cJobs,
  } satisfies InvoiceDocumentProps["data"];
}

function findInvoiceForPdf(invoiceId: number) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      billingCustomer: true,
      repairSnapshots: true,
      paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
        payment: { select: { kind: true, status: true } } } },
      historicalRefundAllocations: { select: historicalRefundAllocationSelect, orderBy: { id: "asc" } },
      repairs: {
        include: {
          watch: { include: { brand: true, model: true, reference: true, caseReference: true } },
          estimate: { include: { items: true } },
        },
      },
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const session = await getServerSession(authOptions);

  const invoiceId = Number((await params).id);

  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const invoice = await findInvoiceForPdf(invoiceId);

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  let requestedDate: Date | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.issuedDate !== undefined) requestedDate = parseIssuedDate(body.issuedDate);
  } catch {
    return NextResponse.json({ ok: false, error: "有効な発行日を指定してください" }, { status: 400 });
  }

  if (!["issued", "paid"].includes(invoice.status)) {
    return NextResponse.json(
      { ok: false, error: "取消済みの請求書はPDFを再生成できません。保存済みPDFをご確認ください。" },
      { status: 409 },
    );
  }

  if (!hasConsistentInvoiceSnapshots(invoice)) {
    return NextResponse.json(
      { ok: false, error: "発行時明細が未保存、または確定額と一致しないため再生成できません。保存済みPDFをご確認ください。" },
      { status: 409 },
    );
  }
  if (invoice.customer.type === "business") {
    try {
      const credit = historicalCreditSnapshot(invoice.customerId, invoice.historicalRefundAllocations);
      if (credit.offsetCreditAmount > invoice.grossTotalAmount) throw new Error("credit exceeds gross");
    } catch {
      return NextResponse.json({ ok: false, error: "履歴返金の相殺額を確認できません" }, { status: 409 });
    }
  }

  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderInvoicePdfBuffer(buildInvoicePdfData(invoice, requestedDate));
  } catch (error) {
    console.error("Invoice PDF render failed", {
      invoiceId: invoice.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Invoice PDF generation failed" },
      { status: 500 }
    );
  }

  const fileName = getInvoicePdfFileName(invoice.invoiceNumber);
  const generatedBy = session?.user?.email ?? session?.user?.name ?? null;

  let pdfFile: { id: number; version: number } | undefined;

  try {
    [pdfFile] = await prisma.$queryRaw<{ id: number; version: number }[]>`
      WITH next_version AS (
        SELECT COALESCE(MAX("version"), 0) + 1 AS "version"
        FROM "InvoicePdfFile"
        WHERE "invoiceId" = ${invoice.id}
      )
      INSERT INTO "InvoicePdfFile" (
        "invoiceId",
        "customerId",
        "storageKey",
        "fileName",
        "version",
        "status",
        "generatedBy",
        "updatedAt"
      )
      SELECT
        ${invoice.id},
        ${invoice.customerId},
        '',
        ${fileName},
        "version",
        'draft',
        ${generatedBy},
        NOW()
      FROM next_version
      RETURNING "id", "version"
    `;
  } catch (error) {
    console.error("Invoice PDF record creation failed", {
      invoiceId: invoice.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to create invoice PDF record" },
      { status: 500 }
    );
  }

  if (!pdfFile) {
    return NextResponse.json(
      { ok: false, error: "Failed to create invoice PDF record" },
      { status: 500 }
    );
  }

  const storageKey = buildInvoicePdfStorageKey(invoice.id, pdfFile.id);
  const hash = calculateInvoicePdfHash(pdfBuffer);
  try {
    await uploadInvoicePdf(storageKey, pdfBuffer);
  } catch (error) {
    console.error("Invoice PDF upload failed", {
      invoiceId: invoice.id,
      pdfFileId: pdfFile.id,
      storageKey,
      error,
    });
    try {
      await prisma.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "status" = 'void',
            "supersededAt" = NOW()
        WHERE "id" = ${pdfFile.id} AND "status" = 'draft'
          AND NOT EXISTS (
            SELECT 1 FROM "Invoice" WHERE "id" = ${invoice.id} AND "currentPdfFileId" = ${pdfFile.id}
          )
      `;
    } catch (voidError) {
      console.error("Invoice PDF void marker failed", {
        invoiceId: invoice.id,
        pdfFileId: pdfFile.id,
        error: voidError,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Invoice PDF generation failed" },
      { status: 500 }
    );
  }

  const publication = await publishInvoicePdf(prisma, {
    invoiceId: invoice.id,
    pdfFileId: pdfFile.id,
    storageKey,
    hash,
    fileSize: pdfBuffer.byteLength,
    expectedIssuedDate: invoice.issuedDate,
    requestedIssuedDate: requestedDate,
  }, deleteInvoicePdf);
  if (publication === "uncertain") {
    return NextResponse.json(
      { ok: false, uncertain: true, error: "PDF公開結果が不明です。再生成せず、管理者がDBと保存先を確認してください。" },
      { status: 503 },
    );
  }
  if (publication === "failed") {
    return NextResponse.json(
      { ok: false, error: "Invoice PDF generation failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    pdfFileId: pdfFile.id,
    invoiceId: invoice.id,
    storageKey,
    version: pdfFile.version,
    status: "current",
  });
}
