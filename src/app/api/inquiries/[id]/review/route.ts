import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fieldValueWriteData,
  InquiryWatchReviewInputError,
  parseInquiryWatchReviewPatch,
} from "@/lib/inquiry-review";

function inquiryIdFromParams(value: string) {
  const inquiryId = Number(value);
  return Number.isInteger(inquiryId) && inquiryId > 0 ? inquiryId : null;
}

async function getReviewPayload(inquiryId: number) {
  const [inquiry, brands, models, references, calibers] = await Promise.all([
    prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: {
        id: true,
        status: true,
        conversationSummary: true,
        firstReceivedAt: true,
        lastReceivedAt: true,
        reviewWatches: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            label: true,
            summary: true,
            faults: true,
            requestedWork: true,
            supplementalFacts: true,
            missingInformation: true,
            missingPhotos: true,
            brandId: true,
            modelId: true,
            referenceId: true,
            caseReferenceId: true,
            caliberId: true,
            baseCaliberId: true,
            promotedAt: true,
            fieldValues: {
              orderBy: { field: "asc" },
              select: {
                id: true,
                field: true,
                value: true,
                source: true,
                confirmationStatus: true,
                confirmedAt: true,
                sourceAiCandidateId: true,
              },
            },
            sourceAiWatch: {
              select: {
                candidates: {
                  orderBy: [{ field: "asc" }, { rank: "asc" }, { id: "asc" }],
                  select: {
                    id: true,
                    field: true,
                    rank: true,
                    value: true,
                    confidence: true,
                    evidence: true,
                    observedText: true,
                    sourceType: true,
                    sourceMessageIds: true,
                    sourceImageIds: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.brand.findMany({
      orderBy: { nameJp: "asc" },
      select: { id: true, name: true, nameJp: true, nameEn: true },
    }),
    prisma.model.findMany({
      orderBy: { nameJp: "asc" },
      select: { id: true, brandId: true, name: true, nameJp: true, nameEn: true },
    }),
    prisma.watchReference.findMany({
      orderBy: { name: "asc" },
      select: { id: true, modelId: true, name: true },
    }),
    prisma.caliber.findMany({
      orderBy: { name: "asc" },
      select: { id: true, brandId: true, name: true, nameJp: true, nameEn: true },
    }),
  ]);

  if (!inquiry) return null;
  return { inquiry, masterOptions: { brands, models, references, calibers } };
}

async function validateMasterSelections(
  tx: Prisma.TransactionClient,
  current: {
    brandId: number | null;
    modelId: number | null;
    referenceId: number | null;
    caseReferenceId: number | null;
    caliberId: number | null;
    baseCaliberId: number | null;
  },
  selections: Record<string, number | null | undefined>,
) {
  const selected = {
    brandId: selections.brandId === undefined ? current.brandId : selections.brandId,
    modelId: selections.modelId === undefined ? current.modelId : selections.modelId,
    referenceId: selections.referenceId === undefined ? current.referenceId : selections.referenceId,
    caseReferenceId: selections.caseReferenceId === undefined ? current.caseReferenceId : selections.caseReferenceId,
    caliberId: selections.caliberId === undefined ? current.caliberId : selections.caliberId,
    baseCaliberId: selections.baseCaliberId === undefined ? current.baseCaliberId : selections.baseCaliberId,
  };

  const [brand, model, reference, caseReference, caliber, baseCaliber] = await Promise.all([
    selected.brandId ? tx.brand.findUnique({ where: { id: selected.brandId }, select: { id: true } }) : null,
    selected.modelId ? tx.model.findUnique({ where: { id: selected.modelId }, select: { id: true, brandId: true } }) : null,
    selected.referenceId ? tx.watchReference.findUnique({ where: { id: selected.referenceId }, select: { id: true, modelId: true } }) : null,
    selected.caseReferenceId ? tx.watchReference.findUnique({ where: { id: selected.caseReferenceId }, select: { id: true, modelId: true } }) : null,
    selected.caliberId ? tx.caliber.findUnique({ where: { id: selected.caliberId }, select: { id: true } }) : null,
    selected.baseCaliberId ? tx.caliber.findUnique({ where: { id: selected.baseCaliberId }, select: { id: true } }) : null,
  ]);

  if (selected.brandId && !brand) throw new InquiryWatchReviewInputError("選択されたブランドが見つかりません。");
  if (selected.modelId && (!model || !selected.brandId || model.brandId !== selected.brandId)) {
    throw new InquiryWatchReviewInputError("モデルは選択中のブランドに属している必要があります。");
  }
  if (selected.referenceId && (!reference || !selected.modelId || reference.modelId !== selected.modelId)) {
    throw new InquiryWatchReviewInputError("Refは選択中のモデルに属している必要があります。");
  }
  if (selected.caseReferenceId && (!caseReference || !selected.modelId || caseReference.modelId !== selected.modelId)) {
    throw new InquiryWatchReviewInputError("ケースRefは選択中のモデルに属している必要があります。");
  }
  if (selected.caliberId && !caliber) throw new InquiryWatchReviewInputError("選択されたCalが見つかりません。");
  if (selected.baseCaliberId && !baseCaliber) throw new InquiryWatchReviewInputError("選択されたBase Calが見つかりません。");
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });

  const payload = await getReviewPayload(inquiryId);
  if (!payload) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  return NextResponse.json(payload);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inquiryId = inquiryIdFromParams(params.id);
  if (!inquiryId) return NextResponse.json({ error: "Invalid inquiry ID" }, { status: 400 });

  try {
    const body = await request.json();
    const watchId = Number(body?.watchId);
    if (!Number.isInteger(watchId) || watchId <= 0) {
      return NextResponse.json({ error: "watchId is required" }, { status: 400 });
    }
    const patch = parseInquiryWatchReviewPatch(body);

    await prisma.$transaction(async (tx) => {
      const watch = await tx.inquiryWatch.findFirst({
        where: { id: watchId, inquiryId },
        select: {
          id: true,
          brandId: true,
          modelId: true,
          referenceId: true,
          caseReferenceId: true,
          caliberId: true,
          baseCaliberId: true,
          promotedAt: true,
          fieldValues: { select: { id: true, field: true, value: true, source: true } },
        },
      });
      if (!watch) throw new InquiryWatchReviewInputError("確認対象の時計が見つかりません。");
      if (watch.promotedAt) throw new InquiryWatchReviewInputError("昇格済みの時計は編集できません。");

      await validateMasterSelections(tx, watch, patch.masterSelections);
      if (Object.keys(patch.masterSelections).length > 0) {
        await tx.inquiryWatch.update({ where: { id: watch.id }, data: patch.masterSelections });
      }

      const now = new Date();
      for (const change of patch.fieldValues) {
        const current = watch.fieldValues.find((value) => value.field === change.field);
        const data = fieldValueWriteData(current, change, now);
        if (current) {
          await tx.inquiryWatchFieldValue.update({ where: { id: current.id }, data });
        } else {
          await tx.inquiryWatchFieldValue.create({
            data: {
              inquiryWatchId: watch.id,
              field: change.field,
              value: change.value,
              source: "MANUAL",
              confirmationStatus: change.confirmationStatus,
              confirmedAt: change.confirmationStatus === "CONFIRMED" ? now : null,
            },
          });
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InquiryWatchReviewInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Inquiry review update error", error);
    return NextResponse.json({ error: "確認内容を保存できませんでした。" }, { status: 500 });
  }
}
