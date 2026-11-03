import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { parseIssuedDate } from "@/lib/document-issued-date";
import { buildConsolidatedPdfData, consolidatedBundleInclude, isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";
import { consolidatedDeliveryKey, consolidatedPaymentPurpose, hasIndividualInvoiceOutbox, lockAndCheckConsolidatedSources } from "@/lib/consolidated-invoice-operations";
import { renderConsolidatedInvoicePdf } from "@/lib/consolidated-invoice-pdf";
import { downloadConsolidatedPdf, uploadConsolidatedPdf, deleteConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkedState(tx: Prisma.TransactionClient, id: number, lock: boolean) {
  const { invoices } = await lockAndCheckConsolidatedSources(tx, id);
  if (lock) {
    const parent = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ConsolidatedInvoice" WHERE "id" = ${id} FOR UPDATE`;
    const state = await tx.$queryRaw<{ consolidatedInvoiceId: number }[]>`SELECT "consolidatedInvoiceId" FROM "ConsolidatedInvoiceIssueState" WHERE "consolidatedInvoiceId" = ${id} FOR UPDATE`;
    const publication = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ConsolidatedInvoicePublication" WHERE "consolidatedInvoiceId" = ${id} FOR UPDATE`;
    if (parent.length !== 1 || state.length !== 1 || publication.length !== 1) throw new Error("Publication changed");
  }
  if (await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: consolidatedDeliveryKey(id) }, select: { id: true } })) throw new Error("LINE delivery history exists");
  for (const invoice of invoices) {
    if (invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt || invoice.pdfFiles.some(file => file.sentAt) ||
      await hasIndividualInvoiceOutbox(tx, invoice.id)) throw new Error("Individual delivery history exists");
  }
  if (await tx.payment.count({ where: { OR: [
    { purpose: consolidatedPaymentPurpose(id) },
    { repair: { invoiceId: { in: invoices.map(row => row.id) } } },
  ] } })) throw new Error("Payment history exists");
  const bundle = await tx.consolidatedInvoice.findUnique({ where: { id }, include: {
    ...consolidatedBundleInclude, publication: true,
  } });
  if (!bundle?.issueState || !isCurrentConsolidatedPdf(bundle.publication) || !bundle.publication.publishedAt ||
    !validConsolidatedShareToken(bundle.publication.publicToken) ||
    !Number.isSafeInteger(bundle.publication.version) || bundle.publication.version < 1 ||
    !Number.isSafeInteger(bundle.publication.fileSize) || !/^[a-f0-9]{64}$/.test(bundle.publication.hash) ||
    bundle.publication.fileName.length === 0) throw new Error("Published PDF metadata is incomplete");
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  if (bundle.sources.some(source => {
    const invoice = invoiceById.get(source.invoiceId);
    return !invoice || invoice.invoiceNumber !== source.invoiceNumber || invoice.customerId !== source.sourceCustomerId;
  })) throw new Error("Source invoice identity changed");
  const dueDates = await tx.invoice.findMany({ where: { id: { in: invoices.map(row => row.id) } },
    select: { id: true, paymentDueDate: true }, orderBy: { id: "asc" } });
  if (dueDates.length !== bundle.sources.length) throw new Error("Source due dates changed");
  // Include all frozen fields, delivery notes, current pointer and source due dates in the race check.
  const fingerprint = JSON.stringify({ bundle, dueDates });
  return { bundle, dueDates: dueDates.map(row => row.paymentDueDate), fingerprint };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  let initial: Awaited<ReturnType<typeof checkedState>>;
  try {
    initial = await prisma.$transaction(tx => checkedState(tx, id, false), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const previous = initial.bundle.publication!;
    const oldPdf = await downloadConsolidatedPdf(previous.storageKey!);
    if (oldPdf.length !== previous.fileSize || createHash("sha256").update(oldPdf).digest("hex") !== previous.hash) throw new Error("現在のPDFの整合性を確認できません。");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "再発行の条件を確認できません。" }, { status: 409 });
  }
  let buffer: Buffer;
  try {
    const revised = { ...initial.bundle, issueState: { ...initial.bundle.issueState!, issuedDate } };
    buffer = await renderConsolidatedInvoicePdf(buildConsolidatedPdfData(revised, initial.dueDates));
    if (buffer.length === 0) throw new Error("Empty PDF");
  } catch (error) {
    console.error("Consolidated reissue rendering failed", { id, error });
    return NextResponse.json({ error: "再発行PDFを作成できません。" }, { status: 409 });
  }
  const previous = initial.bundle.publication!;
  const storageKey = `consolidated-invoices/${id}/${previous.id}-${randomUUID()}.pdf`;
  const version = previous.version + 1;
  const hash = createHash("sha256").update(buffer).digest("hex");
  const fileName = `consolidated_invoice_${id}_v${version}_net_delivery_notes.pdf`;
  try { await uploadConsolidatedPdf(storageKey, buffer); }
  catch (error) {
    console.error("Consolidated reissue upload failed", { id, storageKey, error });
    return NextResponse.json({ error: "再発行PDFを保存できません。保存先を確認してください。" }, { status: 503 });
  }
  try {
    await prisma.$transaction(async tx => {
      const latest = await checkedState(tx, id, true);
      if (latest.fingerprint !== initial.fingerprint) throw new Error("請求書またはPDFの状態が変更されました。");
      await tx.consolidatedInvoicePdfHistory.create({ data: {
        consolidatedInvoiceId: id, version: previous.version, issuedDate: initial.bundle.issueState!.issuedDate,
        storageKey: previous.storageKey!, fileName: previous.fileName, hash: previous.hash!,
        fileSize: previous.fileSize!, publishedAt: previous.publishedAt!,
      } });
      await tx.consolidatedInvoicePublication.update({ where: { id: previous.id }, data: {
        version, storageKey, fileName, hash, fileSize: buffer.length, publishedAt: new Date(),
      } });
      await tx.consolidatedInvoiceIssueState.update({ where: { consolidatedInvoiceId: id }, data: { issuedDate } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    console.error("Consolidated reissue transaction failed", { id, storageKey, error });
    // A network error may follow a committed transaction. Delete only after confirming no commit.
    try {
      const current = await prisma.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: id } });
      const history = await prisma.consolidatedInvoicePdfHistory.findUnique({ where: {
        consolidatedInvoiceId_version: { consolidatedInvoiceId: id, version: previous.version },
      } });
      if (current?.storageKey === storageKey && current.version === version && history?.storageKey === previous.storageKey) {
        return NextResponse.json({ ok: true, version });
      }
      // The new UUID must have no current or historical DB reference before cleanup.
      const newKeyHistory = await prisma.consolidatedInvoicePdfHistory.findFirst({ where: { storageKey }, select: { id: true } });
      if (current?.storageKey !== previous.storageKey || current?.version !== previous.version || history || newKeyHistory) {
        throw new Error("Publication state uncertain; uploaded object retained for reconciliation");
      }
      await deleteConsolidatedPdf(storageKey);
      return NextResponse.json({ error: "請求書の状態が変更されたため再発行を中止しました。" }, { status: 409 });
    } catch (reconcileError) {
      console.error("Consolidated reissue requires reconciliation", { id, storageKey, error: reconcileError });
      return NextResponse.json({ error: "再発行結果が不明です。再試行せず保存先と履歴を確認してください。" }, { status: 503 });
    }
  }
}
