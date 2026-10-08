import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { buildCustomerShareUrl } from "@/lib/customer-share-url";
import { prisma } from "@/lib/prisma";
import { InvoiceLineSendError, sendInvoiceLine } from "@/lib/invoice-line-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceLineRow = {
  id: number;
  invoiceNumber: string;
  status: string;
  billingMonth: string | null;
  publicToken: string | null;
  publicTokenCreatedAt: Date | null;
  currentPdfFileId: number | null;
  sentAt: Date | null;
  lineSendRetryKey: string | null;
  lineSendStartedAt: Date | null;
  lineSendPdfFileId: number | null;
  lineSendTo: string | null;
  lineSendMessage: string | null;
  customerId: number;
  lineId: string | null;
  storageKey: string | null;
  pdfStatus: string | null;
};

type DeliveryDateRow = {
  issuedDate: Date | null;
};

async function ensureInvoicePublicToken(invoiceId: number) {
  const [existing] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
    SELECT "publicToken"
    FROM "Invoice"
    WHERE "id" = ${invoiceId}
    LIMIT 1
  `;

  if (existing?.publicToken) {
    return existing.publicToken;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("base64url");
    const updated = await prisma.$executeRaw`
      UPDATE "Invoice"
      SET "publicToken" = ${token},
          "publicTokenCreatedAt" = NOW()
      WHERE "id" = ${invoiceId}
        AND "publicToken" IS NULL
    `;

    if (updated === 1) {
      return token;
    }

    const [current] = await prisma.$queryRaw<{ publicToken: string | null }[]>`
      SELECT "publicToken"
      FROM "Invoice"
      WHERE "id" = ${invoiceId}
      LIMIT 1
    `;

    if (current?.publicToken) {
      return current.publicToken;
    }
  }

  throw new Error("Failed to create invoice public token");
}

function formatBillingMonth(billingMonth: string | null, deliveryDates: DeliveryDateRow[]) {
  if (billingMonth) {
    const match = billingMonth.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      return `${match[1]}年${Number(match[2])}月分`;
    }

    return billingMonth;
  }

  const firstIssuedDate = deliveryDates
    .map((row) => row.issuedDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!firstIssuedDate) {
    return "請求書";
  }

  return `${firstIssuedDate.getFullYear()}年${firstIssuedDate.getMonth() + 1}月分`;
}

function buildInvoiceMessage(billingMonthLabel: string, sharedUrl: string) {
  return `いつもお世話になり有難うございます。
${billingMonthLabel}の請求書を発行いたしました。

下記URLより請求書PDFをご確認ください。
${sharedUrl}

よろしくお願いいたします。`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const invoiceId = Number((await params).id);

  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).sort().join(",") !== "expectedRevision,operationKey"
    || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision > 2147483647
    || typeof body.operationKey !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationKey)) {
    return NextResponse.json({ ok: false, error: "Invalid LINE operation key", uncertain: false }, { status: 400 });
  }
  const operationKey: string = body.operationKey;
  const expectedRevision: number = body.expectedRevision;

  const [invoice] = await prisma.$queryRaw<InvoiceLineRow[]>`
    SELECT
      i."id",
      i."invoiceNumber",
      i."status",
      i."billingMonth",
      i."publicToken",
      i."publicTokenCreatedAt",
      i."currentPdfFileId",
      i."sentAt",
      i."lineSendRetryKey",
      i."lineSendStartedAt",
      i."lineSendPdfFileId",
      i."lineSendTo",
      i."lineSendMessage",
      i."customerId",
      c."lineId",
      f."storageKey",
      f."status" AS "pdfStatus"
    FROM "Invoice" i
    INNER JOIN "Customer" c ON c."id" = i."customerId"
    LEFT JOIN "InvoicePdfFile" f ON f."id" = i."currentPdfFileId"
    WHERE i."id" = ${invoiceId}
    LIMIT 1
  `;

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  // The provider and finalization may have succeeded even if the browser lost our response.
  if (invoice.lineSendRetryKey === operationKey && !invoice.lineSendStartedAt
    && !invoice.lineSendPdfFileId && !invoice.lineSendTo && !invoice.lineSendMessage
    && invoice.sentAt && invoice.publicToken) {
    return NextResponse.json({ ok: true, invoiceId: invoice.id,
      sharedUrl: buildCustomerShareUrl(`/customer/invoices/${invoice.publicToken}`, request.url),
      sentAt: invoice.sentAt.toISOString() });
  }

  if (!["issued", "paid"].includes(invoice.status)) {
    return NextResponse.json(
      { ok: false, error: "Canceled invoice cannot be sent by LINE" },
      { status: 409 },
    );
  }

  if (!invoice.currentPdfFileId || !invoice.storageKey) {
    return NextResponse.json(
      { ok: false, error: "Invoice PDF not generated" },
      { status: 400 }
    );
  }

  const lineUserId = invoice.lineId?.trim() ?? null;

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured" },
      { status: 500 }
    );
  }

  let publicToken: string;
  try {
    publicToken = await ensureInvoicePublicToken(invoice.id);
  } catch (error) {
    console.error("Invoice public token creation failed", {
      invoiceId: invoice.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to create invoice share URL" },
      { status: 500 }
    );
  }

  const deliveryDates = await prisma.$queryRaw<DeliveryDateRow[]>`
    SELECT dn."issuedDate"
    FROM "Repair" r
    LEFT JOIN "DeliveryNote" dn ON dn."id" = r."deliveryNoteId"
    WHERE r."invoiceId" = ${invoice.id}
  `;
  const billingMonthLabel = formatBillingMonth(invoice.billingMonth, deliveryDates);
  const sharedUrl = buildCustomerShareUrl(
    `/customer/invoices/${publicToken}`,
    request.url
  );

  let sentAt: Date;
  try {
    sentAt = await sendInvoiceLine(prisma, { invoiceId: invoice.id, pdfFileId: invoice.currentPdfFileId,
      publicToken, to: lineUserId, message: buildInvoiceMessage(billingMonthLabel, sharedUrl), accessToken,
      operationKey, expectedRevision });
  } catch (error) {
    if (error instanceof InvoiceLineSendError) return NextResponse.json({ ok: false, error: error.message,
      retryable: error.uncertain, uncertain: error.uncertain,
      manualVerificationRequired: error.manualVerificationRequired,
      staleRevision: error.staleRevision }, { status: error.status });
    console.error("LINE invoice send failed", { invoiceId: invoice.id, error });
    return NextResponse.json({ ok: false, error: "LINE send status is uncertain. Retry the same operation",
      retryable: true, uncertain: true }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    invoiceId: invoice.id,
    sharedUrl,
    sentAt: sentAt.toISOString(),
  });
}
