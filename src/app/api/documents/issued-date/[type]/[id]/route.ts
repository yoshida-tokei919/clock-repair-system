import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { canChangeDeliveryIssuedDate, canChangeInvoiceIssuedDate, canChangeUnrenderedIssuedDate, parseIssuedDate } from "@/lib/document-issued-date";
import { hasUnresolvedInvoiceLineOutbox } from "@/lib/invoice-delivery-routing";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { type, id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  let issuedDate: Date;
  try { issuedDate = parseIssuedDate((await request.json()).issuedDate); }
  catch { return NextResponse.json({ error: "有効な発行日を指定してください" }, { status: 400 }); }

  try {
    await prisma.$transaction(async tx => {
      if (type === "delivery") {
        const [note] = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "DeliveryNote" WHERE "id" = ${id} FOR UPDATE`;
        if (!note) throw new Error("書類が見つかりません");
        const historical = await tx.invoiceRepairSnapshot.count({ where: { deliveryNoteId: id } });
        const linked = await tx.repair.count({ where: { deliveryNoteId: id, invoiceId: { not: null } } });
        if (!canChangeDeliveryIssuedDate(historical > 0, linked > 0)) throw new Error("請求済みの納品書は発行日を変更できません");
        await tx.deliveryNote.update({ where: { id }, data: { issuedDate } });
      } else if (type === "warranty") {
        const updated = await tx.warranty.updateMany({ where: { id }, data: { issuedDate } });
        if (updated.count !== 1) throw new Error("書類が見つかりません");
      } else if (type === "estimate") {
        const [doc] = await tx.$queryRaw<{ currentPdfFileId: number | null }[]>`SELECT "currentPdfFileId" FROM "EstimateDocument" WHERE "id" = ${id} FOR UPDATE`;
        if (!doc) throw new Error("書類が見つかりません");
        if (!canChangeUnrenderedIssuedDate(doc.currentPdfFileId !== null)) throw new Error("保存済みPDFがあるため、PDF再生成経路で変更してください");
        await tx.estimateDocument.update({ where: { id }, data: { issuedDate } });
      } else if (type === "invoice") {
        const [doc] = await tx.$queryRaw<{ currentPdfFileId: number | null; status: string; lineSendStartedAt: Date | null }[]>`
          SELECT "currentPdfFileId", "status", "lineSendStartedAt" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
        if (!doc) throw new Error("書類が見つかりません");
        if (!canChangeInvoiceIssuedDate(doc.status, !!doc.lineSendStartedAt, await hasUnresolvedInvoiceLineOutbox(tx, id))) throw new Error("この請求書は発行日を変更できません");
        if (!canChangeUnrenderedIssuedDate(doc.currentPdfFileId !== null)) throw new Error("保存済みPDFがあるため、PDF再生成経路で変更してください");
        await tx.invoice.update({ where: { id }, data: { issuedDate } });
      } else throw new Error("書類種別が不正です");
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "変更に失敗しました" }, { status: 409 });
  }
}
