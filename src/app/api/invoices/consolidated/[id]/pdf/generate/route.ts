import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { assertConsolidatedSourceUnpaid, buildConsolidatedPdfData, consolidatedBundleInclude, consolidatedDeliveryNotePdfFileName, newConsolidatedShareToken, type ConsolidatedBundle } from "@/lib/consolidated-invoice-publication";
import { renderConsolidatedInvoicePdf } from "@/lib/consolidated-invoice-pdf";
import { calculateInvoicePdfHash } from "@/lib/invoice-pdf-storage";
import { deleteConsolidatedPdf, uploadConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";
import { consolidatedDeliveryKey, lockAndCheckConsolidatedSources } from "@/lib/consolidated-invoice-operations";
import { invoiceDeliveryKey } from "@/lib/invoice-delivery-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkSources(tx: Prisma.TransactionClient, bundle: ConsolidatedBundle) {
    const checked = await lockAndCheckConsolidatedSources(tx, bundle.id);
    if (await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: consolidatedDeliveryKey(bundle.id) }, select: { id: true } })) throw new Error("Consolidated LINE outbox exists");
    for (const invoice of checked.invoices) {
      if (invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt || invoice.pdfFiles.some(file => file.sentAt) ||
        await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: invoiceDeliveryKey(invoice.id) }, select: { id: true } })) throw new Error("Individual delivery exists");
    }
    const ids = bundle.sources.map(source => source.invoiceId).sort((a, b) => a - b);
    for (const sourceId of ids) await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${sourceId} FOR UPDATE`;
    const invoices = await tx.invoice.findMany({ where: { id: { in: ids } }, select: {
      id: true, invoiceNumber: true, customerId: true, grossTotalAmount: true, status: true, paymentDueDate: true,
      paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
        payment: { select: { customerId: true, status: true, kind: true,
          refunds: { select: { amount: true, status: true } } } } } },
    } });
    const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
    for (const source of bundle.sources) assertConsolidatedSourceUnpaid(source, byId.get(source.invoiceId));
    return bundle.sources.map(source => byId.get(source.invoiceId)!.paymentDueDate);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if ((await request.text()).trim()) return NextResponse.json({ error: "PDF生成後の発行日変更・再発行は現在利用できません。" }, { status: 409 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid bundle id" }, { status: 400 });
  const existing = await prisma.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: id } });
  if (existing?.status === "current" && existing.storageKey) return NextResponse.json({ ok: true, ready: true });
  if (existing) return NextResponse.json({ error: "PDF生成中です。時間を置いて再読み込みしてください。" }, { status: 409 });

  const bundle = await prisma.consolidatedInvoice.findUnique({ where: { id }, include: consolidatedBundleInclude });
  if (!bundle) return NextResponse.json({ error: "集約請求が見つかりません。" }, { status: 404 });
  if (!bundle.issueState) return NextResponse.json({ error: "発行日を確認できません。" }, { status: 409 });
  let dueDates: (Date | null)[];
  try { dueDates = await prisma.$transaction(tx => checkSources(tx, bundle)); }
  catch { return NextResponse.json({ error: "元請求書に入金・処理中決済があるか、状態が変更されました。" }, { status: 409 }); }
  let buffer: Buffer;
  try {
    const data = buildConsolidatedPdfData(bundle, dueDates);
    buffer = await renderConsolidatedInvoicePdf(data);
    if (buffer.length === 0) throw new Error("Empty PDF");
  } catch (error) {
    console.error("Consolidated PDF rendering failed", { id, error });
    return NextResponse.json({ error: "集約請求PDFを作成できません。" }, { status: 409 });
  }
  const fileName = consolidatedDeliveryNotePdfFileName(id);
  let publication: { id: number };
  try {
    publication = await prisma.$transaction(async tx => {
      const latestDueDates = await checkSources(tx, bundle);
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ConsolidatedInvoice" WHERE "id" = ${id} FOR UPDATE`;
      if (locked.length !== 1) throw new Error("Bundle changed");
      const stateRows = await tx.$queryRaw<{ issuedDate: Date }[]>`SELECT "issuedDate" FROM "ConsolidatedInvoiceIssueState" WHERE "consolidatedInvoiceId" = ${id} FOR UPDATE`;
      if (stateRows.length !== 1 || stateRows[0].issuedDate.getTime() !== bundle.issueState!.issuedDate.getTime()) throw new Error("Issue date changed");
      if (latestDueDates.some((date, index) => date?.getTime() !== dueDates[index]?.getTime())) {
        throw new Error("Source due date changed");
      }
      return tx.consolidatedInvoicePublication.create({ data: {
        consolidatedInvoiceId: id, fileName, publicToken: newConsolidatedShareToken(),
      }, select: { id: true } });
    });
  } catch {
    return NextResponse.json({ error: "PDFは生成済み、または生成中です。再読み込みしてください。" }, { status: 409 });
  }
  const storageKey = `consolidated-invoices/${id}/${publication.id}-${randomUUID()}.pdf`;
  try {
    await uploadConsolidatedPdf(storageKey, buffer);
    const updated = await prisma.consolidatedInvoicePublication.updateMany({ where: {
      id: publication.id, consolidatedInvoiceId: id, status: "draft", storageKey: null,
    }, data: { status: "current", storageKey, hash: calculateInvoicePdfHash(buffer), fileSize: buffer.length, publishedAt: new Date() } });
    if (updated.count !== 1) throw new Error("Publication claim changed");
    return NextResponse.json({ ok: true, ready: true });
  } catch (error) {
    console.error("Consolidated PDF publication failed", { id, publicationId: publication.id, error });
    // A failed DB write can have committed. Re-read before removing the object.
    try {
      const current = await prisma.consolidatedInvoicePublication.findUnique({ where: { id: publication.id } });
      if (current?.status === "current" && current.storageKey === storageKey) return NextResponse.json({ ok: true, ready: true });
      if (!current || current.status !== "draft" || current.storageKey !== null) throw new Error("Publication state uncertain");
      await deleteConsolidatedPdf(storageKey);
      await prisma.consolidatedInvoicePublication.delete({ where: { id: publication.id } });
      return NextResponse.json({ error: "集約請求PDFを保存できません。" }, { status: 500 });
    } catch (reconcileError) {
      console.error("Consolidated PDF publication requires reconciliation", { id, publicationId: publication.id, error: reconcileError });
      return NextResponse.json({ error: "PDF公開結果が不明です。再生成せず管理者が保存先を確認してください。" }, { status: 503 });
    }
  }
}
