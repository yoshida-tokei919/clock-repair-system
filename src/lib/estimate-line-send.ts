import crypto from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";
import { estimateLineKey, estimateLineKeyPrefix } from "./estimate-line-confirmation";


export class EstimateLineNotFoundError extends Error {}
export class EstimateLineUnavailableError extends Error {}

type OriginRepair = {
  id: number;
  customerId: number;
  status: string;
  inquiryWatchPromotion: {
    id: number;
    inquiryId: number;
    promotedRepairId: number | null;
    inquiry: {
      lineUser: {
        linkedCustomerId: number | null;
        lineManagerChat: { id: number; verifiedAt: Date } | null;
      };
    };
  } | null;
};

export function resolveEstimateLineDestination(repairs: OriginRepair[], customerId: number) {
  if (!repairs.length) throw new EstimateLineUnavailableError("見積書に修理案件が紐づいていません。");
  const destinations = repairs.map((repair) => {
    const promotion = repair.inquiryWatchPromotion;
    const lineUser = promotion?.inquiry.lineUser;
    const chat = lineUser?.lineManagerChat;
    if (repair.customerId !== customerId || !promotion || promotion.promotedRepairId !== repair.id ||
        lineUser?.linkedCustomerId !== customerId || !chat?.verifiedAt) {
      throw new EstimateLineUnavailableError("見積書の修理案件に確認済みのLINE送信先がありません。");
    }
    return { inquiryId: promotion.inquiryId, lineManagerChatId: chat.id };
  });
  const first = destinations[0];
  if (destinations.some((destination) => destination.inquiryId !== first.inquiryId ||
      destination.lineManagerChatId !== first.lineManagerChatId)) {
    throw new EstimateLineUnavailableError("見積書の修理案件に複数の送信先または元の問い合わせがあります。");
  }
  return { ...first, sourceRepairId: repairs.length === 1 ? repairs[0].id : undefined };
}

async function ensurePublicToken(
  tx: Prisma.TransactionClient,
  table: "Repair" | "EstimateDocument",
  id: number,
) {
  const rows = table === "Repair"
    ? await tx.$queryRaw<{ publicToken: string | null }[]>`SELECT "publicToken" FROM "Repair" WHERE "id" = ${id}`
    : await tx.$queryRaw<{ publicToken: string | null }[]>`SELECT "publicToken" FROM "EstimateDocument" WHERE "id" = ${id}`;
  if (rows[0]?.publicToken) return rows[0].publicToken;
  // These rows are already locked by the caller. Keep the established token format and timestamp.
  const token = crypto.randomBytes(24).toString("base64url");
  const updated = table === "Repair"
    ? await tx.$executeRaw`UPDATE "Repair" SET "publicToken" = ${token}, "publicTokenCreatedAt" = NOW() WHERE "id" = ${id} AND "publicToken" IS NULL`
    : await tx.$executeRaw`UPDATE "EstimateDocument" SET "publicToken" = ${token}, "publicTokenCreatedAt" = NOW() WHERE "id" = ${id} AND "publicToken" IS NULL`;
  if (updated !== 1) throw new EstimateLineUnavailableError("共有URLを準備できませんでした。");
  return token;
}

export async function queueEstimateLineSend(
  db: PrismaClient,
  documentId: number,
  requestUrl: string,
  createApproved = createApprovedLineManagerSendOutbox,
) {
  return db.$transaction(async (tx) => {
    // Read the linkage first, then lock Customer -> document -> Repairs in a stable order.
    const initial = await tx.estimateDocument.findUnique({ where: { id: documentId }, select: { customerId: true } });
    if (!initial) throw new EstimateLineNotFoundError("見積書が見つかりません。");
    const customers = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${initial.customerId} FOR UPDATE`;
    if (customers.length !== 1) throw new EstimateLineUnavailableError("見積書の顧客を確認できません。");
    const documents = await tx.$queryRaw<{ customerId: number }[]>`SELECT "customerId" FROM "EstimateDocument" WHERE "id" = ${documentId} FOR UPDATE`;
    if (documents.length !== 1 || documents[0].customerId !== initial.customerId) {
      throw new EstimateLineUnavailableError("見積書の顧客が変更されました。");
    }
    const lockedRepairs = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Repair" WHERE "estimateDocumentId" = ${documentId} ORDER BY "id" FOR UPDATE
    `;
    const document = await tx.estimateDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true, customerId: true,
        currentPdfFile: { select: { storageKey: true } },
        repairs: { orderBy: { id: "asc" }, select: {
          id: true, customerId: true, status: true,
          inquiryWatchPromotion: { select: {
            id: true, inquiryId: true, promotedRepairId: true,
            inquiry: { select: { lineUser: { select: {
              linkedCustomerId: true,
              lineManagerChat: { select: { id: true, verifiedAt: true } },
            } } } },
          } },
        } },
      },
    });
    if (!document || document.customerId !== initial.customerId ||
        document.repairs.length !== lockedRepairs.length ||
        document.repairs.some((repair, index) => repair.id !== lockedRepairs[index]?.id)) {
      throw new EstimateLineUnavailableError("見積書の修理案件が変更されました。");
    }
    const destination = resolveEstimateLineDestination(document.repairs, document.customerId);
    if (!document.currentPdfFile?.storageKey) throw new EstimateLineUnavailableError("PDF not generated");

    const publicToken = await ensurePublicToken(tx, "EstimateDocument", documentId);
    for (const repair of document.repairs) await ensurePublicToken(tx, "Repair", repair.id);
    const estimateUrl = buildCustomerShareUrl(`/customer/repairs/${publicToken}`, requestUrl);
    const text = `お見積りを共有いたします。\n\n下記URLより、対象案件・お見積内容をご確認ください。\n${estimateUrl}\n\nご確認後、画面上の「承認」または「差戻し」よりご回答ください。`;
    const idempotencyKey = estimateLineKey(documentId, document.customerId, document.repairs);
    const existing = await tx.lineManagerSendOutbox.findFirst({
      where: { idempotencyKey: { startsWith: estimateLineKeyPrefix(documentId) } },
      select: { id: true, idempotencyKey: true },
    });
    if (existing && existing.idempotencyKey !== idempotencyKey) {
      throw new EstimateLineUnavailableError("見積書の修理案件または送信先が変更されました。");
    }
    const outbox = await createApproved(tx, {
      ...destination, text, idempotencyKey,
    });
    if (outbox.status === "CANCELLED") throw new EstimateLineUnavailableError("この見積書のLINE送信は取り消されています。");
    return { updatedRepairCount: 0, outboxStatus: outbox.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
