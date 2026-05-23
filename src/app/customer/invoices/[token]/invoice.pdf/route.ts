import { downloadInvoicePdf } from "@/lib/invoice-pdf-storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicInvoicePdf = {
  id: number;
  currentPdfFileId: number | null;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
};

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/[\r\n"\\]/g, "_");
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  const [invoice] = await prisma.$queryRaw<PublicInvoicePdf[]>`
    SELECT
      i."id",
      i."currentPdfFileId",
      f."storageKey",
      f."fileName",
      f."contentType"
    FROM "Invoice" i
    LEFT JOIN "InvoicePdfFile" f ON f."id" = i."currentPdfFileId"
    WHERE i."publicToken" = ${token}
    LIMIT 1
  `;

  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  if (!invoice.currentPdfFileId || !invoice.storageKey) {
    return new Response("Invoice PDF not generated", { status: 404 });
  }

  try {
    const pdfBuffer = await downloadInvoicePdf(invoice.storageKey);
    const fileName = contentDispositionFileName(invoice.fileName || "invoice.pdf");

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": invoice.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Public invoice PDF download failed", {
      invoiceId: invoice.id,
      pdfFileId: invoice.currentPdfFileId,
      storageKey: invoice.storageKey,
      error,
    });

    return new Response("Invoice PDF download failed", { status: 500 });
  }
}
