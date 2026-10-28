import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";

export const customerCommentNotificationKey = (messageId: number) => `customer-comment:${messageId}`;
export const customerCommentAppUrl = (repairId: number, messageId: number, requestUrl: string) =>
  buildCustomerShareUrl(`/repairs/${repairId}/comments#message-${messageId}`, requestUrl);

export function formatCustomerCommentNotification(input: {
  inquiryNumber: string; brand?: string | null; model?: string | null; body: string; url: string;
}) {
  const safe = (value: string) => value.replace(/[<>&]/g, (char) => ({ "<": "‹", ">": "›", "&": "＆" })[char]!)
    .replace(/@/g, "＠").replace(/\s+/g, " ").trim();
  const body = Array.from(safe(input.body));
  const snippet = body.slice(0, 120).join("");
  const watch = [input.brand, input.model].filter(Boolean).map((value) => safe(value!)).join(" / ");
  return `共有ページに新しいコメント：${safe(input.inquiryNumber)}${watch ? `（${watch}）` : ""}\n${snippet}${body.length > 120 ? "…" : ""}\n<${input.url}|アプリでコメントを開く>`;
}

export async function saveCustomerCommentWithNotification(
  db: PrismaClient, repairId: number, body: string, requestUrl: string,
) {
  return db.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: repairId },
      select: { inquiryNumber: true, watch: { select: {
        brand: { select: { name: true, nameJp: true } },
        model: { select: { name: true, nameJp: true } }, modelNameInput: true,
      } } },
    });
    if (!repair) throw new Error("修理案件が見つかりません。");
    const message = await tx.repairCustomerMessage.create({
      data: { repairId, body, senderType: "partner" },
      select: { id: true, body: true, createdAt: true },
    });
    await tx.slackNotificationOutbox.create({ data: {
      target: "REPAIR_INBOX", kind: "CUSTOMER_COMMENT",
      dedupeKey: customerCommentNotificationKey(message.id),
      text: formatCustomerCommentNotification({
        inquiryNumber: repair.inquiryNumber,
        brand: repair.watch.brand.nameJp || repair.watch.brand.name,
        model: repair.watch.model?.nameJp || repair.watch.model?.name || repair.watch.modelNameInput,
        body, url: customerCommentAppUrl(repairId, message.id, requestUrl),
      }),
    } });
    return message;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
