import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function findRepairIdByIdOrToken(value: string) {
  const numericId = Number(value);
  if (Number.isInteger(numericId)) {
    const repair = await prisma.repair.findUnique({
      where: { id: numericId },
      select: { id: true },
    });
    if (repair) return repair.id;
  }

  const [row] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "Repair"
    WHERE "publicToken" = ${value}
    LIMIT 1
  `;

  return row?.id ?? null;
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
