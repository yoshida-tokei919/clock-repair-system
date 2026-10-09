import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";

import { downloadInvoicePdf } from "@/lib/invoice-pdf-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/[\r\n"\\]/g, "_");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const invoiceId = Number((await params).id);

  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ ok: false, error: "Invalid invoice id" }, { status: 400 });
  }

  const [invoice] = await prisma.$queryRaw<
    {
      id: number;
      currentPdfFileId: number | null;
      storageKey: string | null;
      fileName: string | null;
      contentType: string | null;
    }[]
  >`
    SELECT
      i."id",
      i."currentPdfFileId",
      f."storageKey",
      f."fileName",
      f."contentType"
    FROM "Invoice" i
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
      { status: 404 }
    );
  }

  try {
    const pdfBuffer = await downloadInvoicePdf(invoice.storageKey);
    const fileName = contentDispositionFileName(
      invoice.fileName || `invoice_${invoice.id}.pdf`
    );

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": invoice.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF download failed", {
      invoiceId,
      pdfFileId: invoice.currentPdfFileId,
      storageKey: invoice.storageKey,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Invoice PDF download failed" },
      { status: 500 }
    );
  }
}
