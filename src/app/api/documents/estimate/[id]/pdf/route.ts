import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { downloadEstimatePdf } from "@/lib/estimate-pdf-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/[\r\n"\\]/g, "_");
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const estimateDocumentId = Number(params.id);

  if (!Number.isInteger(estimateDocumentId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid estimate document id" },
      { status: 400 }
    );
  }

  const [estimateDocument] = await prisma.$queryRaw<
    {
      id: number;
      currentPdfFileId: number | null;
      storageKey: string | null;
      fileName: string | null;
      contentType: string | null;
      fileSize: number | null;
      status: string | null;
    }[]
  >`
    SELECT
      d."id",
      d."currentPdfFileId",
      f."storageKey",
      f."fileName",
      f."contentType",
      f."fileSize",
      f."status"
    FROM "EstimateDocument" d
    LEFT JOIN "EstimatePdfFile" f ON f."id" = d."currentPdfFileId"
    WHERE d."id" = ${estimateDocumentId}
    LIMIT 1
  `;

  if (!estimateDocument) {
    return NextResponse.json(
      { ok: false, error: "Estimate document not found" },
      { status: 404 }
    );
  }

  if (!estimateDocument.currentPdfFileId || !estimateDocument.storageKey) {
    return NextResponse.json(
      { ok: false, error: "PDF not generated" },
      { status: 404 }
    );
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
    console.error("Estimate PDF download failed", {
      estimateDocumentId,
      pdfFileId: estimateDocument.currentPdfFileId,
      storageKey: estimateDocument.storageKey,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "PDF download failed" },
      { status: 500 }
    );
  }
}
