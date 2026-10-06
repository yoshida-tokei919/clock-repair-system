import type { PrismaClient } from "@prisma/client";
import { findOrCreateBrand, findOrCreateCaliber, findOrCreateModel, findOrCreateWatchReference, resolveBrand } from "@/lib/master-normalize";

export const B2B_BATCH_LIMIT = 30;

export class B2bBatchIntakeError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

type Row = {
  partnerRef: string | null;
  endUserName: string | null;
  brandId: number | null;
  brandName: string | null;
  model: string | null;
  ref: string | null;
  serial: string | null;
  caliber: string | null;
  movementMaker: string | null;
  movementCaliber: string | null;
  baseMovementMaker: string | null;
  baseMovementCaliber: string | null;
  workSummary: string | null;
};

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new B2bBatchIntakeError(`${label}の形式が不正です。`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new B2bBatchIntakeError(`${label}は${max}文字以内で入力してください。`);
  return trimmed || null;
}

export function parseB2bBatchPayload(value: unknown): { partnerId: number; rows: Row[] } {
  if (!value || typeof value !== "object") throw new B2bBatchIntakeError("入力内容が不正です。");
  const body = value as { partnerId?: unknown; rows?: unknown };
  if (!Number.isSafeInteger(body.partnerId) || (body.partnerId as number) <= 0) {
    throw new B2bBatchIntakeError("取引先を選択してください。");
  }
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > B2B_BATCH_LIMIT) {
    throw new B2bBatchIntakeError(`時計は1〜${B2B_BATCH_LIMIT}本で入力してください。`);
  }
  const rows = body.rows.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new B2bBatchIntakeError(`${index + 1}本目の入力が不正です。`);
    const row = raw as Record<string, unknown>;
    if (row.brandId != null && (!Number.isSafeInteger(row.brandId) || (row.brandId as number) <= 0)) {
      throw new B2bBatchIntakeError(`${index + 1}本目のブランドIDが不正です。`);
    }
    const brandId = row.brandId == null ? null : row.brandId as number;
    const brandName = optionalText(row.brandName, "ブランド", 200);
    if (!brandId && !brandName) throw new B2bBatchIntakeError(`${index + 1}本目のブランドを入力してください。`);
    return {
      partnerRef: optionalText(row.partnerRef, "取引先管理番号", 200),
      endUserName: optionalText(row.endUserName, "エンドユーザー名", 200),
      brandId,
      brandName,
      model: optionalText(row.model, "モデル", 200),
      ref: optionalText(row.ref, "Ref", 200),
      serial: optionalText(row.serial, "シリアル", 200),
      caliber: optionalText(row.caliber, "Cal", 200),
      movementMaker: optionalText(row.movementMaker, "Calメーカー", 200),
      movementCaliber: optionalText(row.movementCaliber, "ムーブメントCal", 200),
      baseMovementMaker: optionalText(row.baseMovementMaker, "Base Calメーカー", 200),
      baseMovementCaliber: optionalText(row.baseMovementCaliber, "Base Cal", 200),
      workSummary: optionalText(row.workSummary, "依頼内容", 1000),
    };
  });
  return { partnerId: body.partnerId as number, rows };
}

function sequenceOf(inquiryNumber: string, prefix: string) {
  const suffix = inquiryNumber.slice(prefix.length + 1);
  if (!inquiryNumber.startsWith(`${prefix}-`) || !/^\d+$/.test(suffix)) return 0;
  const number = Number(suffix);
  return Number.isSafeInteger(number) ? number : 0;
}

const snapshotText = (value: string | null) => value?.trim() || null;

