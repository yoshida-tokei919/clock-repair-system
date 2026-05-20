import { downloadEstimatePdf } from "@/lib/estimate-pdf-storage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/[\r\n"\\]/g, "_");
}

type PublicEstimateDocument = {
  id: number;
  currentPdfFileId: number | null;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
};

function pdfNotGenerated() {
  return new Response("PDF not generated", { status: 404 });
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  const [documentTokenEstimateDocument] = await prisma.$queryRaw<PublicEstimateDocument[]>`
    SELECT
      d."id",
      d."currentPdfFileId",
      f."storageKey",
      f."fileName",
      f."contentType"
    FROM "EstimateDocument" d
    LEFT JOIN "EstimatePdfFile" f ON f."id" = d."currentPdfFileId"
    WHERE d."publicToken" = ${token}
    LIMIT 1
  `;

  let estimateDocument: PublicEstimateDocument | null = documentTokenEstimateDocument ?? null;

  if (!estimateDocument) {
    const [repairTokenEstimateDocument] = await prisma.$queryRaw<PublicEstimateDocument[]>`
      SELECT
        d."id",
        d."currentPdfFileId",
        f."storageKey",
        f."fileName",
        f."contentType"
      FROM "Repair" r
      INNER JOIN "EstimateDocument" d ON d."id" = r."estimateDocumentId"
      LEFT JOIN "EstimatePdfFile" f ON f."id" = d."currentPdfFileId"
      WHERE r."publicToken" = ${token}
      LIMIT 1
    `;

    if (!repairTokenEstimateDocument) {
      return new Response("Not found", { status: 404 });
    }

    estimateDocument = repairTokenEstimateDocument;
  }

  if (!estimateDocument.currentPdfFileId || !estimateDocument.storageKey) {
    return pdfNotGenerated();
  }

  try {
    const pdfBuffer = await downloadEstimatePdf(estimateDocument.storageKey);
    const fileName = contentDispositionFileName(
      estimateDocument.fileName || `estimate-${estimateDocument.id}.pdf`
    );

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": estimateDocument.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Public estimate PDF download failed", {
      estimateDocumentId: estimateDocument.id,
      pdfFileId: estimateDocument.currentPdfFileId,
      storageKey: estimateDocument.storageKey,
      error,
    });

    return new Response("PDF download failed", { status: 500 });
  }
}
