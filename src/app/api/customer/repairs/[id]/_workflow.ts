import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function findRepairIdByPublicToken(value: string) {
  if (!value.trim()) return null;

  const repair = await prisma.repair.findUnique({
    where: { publicToken: value },
    select: { id: true },
  });

  return repair?.id ?? null;
}

export async function addStatusLogIfMissing(
  tx: Prisma.TransactionClient,
  repairId: number,
  status: string,
  changedAt = new Date()
) {
  const latest = await tx.repairStatusLog.findFirst({
    where: { repairId },
    orderBy: { id: "desc" },
  });

  if (latest?.status !== status) {
    await tx.repairStatusLog.create({
      data: { repairId, status, changedAt },
    });
  }
}
