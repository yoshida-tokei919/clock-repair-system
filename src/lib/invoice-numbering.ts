import type { Prisma } from "@prisma/client";

export function getNextB2CInvoiceNumber(invoiceNumbers: string[]) {
  let largestSequence = 0;

  for (const invoiceNumber of invoiceNumbers) {
    const match = /^CI-(\d+)$/.exec(invoiceNumber);
    if (!match) continue;

    const sequence = Number(match[1]);
    if (Number.isSafeInteger(sequence)) {
      largestSequence = Math.max(largestSequence, sequence);
    }
  }

  return `CI-${String(largestSequence + 1).padStart(3, "0")}`;
}

export async function getNextB2CInvoiceNumberForTransaction(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(168002)`;
  const existingB2CInvoices = await tx.invoice.findMany({
    where: { invoiceNumber: { startsWith: "CI-" } },
    select: { invoiceNumber: true },
  });
  return getNextB2CInvoiceNumber(existingB2CInvoices.map(({ invoiceNumber }) => invoiceNumber));
}

export function getB2CPaymentDueDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));

  return new Date(Date.UTC(year, month - 1, day + 7));
}
