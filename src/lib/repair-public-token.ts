import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export class RepairPublicTokenNotFoundError extends Error {}

export async function getRepairPublicToken(db: PrismaClient, repairId: number) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairPublicTokenNotFoundError("Repairが見つかりません。");
  }
  const repair = await db.repair.findUnique({
    where: { id: repairId },
    select: { publicToken: true },
  });
  if (!repair) throw new RepairPublicTokenNotFoundError("Repairが見つかりません。");
  return repair.publicToken;
}

export async function ensureRepairPublicToken(db: PrismaClient, repairId: number) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairPublicTokenNotFoundError("Repairが見つかりません。");
  }

  const existing = await db.repair.findUnique({
    where: { id: repairId },
    select: { publicToken: true },
  });
  if (!existing) throw new RepairPublicTokenNotFoundError("Repairが見つかりません。");
  if (existing.publicToken) return existing.publicToken;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(24).toString("base64url");
    try {
      const updated = await db.repair.updateMany({
        where: { id: repairId, publicToken: null },
        data: { publicToken: token, publicTokenCreatedAt: new Date() },
      });
      if (updated.count === 1) return token;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }

    const current = await db.repair.findUnique({
      where: { id: repairId },
      select: { publicToken: true },
    });
    if (!current) throw new RepairPublicTokenNotFoundError("Repairが見つかりません。");
    if (current.publicToken) return current.publicToken;
  }

  throw new Error("Repair公開トークンを作成できませんでした。");
}
