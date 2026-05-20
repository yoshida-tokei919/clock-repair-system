import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";

import {
  createEstimateServerDocumentElement,
  EstimateServerDocumentProps,
} from "@/components/pdf/EstimateServerDocument";
import { authOptions } from "@/lib/auth";
import {
  buildEstimatePdfStorageKey,
  calculatePdfHash,
  deleteEstimatePdf,
  uploadEstimatePdf,
} from "@/lib/estimate-pdf-storage";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPdfCustomerName(customer: {
  type: string;
  name: string;
  companyName: string | null;
}) {
  if (customer.type === "business") {
    return customer.companyName?.trim() || customer.name?.trim() || "";
  }

  return customer.name?.trim() || "";
}

function getEstimatePdfFileName(estimateNumber: string) {
  return `estimate_${estimateNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function renderEstimatePdfBuffer(data: EstimateServerDocumentProps["data"]) {
  const nodeRequire = eval("require") as NodeRequire;
  const ReactRuntime = nodeRequire("react");
  const renderer = nodeRequire("@react-pdf/renderer");
  const { Font, renderToStream } = renderer;

  Font.register({
    family: "Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });

  const documentElement = createEstimateServerDocumentElement(ReactRuntime, renderer, data);
  const stream = (await renderToStream(documentElement)) as NodeJS.ReadableStream;
  return streamToBuffer(stream);
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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

  const estimateDocument = await prisma.estimateDocument.findUnique({
    where: { id: estimateDocumentId },
    include: {
      customer: true,
      repairs: {
        include: {
          watch: { include: { brand: true, model: true, reference: true } },
          estimate: {
            include: {
              items: {
                include: {
                  partsMaster: { select: { grade: true, notes2: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!estimateDocument) {
    return NextResponse.json(
      { ok: false, error: "Estimate document not found" },
      { status: 404 }
    );
  }

  const jobs = estimateDocument.repairs.map((repair) => {
    const estimateItems = repair.estimate?.items || [];

    return {
      id: String(repair.id),
      inquiryNumber: repair.inquiryNumber,
      partnerRef: repair.partnerRef || undefined,
      endUserName: repair.endUserName || undefined,
      customerNote: repair.customerNote || "",
      watch: {
        brand: repair.watch.brand?.name || "",
        model: repair.watch.model?.name || "",
        ref: repair.watch.reference?.name || undefined,
        serial: repair.watch.serialNumber || undefined,
      },
      items: estimateItems.map((item) => ({
        name: item.itemName,
        price: item.unitPrice,
        type: item.type,
        grade: item.partsMaster?.grade ?? undefined,
        note2: item.partsMaster?.notes2 ?? undefined,
        displayName:
          item.type === "part"
            ? formatPartDisplay({
                name: item.itemName,
                grade: item.partsMaster?.grade,
                note2: item.partsMaster?.notes2,
              })
            : item.itemName,
      })),
    };
  });

  const pdfData: EstimateServerDocumentProps["data"] = {
    estimateNumber: estimateDocument.estimateNumber,
    date: estimateDocument.issuedDate.toLocaleDateString("ja-JP"),
    customer: {
      name: getPdfCustomerName(estimateDocument.customer),
      type: estimateDocument.customer.type,
      address: estimateDocument.customer.address || undefined,
    },
    jobs,
  };

  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderEstimatePdfBuffer(pdfData);
  } catch (error) {
    console.error("Estimate PDF render failed", {
      estimateDocumentId: estimateDocument.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Estimate PDF generation failed" },
      { status: 500 }
    );
  }

  const fileName = getEstimatePdfFileName(estimateDocument.estimateNumber);
  const generatedBy = session.user.email ?? session.user.name ?? null;

  let pdfFile: { id: number; version: number } | undefined;

  try {
    [pdfFile] = await prisma.$queryRaw<{ id: number; version: number }[]>`
      WITH next_version AS (
        SELECT COALESCE(MAX("version"), 0) + 1 AS "version"
        FROM "EstimatePdfFile"
        WHERE "estimateDocumentId" = ${estimateDocument.id}
      )
      INSERT INTO "EstimatePdfFile" (
        "estimateDocumentId",
        "customerId",
        "storageKey",
        "fileName",
        "version",
        "status",
        "generatedBy"
      )
      SELECT
        ${estimateDocument.id},
        ${estimateDocument.customerId},
        '',
        ${fileName},
        "version",
        'draft',
        ${generatedBy}
      FROM next_version
      RETURNING "id", "version"
    `;
  } catch (error) {
    console.error("Estimate PDF record creation failed", {
      estimateDocumentId: estimateDocument.id,
      error,
    });

    return NextResponse.json(
      { ok: false, error: "Failed to create estimate PDF record" },
      { status: 500 }
    );
  }

  if (!pdfFile) {
    return NextResponse.json(
      { ok: false, error: "Failed to create estimate PDF record" },
      { status: 500 }
    );
  }

  const storageKey = buildEstimatePdfStorageKey({
    estimateDocumentId: estimateDocument.id,
    pdfFileId: pdfFile.id,
  });
  const hash = calculatePdfHash(pdfBuffer);
  let uploaded = false;

  try {
    const uploadResult = await uploadEstimatePdf({ storageKey, buffer: pdfBuffer });
    uploaded = true;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "EstimatePdfFile"
        SET "status" = 'superseded',
            "supersededAt" = NOW()
        WHERE "estimateDocumentId" = ${estimateDocument.id}
          AND "status" = 'current'
          AND "id" <> ${pdfFile.id}
      `;

      await tx.$executeRaw`
        UPDATE "EstimatePdfFile"
        SET "storageKey" = ${uploadResult.storageKey},
            "fileSize" = ${uploadResult.fileSize},
            "hash" = ${hash},
            "status" = 'current'
        WHERE "id" = ${pdfFile.id}
      `;

      await tx.$executeRaw`
        UPDATE "EstimateDocument"
        SET "currentPdfFileId" = ${pdfFile.id}
        WHERE "id" = ${estimateDocument.id}
      `;
    });

    return NextResponse.json({
      ok: true,
      pdfFileId: pdfFile.id,
      estimateDocumentId: estimateDocument.id,
      storageKey,
      version: pdfFile.version,
      status: "current",
    });
  } catch (error) {
    console.error("Estimate PDF generation failed", {
      estimateDocumentId: estimateDocument.id,
      pdfFileId: pdfFile.id,
      storageKey,
      error,
    });

    if (uploaded) {
      try {
        await deleteEstimatePdf(storageKey);
      } catch (deleteError) {
        console.error("Estimate PDF cleanup failed", {
          estimateDocumentId: estimateDocument.id,
          pdfFileId: pdfFile.id,
          storageKey,
          error: deleteError,
        });
      }
    }

    try {
      await prisma.$executeRaw`
        UPDATE "EstimatePdfFile"
        SET "status" = 'void',
            "supersededAt" = NOW()
        WHERE "id" = ${pdfFile.id}
      `;
    } catch (voidError) {
      console.error("Estimate PDF void marker failed", {
        estimateDocumentId: estimateDocument.id,
        pdfFileId: pdfFile.id,
        error: voidError,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Estimate PDF generation failed" },
      { status: 500 }
    );
  }
}
