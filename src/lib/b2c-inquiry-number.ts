import type { Prisma } from "@prisma/client";

/** Issue a number in the shared B2C C-* namespace within the caller's transaction. */
export async function nextB2cInquiryNumber(tx: Prisma.TransactionClient, customerId: number) {
  // Keep Customer before the shared advisory lock, matching intake's existing lock order.
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(163)`;

  const repairs = await tx.repair.findMany({
    where: { inquiryNumber: { startsWith: "C-" } },
    select: { inquiryNumber: true },
  });
  const maxSequence = repairs.reduce((max, repair) => {
    const suffix = repair.inquiryNumber.slice(2);
    if (!/^\d+$/.test(suffix)) return max;
    const sequence = Number(suffix);
    return Number.isSafeInteger(sequence) ? Math.max(max, sequence) : max;
  }, 1000);
  const sequence = maxSequence + 1;

  await tx.customer.update({ where: { id: customerId }, data: { currentSeq: sequence, prefix: "C" } });
  return `C-${String(sequence).padStart(4, "0")}`;
}
