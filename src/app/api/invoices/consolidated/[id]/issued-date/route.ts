import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { parseIssuedDate } from "@/lib/document-issued-date";
import { consolidatedDeliveryKey, hasIndividualInvoiceOutbox, lockAndCheckConsolidatedSources } from "@/lib/consolidated-invoice-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const raw = (await params).id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return NextResponse.json({ error: "集約請求IDが不正です。" }, { status: 400 });
  let issuedDate: Date;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1) throw new Error("発行日が不正です。");
    issuedDate = parseIssuedDate(body.issuedDate);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "発行日が不正です。" }, { status: 400 });
  }
  try {
    await prisma.$transaction(async tx => {
      const { invoices } = await lockAndCheckConsolidatedSources(tx, id);
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ConsolidatedInvoice" WHERE "id" = ${id} FOR UPDATE`;
      if (locked.length !== 1) throw new Error("集約請求が見つかりません。");
      const stateRows = await tx.$queryRaw<{ consolidatedInvoiceId: number }[]>`SELECT "consolidatedInvoiceId" FROM "ConsolidatedInvoiceIssueState" WHERE "consolidatedInvoiceId" = ${id} FOR UPDATE`;
      if (stateRows.length !== 1) throw new Error("発行日を確認できません。");
      const publication = await tx.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: id }, select: { id: true } });
      if (publication) throw new Error("PDF生成後の発行日は変更できません。");
      if (await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: consolidatedDeliveryKey(id) }, select: { id: true } })) throw new Error("LINE送信履歴があるため発行日は変更できません。");
      for (const invoice of invoices) {
        if (invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt || invoice.pdfFiles.some(file => file.sentAt)) throw new Error("元請求書に個別送信履歴があるため発行日は変更できません。");
        if (await hasIndividualInvoiceOutbox(tx, invoice.id)) throw new Error("元請求書に個別LINE送信履歴があるため発行日は変更できません。");
      }
      await tx.consolidatedInvoiceIssueState.update({ where: { consolidatedInvoiceId: id }, data: { issuedDate } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "発行日を変更できません。" }, { status: 409 });
  }
}
