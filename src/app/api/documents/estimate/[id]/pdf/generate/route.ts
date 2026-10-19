import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { type EstimateServerDocumentProps } from "@/components/pdf/EstimateServerDocument";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { authOptions } from "@/lib/auth";
import {
  buildEstimatePdfStorageKey,
  calculatePdfHash,
  deleteEstimatePdf,
  uploadEstimatePdf,
} from "@/lib/estimate-pdf-storage";
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { renderEstimatePdfBuffer } from "@/lib/estimate-pdf-render";
import { prisma } from "@/lib/prisma";
import { displayIssuedDate, parseIssuedDate } from "@/lib/document-issued-date";
import { sumCustomerLines } from "@/lib/pricing-tax";

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const session = await getServerSession(authOptions);

  const estimateDocumentId = Number((await params).id);

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
          watch: { include: { brand: true, model: true, reference: true, caseReference: true } },
          estimate: {
            include: {
              items: {
                include: {
                  partsMaster: { select: { grade: true, notes2: true } },
                },
              },
            },
          },
          estimateOptionSet: { select: { isActive: true } },
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
  if (estimateDocument.repairs.some(repair => repair.estimateOptionSet?.isActive)) {
    return NextResponse.json({ ok: false, error: "選択肢が未回答の案件を通常見積PDFにできません。" }, { status: 409 });
  }
  if (sumCustomerLines(estimateDocument.repairs.flatMap(repair => repair.estimate?.items ?? [])) !== estimateDocument.totalAmount +
      (estimateDocument.pricingTaxMode === "INCLUSIVE" ? estimateDocument.taxAmount : 0)) {
    return NextResponse.json({ ok: false, error: "発行時の見積額と現在の明細が一致しません。保存済みPDFをご確認ください。" }, { status: 409 });
  }
  let requestedDate: Date | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.issuedDate !== undefined) requestedDate = parseIssuedDate(body.issuedDate);
  } catch {
    return NextResponse.json({ ok: false, error: "有効な発行日を指定してください" }, { status: 400 });
  }

  const jobs = estimateDocument.repairs.map((repair) => {
    const estimateItems = repair.estimate?.items || [];

    return {
      id: String(repair.id),
      inquiryNumber: repair.inquiryNumber,
      subtotalAmount: repair.estimate?.totalAmount ?? 0,
      taxAmount: repair.estimate?.taxAmount ?? 0,
      totalAmount: (repair.estimate?.totalAmount ?? 0) + (repair.estimate?.taxAmount ?? 0),
      partnerRef: repair.partnerRef || undefined,
      endUserName: repair.endUserName || undefined,
      customerNote: repair.customerNote || "",
      watch: {
        brand: repair.watch.brand?.name || "",
        timepieceType: repair.watch.timepieceType,
        timepieceTypeLabel: repair.watch.timepieceTypeLabel,
        model: repair.watch.model?.name || "",
        ref: repair.watch.reference?.name || undefined,
        caseRef: repair.watch.caseReference?.name || undefined,
        serial: repair.watch.serialNumber || undefined,
      },
      items: estimateItems.map((item) => ({
        name: item.itemName,
        price: item.unitPrice,
        quantity: item.quantity,
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
    date: displayIssuedDate(requestedDate ?? estimateDocument.issuedDate),
    customer: {
      name: getPdfCustomerName(estimateDocument.customer),
      type: estimateDocument.customer.type,
      address: estimateDocument.customer.address || undefined,
    },
    subtotalAmount: estimateDocument.totalAmount,
    taxAmount: estimateDocument.taxAmount,
    totalAmount: estimateDocument.totalAmount + estimateDocument.taxAmount,
    pricingTaxMode: estimateDocument.pricingTaxMode,
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
  const generatedBy = session?.user?.email ?? session?.user?.name ?? null;

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
      const [locked] = await tx.$queryRaw<{ issuedDate: Date }[]>`
        SELECT "issuedDate" FROM "EstimateDocument" WHERE "id" = ${estimateDocument.id} FOR UPDATE`;
      if (!locked || locked.issuedDate.getTime() !== estimateDocument.issuedDate.getTime()) {
        throw new Error("発行日が変更されました。再読み込みしてください");
      }
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
        SET "currentPdfFileId" = ${pdfFile.id}, "issuedDate" = ${requestedDate ?? estimateDocument.issuedDate}
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
