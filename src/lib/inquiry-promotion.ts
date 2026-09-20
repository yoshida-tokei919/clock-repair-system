import type { InquiryWatchField, Prisma } from "@prisma/client";
import { lockLineUserInquiryTransaction } from "@/lib/inquiry-transaction-lock";

const MASTER_FIELDS = {
  BRAND: "brandId",
  MODEL: "modelId",
  PRODUCT_REF: "referenceId",
  CASE_REF: "caseReferenceId",
  CALIBER: "caliberId",
  BASE_CALIBER: "baseCaliberId",
} as const;

type PromotionWatch = {
  id: number;
  position: number;
  inquiryId: number;
  brandId: number | null;
  modelId: number | null;
  referenceId: number | null;
  caseReferenceId: number | null;
  caliberId: number | null;
  baseCaliberId: number | null;
  promotedWatchId: number | null;
  promotedRepairId: number | null;
  promotedAt: Date | null;
  fieldValues: Array<{ field: InquiryWatchField; value: string; confirmationStatus: "PENDING" | "CONFIRMED" }>;
};

export class InquiryPromotionInputError extends Error {}

function positiveId(value: unknown, name: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new InquiryPromotionInputError(`${name} must be a positive integer.`);
  return id;
}

export function parseInquiryPromotionInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InquiryPromotionInputError("body must be an object.");
  }
  const body = value as Record<string, unknown>;
  const customerId = positiveId(body.customerId, "customerId");
  if (!Array.isArray(body.watchIds) || body.watchIds.length === 0 || body.watchIds.length > 50) {
    throw new InquiryPromotionInputError("watchIds must contain between 1 and 50 watches.");
  }
  const watchIds = body.watchIds.map((item) => positiveId(item, "watchId"));
  if (new Set(watchIds).size !== watchIds.length) {
    throw new InquiryPromotionInputError("watchIds must not contain duplicates.");
  }
  return { customerId, watchIds };
}

function confirmedField(watch: PromotionWatch, field: InquiryWatchField) {
  return watch.fieldValues.find((item) => item.field === field) ?? null;
}

function requireResolvedField(
  watch: PromotionWatch,
  field: keyof typeof MASTER_FIELDS,
  required: boolean,
) {
  const idKey = MASTER_FIELDS[field];
  const id = watch[idKey];
  const value = confirmedField(watch, field);
  if (!required && id == null && !value?.value.trim()) return;
  if (id == null || !value || value.confirmationStatus !== "CONFIRMED") {
    throw new InquiryPromotionInputError(`Watch ${watch.position}: ${field} must be confirmed and linked to an existing master.`);
  }
}

function inquirySequence(inquiryNumber: string, prefix: string) {
  const expectedPrefix = `${prefix}-`;
  if (!inquiryNumber.startsWith(expectedPrefix)) return 0;
  const value = Number(inquiryNumber.slice(expectedPrefix.length));
  return Number.isFinite(value) ? value : 0;
}

async function validateWatchMasterRelations(tx: Prisma.TransactionClient, watch: PromotionWatch) {
  requireResolvedField(watch, "BRAND", true);
  requireResolvedField(watch, "MODEL", false);
  requireResolvedField(watch, "PRODUCT_REF", false);
  requireResolvedField(watch, "CASE_REF", false);
  requireResolvedField(watch, "CALIBER", false);
  requireResolvedField(watch, "BASE_CALIBER", false);

  const [brand, model, reference, caseReference, caliber, baseCaliber] = await Promise.all([
    tx.brand.findUnique({ where: { id: watch.brandId! }, select: { id: true } }),
    watch.modelId ? tx.model.findUnique({ where: { id: watch.modelId }, select: { id: true, brandId: true } }) : null,
    watch.referenceId ? tx.watchReference.findUnique({ where: { id: watch.referenceId }, select: { id: true, modelId: true } }) : null,
    watch.caseReferenceId ? tx.watchReference.findUnique({ where: { id: watch.caseReferenceId }, select: { id: true, modelId: true } }) : null,
    watch.caliberId ? tx.caliber.findUnique({ where: { id: watch.caliberId }, select: { id: true } }) : null,
    watch.baseCaliberId ? tx.caliber.findUnique({ where: { id: watch.baseCaliberId }, select: { id: true } }) : null,
  ]);
  if (!brand) throw new InquiryPromotionInputError(`Watch ${watch.position}: selected Brand no longer exists.`);
  if (watch.modelId && (!model || model.brandId !== watch.brandId)) {
    throw new InquiryPromotionInputError(`Watch ${watch.position}: Model does not belong to the selected Brand.`);
  }
  if (watch.referenceId && (!reference || reference.modelId !== watch.modelId)) {
    throw new InquiryPromotionInputError(`Watch ${watch.position}: Ref does not belong to the selected Model.`);
  }
  if (watch.caseReferenceId && (!caseReference || caseReference.modelId !== watch.modelId)) {
    throw new InquiryPromotionInputError(`Watch ${watch.position}: case Ref does not belong to the selected Model.`);
  }
  if (watch.caliberId && !caliber) throw new InquiryPromotionInputError(`Watch ${watch.position}: selected Cal no longer exists.`);
  if (watch.baseCaliberId && !baseCaliber) throw new InquiryPromotionInputError(`Watch ${watch.position}: selected Base Cal no longer exists.`);
}

