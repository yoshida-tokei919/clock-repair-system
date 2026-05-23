import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceLineRow = {
  id: number;
  invoiceNumber: string;
  billingMonth: string | null;
  publicToken: string | null;
  publicTokenCreatedAt: Date | null;
  currentPdfFileId: number | null;
  sentAt: Date | null;
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

function getAppBaseUrl(request: NextRequest) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const requestUrl = new URL(request.url);
  return requestUrl.origin;
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
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const invoiceId = Number(params.id);

  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const [invoice] = await prisma.$queryRaw<InvoiceLineRow[]>`
    SELECT
      i."id",
      i."invoiceNumber",
      i."billingMonth",
      i."publicToken",
      i."publicTokenCreatedAt",
      i."currentPdfFileId",
      i."sentAt",
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

  if (!invoice.currentPdfFileId || !invoice.storageKey) {
    return NextResponse.json(
      { ok: false, error: "Invoice PDF not generated" },
      { status: 400 }
    );
  }

  const lineUserId = invoice.lineId?.trim();
  if (!lineUserId) {
    return NextResponse.json(
      { ok: false, error: "LINE destination not configured" },
      { status: 400 }
    );
  }

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
  const sharedUrl = new URL(
    `/customer/invoices/${publicToken}`,
    getAppBaseUrl(request)
  ).toString();

  const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [
        {
          type: "text",
          text: buildInvoiceMessage(billingMonthLabel, sharedUrl),
        },
      ],
    }),
  });

  if (!lineResponse.ok) {
    const lineError = await lineResponse.text();
    console.error("LINE invoice send failed", {
      invoiceId: invoice.id,
      status: lineResponse.status,
      body: lineError,
    });

    return NextResponse.json(
      { ok: false, error: "LINE send failed" },
      { status: 502 }
    );
  }

  const sentAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Invoice"
      SET "sentAt" = ${sentAt}
      WHERE "id" = ${invoice.id}
    `;

    await tx.$executeRaw`
      UPDATE "InvoicePdfFile"
      SET "sentAt" = ${sentAt}
      WHERE "id" = ${invoice.currentPdfFileId}
    `;
  });

  return NextResponse.json({
    ok: true,
    invoiceId: invoice.id,
    sharedUrl,
    sentAt: sentAt.toISOString(),
  });
}