export async function createB2bBatchIntake(
  db: Pick<PrismaClient, "$transaction">,
  input: ReturnType<typeof parseB2bBatchPayload>,
  adminId: number,
) {
  return db.$transaction(async (tx) => {
    // Match inquiry promotion's Customer row lock, then read the current sequence.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Customer" WHERE "id" = ${input.partnerId} FOR UPDATE`;
    if (!locked.length) throw new B2bBatchIntakeError("取引先が見つかりません。", 404);
    const partner = await tx.customer.findUnique({ where: { id: input.partnerId } });
    if (!partner || partner.type !== "business" || !partner.isPartner) {
      throw new B2bBatchIntakeError("既存の取引先を選択してください。", 409);
    }
    const prefix = partner.prefix?.trim().toUpperCase();
    if (!prefix) throw new B2bBatchIntakeError("取引先のプレフィックスが未設定です。", 409);

    const brandIds = [...new Set(input.rows.map((row) => row.brandId).filter((id): id is number => id !== null))];
    const brands = await tx.brand.findMany({
      where: { id: { in: brandIds }, isWatchBrand: true, brandKind: { not: "TYPE" } },
      select: { id: true },
    });
    if (brands.length !== brandIds.length) throw new B2bBatchIntakeError("時計ブランドを候補から選択してください。");

    for (const row of input.rows) {
      if (row.brandId !== null && row.brandName) {
        const namedBrand = await resolveBrand(tx as any, row.brandName);
        if (namedBrand?.id !== row.brandId) {
          throw new B2bBatchIntakeError("ブランドIDとブランド名が一致しません。");
        }
      }
    }

    const existing = await tx.repair.findMany({
      where: { inquiryNumber: { startsWith: `${prefix}-` } }, select: { inquiryNumber: true },
    });
    let sequence = Math.max(partner.currentSeq, ...existing.map((item) => sequenceOf(item.inquiryNumber, prefix)));
    const receivedAt = new Date();
    const repairs: Array<{ id: number; inquiryNumber: string }> = [];
    for (const row of input.rows) {
      let watchBrandId = row.brandId;
      if (!watchBrandId && row.brandName) {
        const existingBrand = await resolveBrand(tx as any, row.brandName);
        if (existingBrand?.brandKind === "TYPE") throw new B2bBatchIntakeError("種別ブランドと同名の時計ブランドは登録できません。");
        const watchBrand = await findOrCreateBrand(tx as any, row.brandName, { isWatchBrand: true });
        if (watchBrand.brandKind === "TYPE") throw new B2bBatchIntakeError("種別ブランドと同名の時計ブランドは登録できません。");
        watchBrandId = watchBrand.id;
      }
      if (!watchBrandId) throw new B2bBatchIntakeError("時計ブランドを入力してください。");
      // The existing single-entry route uses an Unknown Model master when Ref is supplied alone.
      const modelName = row.model ?? (row.ref ? "Unknown Model" : null);
      const model = modelName ? await findOrCreateModel(tx as any, watchBrandId, modelName) : null;
      const caliber = row.caliber ? await findOrCreateCaliber(tx as any, row.caliber, watchBrandId) : null;
      const reference = row.ref && model ? await findOrCreateWatchReference(tx as any, model.id, row.ref, caliber?.id) : null;
      const resolveMaker = async (name: string | null) => {
        if (!name) return null;
        const existingMaker = await resolveBrand(tx as any, name);
        if (existingMaker?.brandKind === "TYPE") throw new B2bBatchIntakeError("種別ブランドと同名のムーブメントメーカーは登録できません。");
        const maker = await findOrCreateBrand(tx as any, name, { isMovementMaker: true });
        if (maker.brandKind === "TYPE") throw new B2bBatchIntakeError("種別ブランドと同名のムーブメントメーカーは登録できません。");
        return maker.id as number;
      };
      const movementMakerId = await resolveMaker(row.movementMaker);
      const baseMovementMakerId = await resolveMaker(row.baseMovementMaker);
      const movementCaliberId = row.movementCaliber
        ? (await findOrCreateCaliber(tx as any, row.movementCaliber, movementMakerId)).id : null;
      const baseMovementCaliberId = row.baseMovementCaliber
        ? (await findOrCreateCaliber(tx as any, row.baseMovementCaliber, baseMovementMakerId)).id : null;
      const watch = await tx.watch.create({ data: {
        customerId: partner.id, brandId: watchBrandId, modelId: model?.id ?? null,
        referenceId: reference?.id ?? null, caliberId: caliber?.id ?? null,
        serialNumber: row.serial,
      } });
      sequence += 1;
      const inquiryNumber = `${prefix}-${String(sequence).padStart(3, "0")}`;
      const repair = await tx.repair.create({ data: {
        customerId: partner.id, watchId: watch.id, inquiryNumber,
        partnerRef: row.partnerRef, endUserName: row.endUserName,
        movementMakerId, movementCaliberId, baseMovementMakerId, baseMovementCaliberId,
        status: "受付", receptionDate: receivedAt, partsAllocationLegacy: false,
        workSummary: row.workSummary,
        returnRecipientName: snapshotText(partner.companyName) ?? snapshotText(partner.name),
        returnPostalCode: snapshotText(partner.zipCode),
        returnPrefecture: snapshotText(partner.prefecture),
        returnCity: snapshotText(partner.city),
        returnStreet: snapshotText(partner.street),
        returnBuilding: snapshotText(partner.building),
        returnPhone: snapshotText(partner.phone),
      } });
      await tx.repairStatusLog.create({ data: {
        repairId: repair.id, status: "受付", changedAt: receivedAt, changedBy: adminId,
      } });
      repairs.push({ id: repair.id, inquiryNumber });
    }
    await tx.customer.update({ where: { id: partner.id }, data: { currentSeq: sequence } });
    return { partnerId: partner.id, repairs };
  }, { isolationLevel: "ReadCommitted", timeout: 20000 });
}
