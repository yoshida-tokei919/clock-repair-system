import type { Prisma, PrismaClient } from "@prisma/client";

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export class InvoiceLineSendError extends Error {
  constructor(message: string, readonly status: number, readonly uncertain = false,
    readonly manualVerificationRequired = false, readonly staleRevision = false) { super(message); }
}

type LockedInvoice = {
  status: string; currentPdfFileId: number | null; publicToken: string | null; lineId: string | null; sentAt: Date | null;
  lineSendRetryKey: string | null; lineSendStartedAt: Date | null; lineSendPdfFileId: number | null;
  lineSendTo: string | null; lineSendMessage: string | null; lineSendRevision: number;
};
type Reservation = { key: string; startedAt: Date; pdfFileId: number; to: string; message: string; revision: number };

async function lockedInvoice(tx: Prisma.TransactionClient, invoiceId: number) {
  const [row] = await tx.$queryRaw<LockedInvoice[]>`
    SELECT i."status", i."currentPdfFileId", i."publicToken", i."sentAt", c."lineId",
      i."lineSendRetryKey", i."lineSendStartedAt", i."lineSendPdfFileId", i."lineSendTo", i."lineSendMessage",
      i."lineSendRevision"
    FROM "Invoice" i INNER JOIN "Customer" c ON c."id" = i."customerId"
    WHERE i."id" = ${invoiceId} FOR UPDATE OF i
  `;
  if (!row) throw new InvoiceLineSendError("Invoice not found", 404);
  return row;
}

function validState(row: LockedInvoice) {
  if (!["issued", "paid"].includes(row.status)) throw new InvoiceLineSendError("Canceled invoice cannot be sent by LINE", 409);
  if (!row.currentPdfFileId) throw new InvoiceLineSendError("Invoice PDF not generated", 400);
}

