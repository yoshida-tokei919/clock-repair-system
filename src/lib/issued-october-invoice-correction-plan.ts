import { invoiceAmountsWithDiscount } from "./b2b-invoice-discount";
import { createHash } from "node:crypto";

export const OCTOBER_TARGETS = [
  { id: 1, number: "OI-001", prefix: "O", count: 3, old: [42500, 4250, 487, 47237], corrected: [41225, 4122, 487, 45834, 1275] },
  { id: 3, number: "JI-001", prefix: "J", count: 5, old: [43500, 4350, 1442, 49292], corrected: [42195, 4219, 1442, 47856, 1305] },
  { id: 4, number: "TI-001", prefix: "T", count: 12, old: [91000, 9100, 0, 100100], corrected: [88270, 8827, 0, 97097, 2730] },
  { id: 5, number: "GI-001", prefix: "G", count: 1, old: [3000, 300, 679, 3979], corrected: [2910, 291, 679, 3880, 90] },
  { id: 6, number: "KI-001", prefix: "K", count: 6, old: [71500, 7150, 679, 79329], corrected: [69355, 6935, 679, 76969, 2145] },
  { id: 7, number: "SI-001", prefix: "S", count: 4, old: [2200, 220, 679, 3099], corrected: [2134, 213, 679, 3026, 66] },
] as const;

export function verifiedOctoberAmounts(net: number, shipping: number) {
  return invoiceAmountsWithDiscount(net, shipping, "EXCLUSIVE", 300);
}

export function assertNoOctoberDeliveryOrPayment(row: {
  status: string; sentAt: Date | null; lineSendRetryKey: string | null; lineSendStartedAt: Date | null;
  allocationCount: number; pdfSentCount: number; paymentCount: number; outboxCount: number;
  lineSendPdfFileId: number | null; pdfPaidCount: number;
}) {
  if (row.status !== "issued" || row.sentAt || row.lineSendRetryKey || row.lineSendStartedAt ||
    row.lineSendPdfFileId !== null || row.allocationCount !== 0 || row.pdfSentCount !== 0 ||
    row.pdfPaidCount !== 0 || row.paymentCount !== 0 || row.outboxCount !== 0) {
    throw new Error("Sent, paid, pending, or changed invoice cannot be corrected");
  }
}

export function pendingOctoberNumber(canonical: string) { return `CORR-PENDING-${canonical}`; }
export function archivedOctoberNumber(canonical: string) { return `ARCHIVED-202610-${canonical}`; }

export function assertExpectedCorrectionNumber(sequence: number, canonical: string, pendingExists: boolean, archivedExists: boolean) {
  if (sequence !== 1 || !OCTOBER_TARGETS.some(row => row.number === canonical) || pendingExists || archivedExists) {
    throw new Error("Correction invoice number is unavailable");
  }
}

export function assertCorrectionNotStarted(existing: unknown) {
  if (existing) throw new Error("Correction already started");
}

export function assertStoredPdfMatches(bytes: Buffer, expectedSize: number | null, expectedHash: string | null) {
  if (!expectedSize || !expectedHash || bytes.length !== expectedSize ||
    createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
    throw new Error("Stored PDF bytes do not match the issued record");
  }
}
