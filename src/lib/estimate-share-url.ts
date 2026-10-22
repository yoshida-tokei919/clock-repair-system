import crypto from "crypto";
import { setTimeout } from "node:timers/promises";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";

export class EstimateShareNotFoundError extends Error {}
export class EstimateShareUnavailableError extends Error {}

const FALLBACK_PUBLIC_ORIGIN = "https://yoshidawatchrepair.com";

export function trustedEstimateOrigin(configured = process.env.NEXT_PUBLIC_APP_URL): string {
  if (!configured) return FALLBACK_PUBLIC_ORIGIN;
  try {
    const url = new URL(configured);
    if (!((url.protocol === "https:") || (url.protocol === "http:" && url.hostname === "localhost")) ||
        !url.hostname || url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash || /[?#]/.test(configured) || configured !== configured.trim()) {
      return FALLBACK_PUBLIC_ORIGIN;
    }
    return url.origin;
  } catch {
    return FALLBACK_PUBLIC_ORIGIN;
  }
}

export function parseEstimateDocumentId(rawId: string): number | null {
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}

export async function issueEstimateShareUrl(
  db: PrismaClient, documentId: number, requestUrl: string, configuredPublicOrigin?: string,
) {
  const publicOrigin = trustedEstimateOrigin(configuredPublicOrigin);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
    // Match the LINE queue's Customer -> EstimateDocument -> Repair lock order.
    const initial = await tx.estimateDocument.findUnique({
      where: { id: documentId }, select: { customerId: true },
    });
    if (!initial) throw new EstimateShareNotFoundError("見積書が見つかりません。");
    const customers = await tx.$queryRaw<{ id: number; type: string }[]>`
      SELECT "id", "type" FROM "Customer" WHERE "id" = ${initial.customerId} FOR UPDATE
    `;
    if (customers.length !== 1 || customers[0].type !== "business") {
      throw new EstimateShareUnavailableError("B2B見積書の顧客を確認できません。");
    }
    const documents = await tx.$queryRaw<{ customerId: number; publicToken: string | null }[]>`
      SELECT "customerId", "publicToken" FROM "EstimateDocument" WHERE "id" = ${documentId} FOR UPDATE
    `;
    if (documents.length !== 1 || documents[0].customerId !== initial.customerId) {
      throw new EstimateShareUnavailableError("見積書の顧客が変更されました。");
    }
    const lockedRepairs = await tx.$queryRaw<{ id: number; publicToken: string | null }[]>`
      SELECT "id", "publicToken" FROM "Repair" WHERE "estimateDocumentId" = ${documentId} ORDER BY "id" FOR UPDATE
    `;
    const document = await tx.estimateDocument.findUnique({
      where: { id: documentId },
      select: {
        customerId: true,
        repairs: { orderBy: { id: "asc" }, select: { id: true, customerId: true } },
        currentPdfFile: { select: { storageKey: true, status: true, estimateDocumentId: true } },
      },
    });
    if (!document || document.customerId !== initial.customerId ||
        document.repairs.length !== lockedRepairs.length ||
        document.repairs.some((repair, index) => repair.id !== lockedRepairs[index]?.id) ||
        !document.repairs.length || document.repairs.some((repair) => repair.customerId !== initial.customerId)) {
      throw new EstimateShareUnavailableError("見積書の修理案件を確認できません。");
    }
    if (document.currentPdfFile?.status !== "current" ||
        !document.currentPdfFile.storageKey?.trim() ||
        document.currentPdfFile.estimateDocumentId !== documentId) {
      throw new EstimateShareUnavailableError("現行の見積書PDFがありません。");
    }

    let token = documents[0].publicToken;
    if (!token) {
      token = crypto.randomBytes(24).toString("base64url");
      const updated = await tx.$executeRaw`
        UPDATE "EstimateDocument" SET "publicToken" = ${token}, "publicTokenCreatedAt" = NOW()
        WHERE "id" = ${documentId} AND "publicToken" IS NULL
      `;
      if (updated !== 1) throw new EstimateShareUnavailableError("共有URLを準備できませんでした。");
    }
    for (const repair of lockedRepairs) {
      if (repair.publicToken) continue;
      const repairToken = crypto.randomBytes(24).toString("base64url");
      const updated = await tx.$executeRaw`
        UPDATE "Repair" SET "publicToken" = ${repairToken}, "publicTokenCreatedAt" = NOW()
        WHERE "id" = ${repair.id} AND "publicToken" IS NULL
      `;
      if (updated !== 1) throw new EstimateShareUnavailableError("共有URLを準備できませんでした。");
    }
        return { url: buildCustomerShareUrl(`/customer/repairs/${encodeURIComponent(token)}`, requestUrl, publicOrigin) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000, maxWait: 10000 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2034") || attempt === 3) {
        throw error;
      }
      await setTimeout(25 * attempt);
    }
  }
  throw new EstimateShareUnavailableError("共有URLを準備できませんでした。");
}
