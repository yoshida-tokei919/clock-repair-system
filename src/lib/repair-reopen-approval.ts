import type { Prisma, PrismaClient } from "@prisma/client";

export const REOPEN_EVENT_PREFIX = "EVENT:REOPENED:";
export class ReopenApprovalError extends Error {}
export class HistoricalEstimateDocumentError extends Error {}

export type ReopenEvent = { boundary: number; oldDocumentId: number | null; charge: number | null;
  shipping: number | null; tax: number | null; total: number | null; taxMode: "INCLUSIVE" | "EXCLUSIVE" | null };

/** Versioned, ID-only audit payload. The numeric legacy form remains readable. */
export function parseReopenEvent(status: string): ReopenEvent | null {
  if (!status.startsWith(REOPEN_EVENT_PREFIX)) return null;
  const body = status.slice(REOPEN_EVENT_PREFIX.length);
  if (/^(0|[1-9]\d*)$/.test(body)) {
    const boundary = Number(body);
    return Number.isSafeInteger(boundary) ? { boundary, oldDocumentId: null, charge: null, shipping: null,
      tax: null, total: null, taxMode: null } : null;
  }
  const match = /^v2:(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*):(I|E)$/.exec(body);
  if (!match) return null;
  const [boundary, oldDocument, charge, shipping, tax, total] = match.slice(1, 7).map(Number);
  if ([boundary, oldDocument, charge, shipping, tax, total].some(value => !Number.isSafeInteger(value))) return null;
  return { boundary, oldDocumentId: oldDocument || null, charge, shipping, tax, total,
    taxMode: match[7] === "I" ? "INCLUSIVE" : "EXCLUSIVE" };
}

export function encodeReopenEvent(event: { boundary: number; oldDocumentId: number | null; charge: number;
  shipping: number; tax: number; total: number; taxMode: "INCLUSIVE" | "EXCLUSIVE" }): string {
  const values = [event.boundary, event.oldDocumentId ?? 0, event.charge, event.shipping, event.tax, event.total];
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("再開履歴の金額または文書IDが不正です。");
  return `${REOPEN_EVENT_PREFIX}v2:${values.join(":")}:${event.taxMode === "INCLUSIVE" ? "I" : "E"}`;
}

/** Reject regeneration of a document retained as historical by any reopened repair. */
export async function assertEstimateDocumentNotArchived(db: PrismaClient | Prisma.TransactionClient, documentId: number) {
  if (await isEstimateDocumentArchived(db, documentId)) {
    throw new HistoricalEstimateDocumentError("再開前の見積書は履歴として保存されています。PDFを再生成できません。");
  }
}

export async function isEstimateDocumentArchived(db: PrismaClient | Prisma.TransactionClient, documentId: number) {
  const events = await db.repairStatusLog.findMany({
    where: { status: { startsWith: `${REOPEN_EVENT_PREFIX}v2:`, contains: `:${documentId}:` } },
    select: { status: true },
  });
  return events.some(event => parseReopenEvent(event.status)?.oldDocumentId === documentId);
}

/** The event records the largest document ID visible while the repair was locked. */
export async function assertFreshReopenEstimate(tx: Prisma.TransactionClient, repairId: number, repair: {
  estimateDocumentId: number | null;
  estimate: { items: { itemName: string; quantity: number; unitPrice: number; createdAt: Date }[] } | null;
}, options: { allowEmptyCommonLines?: boolean } = {}) {
  const event = await tx.repairStatusLog.findFirst({
    where: { repairId, status: { startsWith: REOPEN_EVENT_PREFIX } },
    orderBy: { id: "desc" }, select: { status: true, changedAt: true },
  });
  if (!event) return;
  const marker = parseReopenEvent(event.status);
  if (!marker || !repair.estimateDocumentId || repair.estimateDocumentId <= marker.boundary ||
      !repair.estimate || (!options.allowEmptyCommonLines && !repair.estimate.items.length) ||
      repair.estimate.items.some(item => !item.itemName.trim() || item.quantity <= 0 || item.unitPrice < 0)) {
    throw new ReopenApprovalError("再開後の見積明細を保存し、新しい見積書を発行してから承認してください。");
  }
  const document = await tx.estimateDocument.findUnique({
    where: { id: repair.estimateDocumentId },
    select: { currentPdfFile: { select: { generatedAt: true, status: true, storageKey: true, hash: true } } },
  });
  const pdf = document?.currentPdfFile;
  if (!pdf || pdf.status !== "current" || !pdf.storageKey || !pdf.hash || pdf.generatedAt <= event.changedAt ||
      repair.estimate.items.some(item => item.createdAt > pdf.generatedAt)) {
    throw new ReopenApprovalError("再開後の見積PDFを発行してから承認してください。");
  }
}
