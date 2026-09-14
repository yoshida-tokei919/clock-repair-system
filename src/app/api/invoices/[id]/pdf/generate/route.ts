import { hasConsistentInvoiceSnapshots } from "@/lib/invoice-repair-snapshots";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";

import { InvoiceDocument, type InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { authOptions } from "@/lib/auth";
import {
  buildInvoicePdfStorageKey,
  calculateInvoicePdfHash,
  deleteInvoicePdf,
  uploadInvoicePdf,
} from "@/lib/invoice-pdf-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getInvoicePdfFileName(invoiceNumber: string) {
  return `invoice_${invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function renderInvoicePdfBuffer(data: InvoiceDocumentProps["data"]) {
  const nodeRequire = eval("require") as NodeRequire;
  const ReactRuntime = nodeRequire("react");
  const renderer = nodeRequire("@react-pdf/renderer");
  const { Font, renderToStream } = renderer;

  Font.register({
    family: "Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = ReactRuntime.createElement(InvoiceDocument, { data });
  const stream = (await renderToStream(documentElement)) as NodeJS.ReadableStream;
  return streamToBuffer(stream);
}

function buildInvoicePdfData(invoice: NonNullable<Awaited<ReturnType<typeof findInvoiceForPdf>>>) {
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
      existing.amount += row.subtotalAmount;
      if (groupDate < existing.date) existing.date = groupDate;
    } else {
      deliveryGroups.set(groupKey, {
        slipNumber: row.deliverySlipNumber || "未紐付け",
        date: groupDate,
        repairCount: 1,
        amount: row.subtotalAmount,
      });
    }
  }

  const invoiceItems = Array.from(deliveryGroups.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((group) => ({
      date: group.date.toLocaleDateString("ja-JP"),
      slipNumber: group.slipNumber,
      description: `${group.repairCount}点`,
      amount: group.amount,
    }));

  return {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.issuedDate.toLocaleDateString("ja-JP"),
    dueDate: invoice.paymentDueDate?.toLocaleDateString("ja-JP") || "",
    customer: {
      name: invoice.customer.name,
      address: invoice.customer.address || undefined,
    },
    items: invoiceItems,
    taxRate: 0.1,
    subtotalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ",
  } satisfies InvoiceDocumentProps["data"];
}

function findInvoiceForPdf(invoiceId: number) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      repairSnapshots: true,
    },
  });
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const invoiceId = Number(params.id);

  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const invoice = await findInvoiceForPdf(invoiceId);

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  if (!hasConsistentInvoiceSnapshots(invoice)) {
    return NextResponse.json(
      { ok: false, error: "発行時明細が未保存、または確定額と一致しないため再生成できません。保存済みPDFをご確認ください。" },
      { status: 409 },
    );
  }

  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderInvoicePdfBuffer(buildInvoicePdfData(invoice));
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
  const generatedBy = session.user.email ?? session.user.name ?? null;

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
  let uploaded = false;

  try {
    await uploadInvoicePdf(storageKey, pdfBuffer);
    uploaded = true;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "status" = 'superseded',
            "supersededAt" = NOW()
        WHERE "invoiceId" = ${invoice.id}
          AND "status" = 'current'
          AND "id" <> ${pdfFile.id}
      `;

      await tx.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "storageKey" = ${storageKey},
            "fileSize" = ${pdfBuffer.byteLength},
            "hash" = ${hash},
            "status" = 'current'
        WHERE "id" = ${pdfFile.id}
      `;

      await tx.$executeRaw`
        UPDATE "Invoice"
        SET "currentPdfFileId" = ${pdfFile.id}
        WHERE "id" = ${invoice.id}
      `;
    });

    return NextResponse.json({
      ok: true,
      pdfFileId: pdfFile.id,
      invoiceId: invoice.id,
      storageKey,
      version: pdfFile.version,
      status: "current",
    });
  } catch (error) {
    console.error("Invoice PDF generation failed", {
      invoiceId: invoice.id,
      pdfFileId: pdfFile.id,
      storageKey,
      error,
    });

    if (uploaded) {
      try {
        await deleteInvoicePdf(storageKey);
      } catch (deleteError) {
        console.error("Invoice PDF cleanup failed", {
          invoiceId: invoice.id,
          pdfFileId: pdfFile.id,
          storageKey,
          error: deleteError,
        });
      }
    }

    try {
      await prisma.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "status" = 'void',
            "supersededAt" = NOW()
        WHERE "id" = ${pdfFile.id}
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
}
