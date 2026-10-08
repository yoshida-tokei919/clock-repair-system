import type { PrismaClient } from "@prisma/client";

type PdfPublication = {
  invoiceId: number;
  pdfFileId: number;
  storageKey: string;
  hash: string;
  fileSize: number;
};

export async function publishInvoicePdf(
  db: PrismaClient,
  pdf: PdfPublication,
  deleteUploadedPdf: (storageKey: string) => Promise<void>,
): Promise<"published" | "failed" | "uncertain"> {
  const { invoiceId, pdfFileId, storageKey, hash, fileSize } = pdf;

  try {
    await db.$transaction(async (tx) => {
      const [lockedInvoice] = await tx.$queryRaw<{ status: string; lineSendStartedAt: Date | null }[]>`
        SELECT "status", "lineSendStartedAt" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE
      `;
      if (!lockedInvoice || !["issued", "paid"].includes(lockedInvoice.status)) {
        throw new Error("Invoice was canceled while PDF generation was in progress");
      }
      if (lockedInvoice.lineSendStartedAt) throw new Error("Invoice has an unresolved LINE send");

      await tx.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "status" = 'superseded',
            "supersededAt" = NOW()
        WHERE "invoiceId" = ${invoiceId}
          AND "status" = 'current'
          AND "id" <> ${pdfFileId}
      `;

      const published = await tx.$executeRaw`
        UPDATE "InvoicePdfFile"
        SET "storageKey" = ${storageKey},
            "fileSize" = ${fileSize},
            "hash" = ${hash},
            "status" = 'current'
        WHERE "id" = ${pdfFileId} AND "invoiceId" = ${invoiceId} AND "status" = 'draft'
      `;
      if (published !== 1) throw new Error("Invoice PDF draft is no longer publishable");

      await tx.$executeRaw`
        UPDATE "Invoice"
        SET "currentPdfFileId" = ${pdfFileId}
        WHERE "id" = ${invoiceId}
      `;
    });
    return "published";
  } catch (error) {
    console.error("Invoice PDF publication result needs reconciliation", { invoiceId, pdfFileId, error });
  }

  let result: "published" | "rolled-back";
  try {
    result = await db.$transaction(async (tx) => {
      const [invoice] = await tx.$queryRaw<{ currentPdfFileId: number | null }[]>`
        SELECT "currentPdfFileId" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE
      `;
      const [file] = await tx.$queryRaw<{
        invoiceId: number;
        status: string;
        storageKey: string;
        hash: string | null;
        fileSize: number | null;
      }[]>`
        SELECT "invoiceId", "status", "storageKey", "hash", "fileSize"
        FROM "InvoicePdfFile" WHERE "id" = ${pdfFileId} FOR UPDATE
      `;

      if (!invoice || !file || file.invoiceId !== invoiceId) throw new Error("PDF publication read-back is incomplete");
      if (invoice.currentPdfFileId === pdfFileId && file.status === "current" &&
          file.storageKey === storageKey && file.hash === hash && file.fileSize === fileSize) {
        return "published";
      }
      if (invoice.currentPdfFileId !== pdfFileId && file.status === "draft" &&
          file.storageKey === "" && file.hash === null && file.fileSize === null) {
        const updated = await tx.$executeRaw`
          UPDATE "InvoicePdfFile"
          SET "status" = 'void', "supersededAt" = NOW()
          WHERE "id" = ${pdfFileId} AND "invoiceId" = ${invoiceId} AND "status" = 'draft'
            AND NOT EXISTS (
              SELECT 1 FROM "Invoice" WHERE "id" = ${invoiceId} AND "currentPdfFileId" = ${pdfFileId}
            )
        `;
        if (updated !== 1) throw new Error("PDF draft changed during cleanup");
        return "rolled-back";
      }
      throw new Error("PDF publication read-back is inconsistent");
    });
  } catch (error) {
    console.error("Invoice PDF publication remains uncertain", { invoiceId, pdfFileId, error });
    return "uncertain";
  }

  if (result === "published") return "published";
  try {
    await deleteUploadedPdf(storageKey);
  } catch (error) {
    console.error("Invoice PDF cleanup failed", { invoiceId, pdfFileId, storageKey, error });
  }
  return "failed";
}
