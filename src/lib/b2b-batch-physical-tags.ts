import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { physicalTagLabel, type PhysicalTagLabel } from "./physical-tag-label";

export class B2bBatchTagError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export function parseB2bBatchTagInput(body: unknown): number[] {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => key !== "repairIds")) throw new B2bBatchTagError(400, "入力が不正です。");
  const ids = (body as { repairIds?: unknown }).repairIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 30 ||
      ids.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) ||
      new Set(ids).size !== ids.length) throw new B2bBatchTagError(400, "修理案件IDは重複なしの1〜30件で指定してください。");
  return ids;
}

type PreparedLabel = { repairId: number; physicalTagId: number; shortCode: string; reused: boolean; label: PhysicalTagLabel };

export async function prepareB2bBatchPhysicalTags(db: PrismaClient, repairIds: number[], adminId: number): Promise<PreparedLabel[]> {
  const repairs = await db.repair.findMany({
    where: { id: { in: repairIds } },
    select: {
      id: true, customerId: true, inquiryNumber: true, endUserName: true, partnerRef: true, receptionDate: true,
      customer: { select: { type: true, name: true, companyName: true } },
      movementCaliber: { select: { name: true } },
      watch: { select: {
        modelNameInput: true, serialNumber: true,
        brand: { select: { name: true, nameJp: true } },
          model: { select: { name: true, nameJp: true } }, reference: { select: { name: true } },
        caliber: { select: { name: true } },
      } },
    },
  });
  if (repairs.length !== repairIds.length) throw new B2bBatchTagError(404, "修理案件が見つかりません。");
  if (repairs.some(repair => repair.customer.type !== "business" || repair.customerId !== repairs[0].customerId)) {
    throw new B2bBatchTagError(409, "同じB2B取引先の修理案件だけを指定してください。");
  }
  const byId = new Map(repairs.map(repair => [repair.id, repair]));
  const prepared: PreparedLabel[] = [];
  for (const repairId of repairIds) {
    const repair = byId.get(repairId)!;
    let reused = true;
    const readActive = () => db.physicalTagAssignment.findFirst({
      where: { repairId, releasedAt: null },
      select: { physicalTag: { select: { id: true, shortCode: true, qrToken: true, status: true } } },
    });
    let assignment = await readActive();
    if (!assignment) {
      for (let attempt = 0; attempt < 3 && !assignment; attempt += 1) {
        try {
          const tag = await db.$transaction(async tx => {
            const active = await tx.physicalTagAssignment.findFirst({
              where: { repairId, releasedAt: null },
              select: { physicalTag: { select: { id: true, shortCode: true, qrToken: true, status: true } } },
            });
            if (active) return { tag: active.physicalTag, created: false };
            const created = await tx.physicalTag.create({
              data: { shortCode: `PENDING-${randomBytes(16).toString("hex")}`,
                qrToken: randomBytes(24).toString("base64url"), status: "ACTIVE" },
              select: { id: true },
            });
            const issued = await tx.physicalTag.update({
              where: { id: created.id }, data: { shortCode: `PT-${String(created.id).padStart(6, "0")}` },
              select: { id: true, shortCode: true, qrToken: true, status: true },
            });
            await tx.physicalTagAssignment.create({
              data: { physicalTagId: issued.id, repairId, assignedBy: adminId, assignReason: "B2B一括受付タグ発行" },
            });
            return { tag: issued, created: true };
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
          assignment = { physicalTag: tag.tag };
          reused = !tag.created;
        } catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) ||
              (error.code !== "P2002" && error.code !== "P2034")) throw error;
          assignment = await readActive();
          if (!assignment && attempt === 2) throw new B2bBatchTagError(409, "タグの同時発行が競合しました。再度準備してください。");
        }
      }
    }
    if (!assignment || assignment.physicalTag.status !== "ACTIVE") {
      throw new B2bBatchTagError(409, "有効な管理タグを確認できません。案件を確認してください。");
    }
    const tag = assignment.physicalTag;
    prepared.push({ repairId, physicalTagId: tag.id, shortCode: tag.shortCode, reused,
      label: physicalTagLabel({
        shortCode: tag.shortCode, qrToken: tag.qrToken, inquiryNumber: repair.inquiryNumber,
        customerType: "business", customerName: repair.customer.name, companyName: repair.customer.companyName,
        endUserName: repair.endUserName, partnerRef: repair.partnerRef,
        brand: repair.watch.brand.nameJp || repair.watch.brand.name,
          model: repair.watch.model?.nameJp || repair.watch.model?.name || repair.watch.modelNameInput || "",
        reference: repair.watch.reference?.name || "", serialNumber: repair.watch.serialNumber,
        movementCaliber: repair.movementCaliber?.name ?? null, watchCaliber: repair.watch.caliber?.name ?? null,
        receptionDate: repair.receptionDate?.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) ?? null,
      }),
    });
  }
  return prepared;
}