export async function promoteInquiryWatches(
  tx: Prisma.TransactionClient,
  input: { inquiryId: number; customerId: number; watchIds: number[] },
) {
  const inquiry = await tx.inquiry.findUnique({
    where: { id: input.inquiryId },
    select: { id: true, lineUserId: true },
  });
  if (!inquiry) throw new InquiryPromotionInputError("Inquiry not found.");

  // The shared LINE-user lock also serializes promotion attempts for one inquiry.
  await lockLineUserInquiryTransaction(tx, inquiry.lineUserId);

  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, type: true, prefix: true, currentSeq: true },
  });
  if (!customer) throw new InquiryPromotionInputError("Selected Customer was not found.");
  if (customer.type !== "individual" && customer.type !== "business") {
    throw new InquiryPromotionInputError("Selected Customer has an unsupported type.");
  }

  const watches = await tx.inquiryWatch.findMany({
    where: { inquiryId: inquiry.id, id: { in: input.watchIds } },
    orderBy: { position: "asc" },
    select: {
      id: true, position: true, inquiryId: true, brandId: true, modelId: true,
      referenceId: true, caseReferenceId: true, caliberId: true, baseCaliberId: true,
      promotedWatchId: true, promotedRepairId: true, promotedAt: true,
      fieldValues: { select: { field: true, value: true, confirmationStatus: true } },
    },
  });
  if (watches.length !== input.watchIds.length) {
    throw new InquiryPromotionInputError("One or more selected watches do not belong to this Inquiry.");
  }

  // Validate every selected draft before creating any formal record.
  for (const watch of watches) {
    if (watch.promotedAt || watch.promotedWatchId || watch.promotedRepairId) {
      throw new InquiryPromotionInputError(`Watch ${watch.position} has already been promoted.`);
    }
    await validateWatchMasterRelations(tx, watch);
  }

  const prefix = customer.type === "individual" ? "C" : customer.prefix?.trim().toUpperCase();
  if (!prefix) throw new InquiryPromotionInputError("Business Customer requires a prefix before promotion.");

  // Lock the Customer row before reading its sequence so concurrent promotions
  // cannot issue the same business/customer repair number.
  await tx.customer.update({ where: { id: customer.id }, data: { currentSeq: customer.currentSeq } });
  const existing = await tx.repair.findMany({
    where: { inquiryNumber: { startsWith: `${prefix}-` } },
    select: { inquiryNumber: true },
  });
  let sequence = Math.max(
    customer.currentSeq,
    ...existing.map((repair) => inquirySequence(repair.inquiryNumber, prefix)),
  );

  const promotedAt = new Date();
  const results: Array<{ inquiryWatchId: number; watchId: number; repairId: number; inquiryNumber: string }> = [];
  for (const draft of watches) {
    sequence += 1;
    const formalWatch = await tx.watch.create({
      data: {
        customerId: customer.id,
        brandId: draft.brandId!,
        modelId: draft.modelId,
        referenceId: draft.referenceId,
        caseReferenceId: draft.caseReferenceId,
        caliberId: draft.caliberId,
        baseCaliberId: draft.baseCaliberId,
      },
    });
    const inquiryNumber = `${prefix}-${String(sequence).padStart(3, "0")}`;
    // Cal / Base Cal belong to the formal Watch. They are deliberately not
    // copied into Repair's movement fields, whose semantics are different.
    const repair = await tx.repair.create({
      data: {
        inquiryNumber,
        customerId: customer.id,
        watchId: formalWatch.id,
        status: "受付",
        partsAllocationLegacy: false,
        accessories: "[]",
      },
    });
    await tx.repairStatusLog.create({ data: { repairId: repair.id, status: "受付" } });
    await tx.inquiryWatch.update({
      where: { id: draft.id },
      data: { promotedWatchId: formalWatch.id, promotedRepairId: repair.id, promotedAt },
    });
    results.push({ inquiryWatchId: draft.id, watchId: formalWatch.id, repairId: repair.id, inquiryNumber });
  }
  await tx.customer.update({ where: { id: customer.id }, data: { currentSeq: sequence, prefix } });
  return { customerId: customer.id, promotedAt, promotions: results };
}
