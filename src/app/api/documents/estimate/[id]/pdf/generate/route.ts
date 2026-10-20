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
import { issuedOptionSourceHash, optionTotals, parseOptionSet } from "@/lib/estimate-options";
import { estimatePdfSourceFingerprint } from "@/lib/estimate-pdf-source";
import { manualOnlyEstimateContactNote } from "@/lib/estimate-option-contact-text";

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

  const documentQuery = {
    where: { id: estimateDocumentId },
    include: {
      customer: true,
      repairs: {
        orderBy: { id: "asc" as const },
        include: {
          watch: { include: { brand: true, model: true, reference: true, caseReference: true } },
          estimate: {
            include: {
              items: {
                orderBy: { id: "asc" as const },
                include: {
                  partsMaster: { select: { grade: true, notes2: true } },
                },
              },
            },
          },
          estimateOptionSet: { include: { choices: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], include: { lines: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] } } } } },
          estimateOptionApproval: { select: { id: true } },
        },
      },
    },
  };
  const estimateDocument = await prisma.estimateDocument.findUnique(documentQuery);

  if (!estimateDocument) {
    return NextResponse.json(
      { ok: false, error: "Estimate document not found" },
      { status: 404 }
    );
  }
  try {
    for (const repair of estimateDocument.repairs) {
      const set = repair.estimateOptionSet;
      if (!set?.isActive) continue;
      if (repair.approvalStatus !== "pending" || repair.estimateOptionApproval) throw new Error("承認済みの選択肢付き見積は再発行できません。改訂手続きが必要です。");
      if (estimateDocument.customer.type !== "business" || !repair.estimate || repair.estimate.pricingTaxMode !== estimateDocument.pricingTaxMode ||
          estimateDocument.customer.pricingTaxMode !== estimateDocument.pricingTaxMode) throw new Error("選択肢付き見積の取引先・税表示方式を確認してください。");
      parseOptionSet(set);
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "選択肢が不正です。" }, { status: 409 });
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

    const set = repair.estimateOptionSet;
    const choices = set?.isActive ? set.choices : [];
    const totals = optionTotals(estimateItems, choices, estimateDocument.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE");
    return {
      id: String(repair.id),
      inquiryNumber: repair.inquiryNumber,
      subtotalAmount: repair.estimate?.totalAmount ?? 0,
      taxAmount: repair.estimate?.taxAmount ?? 0,
      totalAmount: (repair.estimate?.totalAmount ?? 0) + (repair.estimate?.taxAmount ?? 0),
      partnerRef: repair.partnerRef || undefined,
      endUserName: repair.endUserName || undefined,
      customerNote: manualOnlyEstimateContactNote(repair.customerNote),
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
      options: set?.isActive ? {
        title: set.title,
        notes: set.notes,
        choices: choices.map((choice, index) => ({
          kind: choice.kind as "PLAN" | "ADD_ON",
          name: choice.name,
          notes: choice.notes,
          recommended: choice.recommended,
          lines: choice.lines.map(line => ({
            name: line.displayNameSnapshot || line.itemNameSnapshot,
            price: line.unitPrice,
            quantity: line.quantity,
            notes: line.notesForCustomerSnapshot,
          })),
          deltaAmount: choice.kind === "PLAN" ? totals[index].planAmount : totals[index].addOnAmount,
          totalAmount: totals[index].commonAmount + totals[index].planAmount,
        })),
      } : undefined,
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
  const sourceFingerprint = estimatePdfSourceFingerprint(estimateDocument);
  const optionSourceHashes = Object.fromEntries(estimateDocument.repairs.filter(repair => repair.estimateOptionSet?.isActive)
    .map(repair => [String(repair.id), issuedOptionSourceHash({ ...estimateDocument, issuedDate: requestedDate ?? estimateDocument.issuedDate }, repair)]));

  try {
    pdfFile = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "EstimateDocument" WHERE "id" = ${estimateDocument.id} FOR UPDATE`;
      const [created] = await tx.$queryRaw<{ id: number; version: number }[]>`
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
      return created;
    });
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
      await tx.$queryRaw`SELECT "id" FROM "EstimateDocument" WHERE "id" = ${estimateDocument.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${estimateDocument.customerId} FOR UPDATE`;
      for (const repair of estimateDocument.repairs) {
        await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repair.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Watch" WHERE "id" = ${repair.watchId} FOR UPDATE`;
        if (repair.estimate) {
          await tx.$queryRaw`SELECT "id" FROM "Estimate" WHERE "id" = ${repair.estimate.id} FOR UPDATE`;
          for (const item of repair.estimate.items) {
            await tx.$queryRaw`SELECT "id" FROM "EstimateItem" WHERE "id" = ${item.id} FOR UPDATE`;
            if (item.partsMasterId) await tx.$queryRaw`SELECT "id" FROM "PartsMaster" WHERE "id" = ${item.partsMasterId} FOR UPDATE`;
          }
        }
        if (repair.estimateOptionSet) {
          await tx.$queryRaw`SELECT "id" FROM "EstimateOptionSet" WHERE "id" = ${repair.estimateOptionSet.id} FOR UPDATE`;
          for (const choice of repair.estimateOptionSet.choices) {
            await tx.$queryRaw`SELECT "id" FROM "EstimateOptionChoice" WHERE "id" = ${choice.id} FOR UPDATE`;
            for (const line of choice.lines) await tx.$queryRaw`SELECT "id" FROM "EstimateOptionLine" WHERE "id" = ${line.id} FOR UPDATE`;
          }
        }
        if (repair.watch.brandId) await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${repair.watch.brandId} FOR UPDATE`;
        if (repair.watch.modelId) await tx.$queryRaw`SELECT "id" FROM "Model" WHERE "id" = ${repair.watch.modelId} FOR UPDATE`;
        if (repair.watch.referenceId) await tx.$queryRaw`SELECT "id" FROM "WatchReference" WHERE "id" = ${repair.watch.referenceId} FOR UPDATE`;
        if (repair.watch.caseReferenceId) await tx.$queryRaw`SELECT "id" FROM "WatchReference" WHERE "id" = ${repair.watch.caseReferenceId} FOR UPDATE`;
      }
      const current = await tx.estimateDocument.findUnique(documentQuery);
      if (estimatePdfSourceFingerprint(current) !== sourceFingerprint) throw new Error("見積内容が変更されました。再生成してください。");
      if (current?.repairs.some(repair => repair.estimateOptionSet?.isActive && repair.approvalStatus !== "pending")) throw new Error("承認済みの選択肢付き見積は再発行できません。改訂手続きが必要です。");
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
            "optionSourceHashes" = ${JSON.stringify(optionSourceHashes)}::jsonb,
            "status" = 'current'
        WHERE "id" = ${pdfFile.id}
      `;

      await tx.$executeRaw`
        UPDATE "EstimateDocument"
        SET "currentPdfFileId" = ${pdfFile.id}, "issuedDate" = ${requestedDate ?? estimateDocument.issuedDate}
        WHERE "id" = ${estimateDocument.id}
      `;
    }, { timeout: 30000, maxWait: 10000 });

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
      { ok: false, error: error instanceof Error && error.message === "見積内容が変更されました。再生成してください。" ? error.message : "Estimate PDF generation failed" },
      { status: error instanceof Error && error.message === "見積内容が変更されました。再生成してください。" ? 409 : 500 }
    );
  }
}