export async function sendInvoiceLine(db: PrismaClient, input: {
  invoiceId: number; pdfFileId: number; publicToken: string; to: string | null; message: string; accessToken: string;
  operationKey: string; expectedRevision: number;
}, providerFetch: typeof fetch = fetch) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationKey)) {
    throw new InvoiceLineSendError("Invalid LINE operation key", 400);
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision > 2147483647) {
    throw new InvoiceLineSendError("Invalid LINE send revision", 400);
  }
  const reservation = await db.$transaction(async tx => {
    const row = await lockedInvoice(tx, input.invoiceId);
    if (row.lineSendRetryKey) {
      // A completed key is retained so a lost HTTP response can be replayed without LINE.
      if (!row.lineSendStartedAt && !row.lineSendPdfFileId && !row.lineSendTo && !row.lineSendMessage) {
        if (!row.sentAt) throw new InvoiceLineSendError("LINE send state is inconsistent. Manual verification is required", 409, false, true);
        if (row.lineSendRetryKey === input.operationKey) return { completedAt: row.sentAt };
      } else {
        if (!row.lineSendStartedAt || !row.lineSendPdfFileId || !row.lineSendTo || !row.lineSendMessage
          || row.currentPdfFileId !== row.lineSendPdfFileId) {
          throw new InvoiceLineSendError("LINE send reservation is inconsistent. Manual verification is required", 409, false, true);
        }
        if (row.lineSendRetryKey !== input.operationKey) {
          throw new InvoiceLineSendError("Another LINE send is unresolved. Retry its original operation", 409);
        }
        if (Date.now() - row.lineSendStartedAt.getTime() >= RETRY_WINDOW_MS) {
          throw new InvoiceLineSendError("LINE send retry window expired. Manual verification is required", 409, false, true);
        }
        return { key: row.lineSendRetryKey, startedAt: row.lineSendStartedAt, pdfFileId: row.lineSendPdfFileId,
          to: row.lineSendTo, message: row.lineSendMessage, revision: row.lineSendRevision };
      }
    } else if (row.lineSendStartedAt || row.lineSendPdfFileId || row.lineSendTo || row.lineSendMessage) {
      throw new InvoiceLineSendError("LINE send state is inconsistent. Manual verification is required", 409, false, true);
    }
    if (row.lineSendRevision !== input.expectedRevision || row.lineSendRevision >= 2147483647) {
      throw new InvoiceLineSendError("Invoice LINE send state changed. Reload before sending again", 409, false, false, true);
    }
    validState(row);
    if (row.currentPdfFileId !== input.pdfFileId || row.publicToken !== input.publicToken
      || row.lineId?.trim() !== input.to?.trim() || !input.to?.trim()) {
      throw new InvoiceLineSendError("Invoice changed before LINE send", 409);
    }
    const pdf = await tx.invoicePdfFile.findUnique({ where: { id: row.currentPdfFileId },
      select: { invoiceId: true, status: true, storageKey: true } });
    if (!pdf || pdf.invoiceId !== input.invoiceId || pdf.status !== "current" || !pdf.storageKey) {
      throw new InvoiceLineSendError("Current invoice PDF is unavailable", 409);
    }
    const key = input.operationKey;
    const result: Reservation = { key, startedAt: new Date(), pdfFileId: row.currentPdfFileId,
      to: input.to.trim(), message: input.message, revision: row.lineSendRevision };
    await tx.$executeRaw`
      UPDATE "Invoice" SET "lineSendRetryKey" = ${key}, "lineSendStartedAt" = ${result.startedAt},
        "lineSendPdfFileId" = ${result.pdfFileId}, "lineSendTo" = ${result.to},
        "lineSendMessage" = ${result.message} WHERE "id" = ${input.invoiceId}
    `;
    return result;
  });

  if ("completedAt" in reservation) {
    if (!reservation.completedAt) throw new InvoiceLineSendError("LINE send completion is inconsistent", 409, false, true);
    return reservation.completedAt;
  }

  let response: Response;
  try {
    response = await providerFetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json",
        "X-Line-Retry-Key": reservation.key },
      body: JSON.stringify({ to: reservation.to, messages: [{ type: "text", text: reservation.message }] }),
    });
  } catch (error) {
    console.error("LINE invoice send result uncertain", { invoiceId: input.invoiceId, error });
    throw new InvoiceLineSendError("LINE send result is uncertain. Retry the same send operation", 502, true);
  }

  const accepted = (response.status >= 200 && response.status < 300)
    || (response.status === 409 && Boolean(response.headers.get("x-line-accepted-request-id")));
  if (!accepted) {
    // Another same-key call may already be in flight and accepted. Keep the durable
    // reservation even for a 4xx so its finalization or same-key replay can finish.
    throw new InvoiceLineSendError("LINE send result is uncertain. Retry the same send operation", 502, true);
  }

  try {
    const sentAt = await db.$transaction(async tx => {
      const row = await lockedInvoice(tx, input.invoiceId);
      if (row.lineSendRetryKey === reservation.key && row.sentAt && !row.lineSendStartedAt
        && !row.lineSendPdfFileId && !row.lineSendTo && !row.lineSendMessage) {
        return row.sentAt;
      }
      validState(row);
      if (row.lineSendRetryKey !== reservation.key || row.lineSendPdfFileId !== reservation.pdfFileId
        || row.currentPdfFileId !== reservation.pdfFileId || row.lineSendRevision !== reservation.revision) {
        throw new Error("LINE reservation or invoice PDF changed after provider acceptance");
      }
      const pdf = await tx.invoicePdfFile.findUnique({ where: { id: reservation.pdfFileId },
        select: { invoiceId: true, status: true, storageKey: true } });
      if (!pdf || pdf.invoiceId !== input.invoiceId || pdf.status !== "current" || !pdf.storageKey) {
        throw new Error("Current invoice PDF changed after provider acceptance");
      }
      const at = new Date();
      await tx.invoicePdfFile.update({ where: { id: reservation.pdfFileId }, data: { sentAt: at } });
      const updated = await tx.$executeRaw`
        UPDATE "Invoice" SET "sentAt" = ${at},
          "lineSendRevision" = "lineSendRevision" + 1,
          "lineSendStartedAt" = NULL, "lineSendPdfFileId" = NULL, "lineSendTo" = NULL,
          "lineSendMessage" = NULL WHERE "id" = ${input.invoiceId} AND "lineSendRetryKey" = ${reservation.key}
          AND "lineSendRevision" = ${reservation.revision}
      `;
      if (updated !== 1) throw new Error("LINE reservation changed during finalization");
      return at;
    });
    return sentAt;
  } catch (error) {
    console.error("LINE invoice send finalization failed", { invoiceId: input.invoiceId, error });
    throw new InvoiceLineSendError("LINE accepted the message but finalization is uncertain. Retry the same operation", 502, true);
  }
}
