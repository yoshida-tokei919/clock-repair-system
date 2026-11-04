import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCorrectionNotStarted, assertExpectedCorrectionNumber, assertNoOctoberDeliveryOrPayment, assertStoredPdfMatches, OCTOBER_TARGETS, verifiedOctoberAmounts } from "./issued-october-invoice-correction-plan";
import { hasConsistentInvoiceSnapshots } from "./invoice-repair-snapshots";
import { invoicePdfParties, nextB2BSourceInvoiceNumber } from "./invoice-recipient";
import { displayIssuedDate } from "./document-issued-date";
import { buildInvoicePdfStorageKey } from "./invoice-pdf-storage-key";
import { calculateInvoicePdfHash, downloadInvoicePdf, uploadInvoicePdf } from "./invoice-pdf-storage";
import { buildConsolidatedPdfData, consolidatedBundleInclude, consolidatedDeliveryNotePdfFileName, newConsolidatedShareToken } from "./consolidated-invoice-publication";
import { renderConsolidatedInvoicePdf } from "./consolidated-invoice-pdf";
import { downloadConsolidatedPdf, uploadConsolidatedPdf } from "./r2-consolidated-invoice-pdf";
import { renderInvoicePdfBuffer } from "./invoice-pdf-render";
import type { InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { consolidatedDeliveryKey } from "./consolidated-invoice-operations";
import { invoiceDeliveryKey } from "./invoice-delivery-routing";

export const OCTOBER_CORRECTION_KEY = "issued-b2b-2026-10-discount-20261105";
export const OCTOBER_OLD_BUNDLE_ID = 1;
const ids = OCTOBER_TARGETS.map(row => row.id);

export class OctoberCorrectionError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
function fail(message: string): never { throw new OctoberCorrectionError(message); }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function snapshotSignature(rows: Array<{ repairId: number; inquiryNumber: string; deliveryNoteId: number | null;
  deliverySlipNumber: string | null; deliveryIssuedDate: Date | null; deliveryDateActual: Date | null;
  subtotalAmount: number; grossAmount: number | null; deliveryShippingFee: number; createdAt: Date }>) {
  return digest([...rows].sort((a, b) => a.repairId - b.repairId).map(row => ({
    repairId: row.repairId, inquiryNumber: row.inquiryNumber, deliveryNoteId: row.deliveryNoteId,
    deliverySlipNumber: row.deliverySlipNumber, deliveryIssuedDate: row.deliveryIssuedDate,
    deliveryDateActual: row.deliveryDateActual, subtotalAmount: row.subtotalAmount,
    grossAmount: row.grossAmount, deliveryShippingFee: row.deliveryShippingFee, createdAt: row.createdAt,
  })));
}
function noteSignature(rows: Array<{ deliveryNoteId: number | null; slipNumber: string | null;
  issuedDate: Date | null; repairCount: number; subtotalAmount: number | null }>) {
  return digest(rows.map(row => ({ deliveryNoteId: row.deliveryNoteId, slipNumber: row.slipNumber,
    issuedDate: row.issuedDate, repairCount: row.repairCount, subtotalAmount: row.subtotalAmount })));
}

function correctionInvoicePdfData(invoice: NonNullable<Awaited<ReturnType<typeof correctionInvoiceForPdf>>>): InvoiceDocumentProps["data"] {
  const parties = invoicePdfParties(invoice);
  const groups = new Map<string, { date: Date; slipNumber: string; count: number; amount: number }>();
  for (const row of invoice.repairSnapshots) {
    const key = row.deliveryNoteId ? `id:${row.deliveryNoteId}` : row.deliverySlipNumber ? `slip:${row.deliverySlipNumber}` : "unlinked";
    const date = row.deliveryIssuedDate ?? row.deliveryDateActual ?? invoice.issuedDate;
    const existing = groups.get(key);
    if (existing) { existing.count++; existing.amount += row.subtotalAmount; if (date < existing.date) existing.date = date; }
    else groups.set(key, { date, slipNumber: row.deliverySlipNumber ?? "未紐付け", count: 1, amount: row.subtotalAmount });
  }
  return { invoiceNumber: invoice.invoiceNumber, date: displayIssuedDate(invoice.issuedDate),
    dueDate: invoice.paymentDueDate?.toLocaleDateString("ja-JP") || "",
    customer: parties.recipient, sourceCustomerName: parties.sourceCustomerName,
    items: [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).map(row => ({
      date: displayIssuedDate(row.date), slipNumber: row.slipNumber, description: `${row.count}点`, amount: row.amount,
    })), taxRate: 0.1, pricingTaxMode: invoice.pricingTaxMode, subtotalAmount: invoice.totalAmount,
    discountBasisAmount: invoice.discountBasisAmount, discountRateBps: invoice.discountRateBps,
    discountAmount: invoice.discountAmount, taxAmount: invoice.taxAmount,
    shippingFeeAmount: invoice.shippingFeeAmount, grossTotalAmount: invoice.grossTotalAmount,
    prepaymentAppliedAmount: 0,
    bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ" };
}

function correctionInvoiceForPdf(db: PrismaClient, id: number) {
  return db.invoice.findUnique({ where: { id }, include: { customer: true, billingCustomer: true, repairSnapshots: true } });
}

async function inspect(db: Prisma.TransactionClient | PrismaClient, lock = false, prepared = false) {
  if (lock) {
    // The fixed ID set is checked below. Lock rows in stable order before reading state.
    const observed = await db.invoice.findMany({ where: { id: { in: ids } }, select: { customerId: true } });
    for (const id of [...new Set(observed.map(row => row.customerId))].sort((a, b) => a - b)) {
      await db.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id} FOR UPDATE`;
    }
    for (const id of ids) await db.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
    await db.$queryRaw`SELECT "id" FROM "ConsolidatedInvoice" WHERE "id" = ${OCTOBER_OLD_BUNDLE_ID} FOR UPDATE`;
  }
  const invoices = await db.invoice.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" }, include: {
    customer: { select: { id: true, type: true, prefix: true, seqInvoice: true, name: true, companyName: true } },
    repairs: { select: { id: true }, orderBy: { id: "asc" } },
    repairSnapshots: { orderBy: { id: "asc" } },
    paymentAllocations: { select: { id: true } },
    pdfFiles: { orderBy: { version: "asc" } },
    currentPdfFile: true,
  } });
  const bundle = await db.consolidatedInvoice.findUnique({ where: { id: OCTOBER_OLD_BUNDLE_ID }, include: {
    issueState: true, publication: true, pdfHistory: { orderBy: { version: "asc" } },
    sources: { orderBy: { invoiceId: "asc" }, include: { deliveryNotes: { orderBy: { id: "asc" } } } },
  } });
  if (!bundle || invoices.length !== 6) fail("対象の請求書または集約請求が見つかりません");
  const repairIds = invoices.flatMap(invoice => invoice.repairs.map(repair => repair.id));
  const repairPayments = await db.payment.count({ where: { repairId: { in: repairIds } } });
  const bundlePayments = await db.payment.count({ where: { purpose: `consolidated-invoice:${OCTOBER_OLD_BUNDLE_ID}` } });
  const outboxes = await db.lineManagerSendOutbox.count({ where: { idempotencyKey: { in: [
    ...ids.map(invoiceDeliveryKey), consolidatedDeliveryKey(OCTOBER_OLD_BUNDLE_ID),
  ] } } });
  for (const [index, invoice] of invoices.entries()) {
    const target = OCTOBER_TARGETS[index];
    if (invoice.id !== target.id || invoice.invoiceNumber !== target.number ||
      invoice.billingMonth !== "2026-10" || invoice.pricingTaxMode !== "EXCLUSIVE" ||
      invoice.discountBasisAmount !== null || invoice.discountRateBps !== null || invoice.discountAmount !== null ||
      invoice.customer.type !== "business" || invoice.customer.prefix !== target.prefix || invoice.customer.seqInvoice !== (prepared ? 2 : 1) ||
      invoice.totalAmount !== target.old[0] || invoice.taxAmount !== target.old[1] ||
      invoice.shippingFeeAmount !== target.old[2] || invoice.grossTotalAmount !== target.old[3] ||
      invoice.repairs.length !== target.count || invoice.repairSnapshots.length !== target.count ||
      invoice.repairs.some((repair, position) => repair.id !== [...invoice.repairSnapshots].sort((a, b) => a.repairId - b.repairId)[position]?.repairId) ||
      !hasConsistentInvoiceSnapshots(invoice) || invoice.pdfFiles.length !== 1 ||
      invoice.currentPdfFileId !== invoice.currentPdfFile?.id || invoice.currentPdfFile?.version !== 1 ||
      invoice.currentPdfFile?.status !== "current" || !invoice.currentPdfFile.hash || !invoice.currentPdfFile.storageKey ||
      !invoice.currentPdfFile.fileSize) fail(`元請求書 ${target.number} の状態が基準と異なります`);
    try { assertNoOctoberDeliveryOrPayment({ status: invoice.status, sentAt: invoice.sentAt,
      lineSendRetryKey: invoice.lineSendRetryKey, lineSendStartedAt: invoice.lineSendStartedAt,
      allocationCount: invoice.paymentAllocations.length, pdfSentCount: invoice.pdfFiles.filter(file => file.sentAt).length,
      paymentCount: repairPayments, outboxCount: outboxes, lineSendPdfFileId: invoice.lineSendPdfFileId,
      pdfPaidCount: invoice.pdfFiles.filter(file => file.paidAt).length }); }
    catch { fail(`元請求書 ${target.number} に送信・入金または未確定処理があります`); }
    const corrected = verifiedOctoberAmounts(invoice.totalAmount, invoice.shippingFeeAmount);
    if (corrected.totalAmount !== target.corrected[0] || corrected.taxAmount !== target.corrected[1] ||
      corrected.shippingFeeAmount !== target.corrected[2] || corrected.grossTotalAmount !== target.corrected[3] ||
      corrected.discountAmount !== target.corrected[4]) fail(`割引計算が ${target.number} の確認済み金額と異なります`);
  }
  if (new Set(repairIds).size !== 31 || repairPayments || bundlePayments || outboxes ||
    bundle.sources.length !== 2 || bundle.sources[0].invoiceId !== 6 || bundle.sources[1].invoiceId !== 7 ||
    bundle.grossTotalAmount !== 82428 || !bundle.issueState || bundle.publication?.status !== "current" ||
    bundle.publication.version !== 2 || !bundle.publication.storageKey || !bundle.publication.hash ||
    !bundle.publication.fileSize || !bundle.publication.publishedAt || bundle.pdfHistory.length !== 1 ||
    bundle.pdfHistory[0].version !== 1 || !bundle.pdfHistory[0].storageKey || !bundle.pdfHistory[0].hash ||
    bundle.sources.some(source => source.discountBasisAmount !== null || source.discountRateBps !== null || source.discountAmount !== null)) {
    fail("集約請求・入金・送信または前受金の状態が基準と異なります");
  }
  for (const source of bundle.sources) {
    const invoice = invoices.find(row => row.id === source.invoiceId);
    if (!invoice || source.invoiceNumber !== invoice.invoiceNumber || source.sourceCustomerId !== invoice.customerId ||
      source.issuedDate.getTime() !== invoice.issuedDate.getTime() || source.totalAmount !== invoice.totalAmount ||
      source.taxAmount !== invoice.taxAmount || source.shippingFeeAmount !== invoice.shippingFeeAmount ||
      source.grossTotalAmount !== invoice.grossTotalAmount || source.deliveryNotes.length === 0 ||
      source.deliveryNotes.reduce((sum, note) => sum + (note.subtotalAmount ?? -1), 0) !== invoice.totalAmount) {
      fail("旧集約請求の監査明細と元請求書が一致しません");
    }
  }
  // Number reservation is the only expected change to the original rows during staging.
  const fingerprint = digest({ invoices: invoices.map(invoice => ({ ...invoice, customer: { ...invoice.customer, seqInvoice: 1 } })),
    bundle, repairPayments, bundlePayments, outboxes });
  return { invoices, bundle, fingerprint };
}

async function verifyOldPdfBytes(snapshot: Awaited<ReturnType<typeof inspect>>) {
  for (const invoice of snapshot.invoices) {
    const pdf = invoice.currentPdfFile!;
    const bytes = await downloadInvoicePdf(pdf.storageKey);
    try { assertStoredPdfMatches(bytes, pdf.fileSize, pdf.hash); }
    catch { fail(`旧PDF ${invoice.invoiceNumber} の保存内容が一致しません`); }
  }
  const bundlePdfs = [snapshot.bundle.publication!, ...snapshot.bundle.pdfHistory];
  for (const pdf of bundlePdfs) {
    const bytes = await downloadConsolidatedPdf(pdf.storageKey!);
    try { assertStoredPdfMatches(bytes, pdf.fileSize, pdf.hash); }
    catch { fail("旧集約請求PDFの保存内容が一致しません"); }
  }
}

export async function previewOctoberCorrection(db: PrismaClient) {
  const batch = await db.invoiceCorrectionBatch.findUnique({ where: { correctionKey: OCTOBER_CORRECTION_KEY },
    select: { id: true, status: true, newBundleId: true, fingerprint: true } });
  const fingerprint = batch?.status === "activated" ? batch.fingerprint : (await inspect(db, false, !!batch)).fingerprint;
  return { fingerprint, batch, oldTotal: 283036, newTotal: 274662,
    oldBundleId: 1, newBundleTotal: 79995,
    invoices: OCTOBER_TARGETS.map(target => ({ oldInvoiceId: target.id, oldNumber: target.number,
      expectedNewNumber: `${target.prefix}I-002`, old: target.old, corrected: target.corrected })) };
}

export async function stageOctoberCorrection(db: PrismaClient, expectedFingerprint: string) {
  if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) throw new OctoberCorrectionError("確認値が不正です", 400);
  const observed = await inspect(db);
  if (observed.fingerprint !== expectedFingerprint) fail("請求書の状態が変わりました。再確認してください");
  await verifyOldPdfBytes(observed);
  const batch = await db.$transaction(async tx => {
    const current = await inspect(tx, true);
    if (current.fingerprint !== expectedFingerprint) fail("請求書の状態が変わりました。再確認してください");
    try { assertCorrectionNotStarted(await tx.invoiceCorrectionBatch.findUnique({ where: { correctionKey: OCTOBER_CORRECTION_KEY } })); }
    catch { fail("この訂正は既に準備または実施されています"); }
    const newInvoices: Awaited<ReturnType<typeof tx.invoice.create>>[] = [];
    for (const [index, old] of current.invoices.entries()) {
      const target = OCTOBER_TARGETS[index];
      const { sequence, invoiceNumber } = nextB2BSourceInvoiceNumber(old.customer);
      try { assertExpectedCorrectionNumber(sequence, invoiceNumber, target.prefix,
        !!await tx.invoice.findUnique({ where: { invoiceNumber }, select: { id: true } })); }
      catch { fail(`請求書番号 ${invoiceNumber} が使用済みです`); }
      const created = await tx.invoice.create({ data: {
        invoiceNumber, customerId: old.customerId, billingCustomerId: old.billingCustomerId,
        issuedDate: old.issuedDate, billingMonth: old.billingMonth, paymentDueDate: old.paymentDueDate,
        pricingTaxMode: old.pricingTaxMode, status: "correction_preparing",
        ...verifiedOctoberAmounts(old.totalAmount, old.shippingFeeAmount),
        repairSnapshots: { create: old.repairSnapshots.map(row => ({
          repairId: row.repairId, inquiryNumber: row.inquiryNumber, deliveryNoteId: row.deliveryNoteId,
          deliverySlipNumber: row.deliverySlipNumber, deliveryIssuedDate: row.deliveryIssuedDate,
          deliveryDateActual: row.deliveryDateActual, subtotalAmount: row.subtotalAmount,
          grossAmount: row.grossAmount, deliveryShippingFee: row.deliveryShippingFee,
          createdAt: row.createdAt,
        })) },
      } });
      await tx.customer.update({ where: { id: old.customerId }, data: { seqInvoice: sequence } });
      newInvoices.push(created);
    }
    const oldBundle = current.bundle;
    const replacement = await tx.consolidatedInvoice.create({ data: {
      companyId: oldBundle.companyId, billingCustomerId: oldBundle.billingCustomerId,
      companyName: oldBundle.companyName, billingName: oldBundle.billingName,
      billingCompanyName: oldBundle.billingCompanyName, billingZipCode: oldBundle.billingZipCode,
      billingPrefecture: oldBundle.billingPrefecture, billingCity: oldBundle.billingCity,
      billingStreet: oldBundle.billingStreet, billingBuilding: oldBundle.billingBuilding,
      billingAddress: oldBundle.billingAddress, billingPhone: oldBundle.billingPhone,
      billingEmail: oldBundle.billingEmail, grossTotalAmount: 79995,
      issueState: { create: { issuedDate: oldBundle.issueState!.issuedDate } },
      sources: { create: [4, 5].map(index => {
        const old = current.invoices[index];
        const fresh = newInvoices[index];
        const oldSource = oldBundle.sources[index - 4];
        return { invoiceId: fresh.id, invoiceNumber: fresh.invoiceNumber,
          sourceCustomerId: old.customerId, sourceCustomerName: oldSource.sourceCustomerName,
          sourceCompanyName: oldSource.sourceCompanyName, issuedDate: old.issuedDate,
          totalAmount: fresh.totalAmount, discountBasisAmount: fresh.discountBasisAmount,
          discountRateBps: fresh.discountRateBps, discountAmount: fresh.discountAmount,
          taxAmount: fresh.taxAmount, shippingFeeAmount: fresh.shippingFeeAmount,
          grossTotalAmount: fresh.grossTotalAmount,
          deliveryNotes: { create: oldSource.deliveryNotes.map(note => ({
            deliveryNoteId: note.deliveryNoteId, slipNumber: note.slipNumber, issuedDate: note.issuedDate,
            repairCount: note.repairCount, subtotalAmount: note.subtotalAmount,
          })) },
        };
      }) },
    } });
    await tx.consolidatedInvoicePublication.create({ data: {
      consolidatedInvoiceId: replacement.id, publicToken: newConsolidatedShareToken(),
      fileName: consolidatedDeliveryNotePdfFileName(replacement.id), status: "draft",
    } });
    return tx.invoiceCorrectionBatch.create({ data: {
      correctionKey: OCTOBER_CORRECTION_KEY, fingerprint: expectedFingerprint,
      oldBundleId: OCTOBER_OLD_BUNDLE_ID, newBundleId: replacement.id,
      mappings: { create: current.invoices.map((old, index) => ({ oldInvoiceId: old.id, newInvoiceId: newInvoices[index].id })) },
    }, include: { mappings: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await preparePdfBytes(db, batch.id);
  return { batchId: batch.id, status: "ready", newBundleId: batch.newBundleId };
}

export async function preparePdfBytes(db: PrismaClient, batchId: number) {
  const batch = await db.invoiceCorrectionBatch.findUnique({ where: { id: batchId }, include: { mappings: true } });
  if (!batch || batch.correctionKey !== OCTOBER_CORRECTION_KEY || !batch.newBundleId || batch.status === "activated") fail("訂正準備を確認できません");
  for (const mapping of batch.mappings.sort((a, b) => a.oldInvoiceId - b.oldInvoiceId)) {
    const invoice = await correctionInvoiceForPdf(db, mapping.newInvoiceId);
    if (!invoice || invoice.status !== "correction_preparing" || !hasConsistentInvoiceSnapshots(invoice)) fail("再発行明細を確認できません");
    const existing = await db.invoicePdfFile.findFirst({ where: { invoiceId: invoice.id, version: 1 } });
    if (existing?.hash && existing.fileSize && existing.storageKey) {
      const bytes = await downloadInvoicePdf(existing.storageKey);
      if (bytes.length !== existing.fileSize || calculateInvoicePdfHash(bytes) !== existing.hash) fail("準備済みPDFが一致しません");
      continue;
    }
    const pdf = existing ?? await db.invoicePdfFile.create({ data: {
      invoiceId: invoice.id, customerId: invoice.customerId, version: 1, status: "draft",
      storageKey: "", fileName: `invoice_${invoice.invoiceNumber}.pdf`,
    } });
    const bytes = await renderInvoicePdfBuffer(correctionInvoicePdfData(invoice));
    if (bytes.length === 0) fail("再発行PDFが空です");
    const key = buildInvoicePdfStorageKey(invoice.id, pdf.id);
    await uploadInvoicePdf(key, bytes);
    const verified = await downloadInvoicePdf(key);
    if (verified.length !== bytes.length || calculateInvoicePdfHash(verified) !== calculateInvoicePdfHash(bytes)) fail("再発行PDFの保存内容が一致しません");
    const changed = await db.invoicePdfFile.updateMany({ where: { id: pdf.id, status: "draft", storageKey: "", hash: null },
      data: { storageKey: key, fileSize: bytes.length, hash: calculateInvoicePdfHash(bytes) } });
    if (changed.count !== 1) fail("再発行PDFの準備状態が変わりました");
  }
  const bundle = await db.consolidatedInvoice.findUnique({ where: { id: batch.newBundleId }, include: consolidatedBundleInclude });
  const publication = await db.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: batch.newBundleId } });
  if (!bundle || !publication || publication.status !== "draft") fail("再発行集約請求を確認できません");
  if (publication.storageKey && publication.hash && publication.fileSize) {
    const bytes = await downloadConsolidatedPdf(publication.storageKey);
    if (bytes.length !== publication.fileSize || calculateInvoicePdfHash(bytes) !== publication.hash) fail("準備済み集約PDFが一致しません");
  } else {
    const dueDates = await db.invoice.findMany({ where: { id: { in: batch.mappings.filter(row => row.oldInvoiceId === 6 || row.oldInvoiceId === 7).map(row => row.newInvoiceId) } },
      orderBy: { id: "asc" }, select: { paymentDueDate: true } });
    const bytes = await renderConsolidatedInvoicePdf(buildConsolidatedPdfData(bundle, dueDates.map(row => row.paymentDueDate)));
    if (bytes.length === 0) fail("再発行集約PDFが空です");
    const key = `consolidated-invoices/${bundle.id}/${publication.id}-${randomUUID()}.pdf`;
    await uploadConsolidatedPdf(key, bytes);
    const verified = await downloadConsolidatedPdf(key);
    if (verified.length !== bytes.length || calculateInvoicePdfHash(verified) !== calculateInvoicePdfHash(bytes)) fail("再発行集約PDFの保存内容が一致しません");
    const changed = await db.consolidatedInvoicePublication.updateMany({ where: { id: publication.id, status: "draft", storageKey: null },
      data: { storageKey: key, hash: calculateInvoicePdfHash(bytes), fileSize: bytes.length } });
    if (changed.count !== 1) fail("再発行集約PDFの準備状態が変わりました");
  }
  const changed = await db.invoiceCorrectionBatch.updateMany({ where: { id: batch.id, status: "preparing" }, data: { status: "ready" } });
  if (changed.count !== 1) fail("訂正準備の状態が変わりました");
}

export async function activateOctoberCorrection(db: PrismaClient, batchId: number, expectedFingerprint: string) {
  if (!Number.isSafeInteger(batchId) || batchId <= 0 || !/^[0-9a-f]{64}$/.test(expectedFingerprint)) throw new OctoberCorrectionError("確認値が不正です", 400);
  const observed = await inspect(db, false, true);
  if (observed.fingerprint !== expectedFingerprint) fail("元請求書の状態が変わりました");
  await verifyOldPdfBytes(observed);
  const staged = await db.invoiceCorrectionBatch.findUnique({ where: { id: batchId }, include: { mappings: true } });
  if (!staged || staged.correctionKey !== OCTOBER_CORRECTION_KEY || staged.status !== "ready" ||
    staged.fingerprint !== expectedFingerprint || !staged.newBundleId || staged.mappings.length !== 6) fail("準備済み訂正を確認できません");
  const stagedPdfMeta = new Map<number, { id: number; storageKey: string; hash: string; fileSize: number }>();
  for (const mapping of staged.mappings) {
    const invoice = await db.invoice.findUnique({ where: { id: mapping.newInvoiceId }, include: { currentPdfFile: true, pdfFiles: true, repairSnapshots: true, paymentAllocations: true, repairs: { select: { id: true } } } });
    const pdf = invoice?.pdfFiles[0];
    const target = OCTOBER_TARGETS.find(row => row.id === mapping.oldInvoiceId);
    if (!invoice || !target || invoice.status !== "correction_preparing" || invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt ||
      invoice.pdfFiles.length !== 1 || pdf?.sentAt || !pdf?.storageKey || !pdf.hash || !pdf.fileSize ||
      invoice.currentPdfFileId !== null || invoice.publicToken !== null || invoice.repairs.length !== 0 || invoice.paymentAllocations.length !== 0 ||
      invoice.invoiceNumber !== `${target.prefix}I-002` || invoice.totalAmount !== target.corrected[0] ||
      invoice.taxAmount !== target.corrected[1] || invoice.shippingFeeAmount !== target.corrected[2] ||
      invoice.grossTotalAmount !== target.corrected[3] || invoice.discountAmount !== target.corrected[4] ||
      !hasConsistentInvoiceSnapshots(invoice)) fail("準備済み請求書を確認できません");
    const bytes = await downloadInvoicePdf(pdf.storageKey);
    if (bytes.length !== pdf.fileSize || calculateInvoicePdfHash(bytes) !== pdf.hash) fail("再発行PDFの保存内容が一致しません");
    stagedPdfMeta.set(invoice.id, { id: pdf.id, storageKey: pdf.storageKey, hash: pdf.hash, fileSize: pdf.fileSize });
  }
  const stagedPublication = await db.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: staged.newBundleId } });
  if (!stagedPublication || stagedPublication.status !== "draft" || !stagedPublication.storageKey || !stagedPublication.hash || !stagedPublication.fileSize) fail("準備済み集約PDFを確認できません");
  const stagedBytes = await downloadConsolidatedPdf(stagedPublication.storageKey);
  if (stagedBytes.length !== stagedPublication.fileSize || calculateInvoicePdfHash(stagedBytes) !== stagedPublication.hash) fail("再発行集約PDFの保存内容が一致しません");
  return db.$transaction(async tx => {
    const current = await inspect(tx, true, true);
    if (current.fingerprint !== expectedFingerprint) fail("元請求書の状態が変わりました");
    const batch = await tx.invoiceCorrectionBatch.findUnique({ where: { id: batchId }, include: { mappings: true } });
    if (!batch || batch.correctionKey !== OCTOBER_CORRECTION_KEY || batch.status !== "ready" ||
      batch.fingerprint !== expectedFingerprint || batch.newBundleId !== staged.newBundleId) fail("訂正準備が変わりました");
    const replacement = await tx.consolidatedInvoice.findUnique({ where: { id: batch.newBundleId! }, include: {
      sources: { orderBy: { invoiceId: "asc" }, include: { invoice: true, deliveryNotes: { orderBy: { id: "asc" } } } }, issueState: true,
    } });
    if (!replacement || replacement.grossTotalAmount !== 79995 || replacement.sources.length !== 2 ||
      replacement.sources.reduce((sum, source) => sum + source.grossTotalAmount, 0) !== 79995 ||
      replacement.issueState?.issuedDate.getTime() !== current.bundle.issueState!.issuedDate.getTime() ||
      replacement.sources.some(source => !batch.mappings.some(row => row.newInvoiceId === source.invoiceId && [6, 7].includes(row.oldInvoiceId)) ||
        source.invoice.invoiceNumber !== source.invoiceNumber || source.invoice.customerId !== source.sourceCustomerId ||
        source.invoice.issuedDate.getTime() !== source.issuedDate.getTime() || source.invoice.totalAmount !== source.totalAmount ||
        source.invoice.taxAmount !== source.taxAmount || source.invoice.shippingFeeAmount !== source.shippingFeeAmount ||
        source.invoice.grossTotalAmount !== source.grossTotalAmount || source.invoice.discountBasisAmount !== source.discountBasisAmount ||
        source.invoice.discountRateBps !== source.discountRateBps || source.invoice.discountAmount !== source.discountAmount ||
        source.deliveryNotes.length === 0 ||
        noteSignature(source.deliveryNotes) !== noteSignature(current.bundle.sources.find(oldSource =>
          oldSource.invoiceId === batch.mappings.find(mapping => mapping.newInvoiceId === source.invoiceId)?.oldInvoiceId)?.deliveryNotes ?? []) ||
        source.deliveryNotes.reduce((sum, note) => sum + (note.subtotalAmount ?? -1), 0) !== source.discountBasisAmount)) {
      fail("再発行集約請求の監査明細を確認できません");
    }
    for (const mapping of batch.mappings.sort((a, b) => a.oldInvoiceId - b.oldInvoiceId)) {
      const old = current.invoices.find(row => row.id === mapping.oldInvoiceId);
      const fresh = await tx.invoice.findUnique({ where: { id: mapping.newInvoiceId }, include: { pdfFiles: true, repairSnapshots: true, paymentAllocations: true, repairs: { select: { id: true } } } });
      const pdfMeta = stagedPdfMeta.get(mapping.newInvoiceId);
      const target = OCTOBER_TARGETS.find(row => row.id === mapping.oldInvoiceId);
      if (!old || !fresh || fresh.status !== "correction_preparing" || fresh.customerId !== old.customerId ||
        fresh.sentAt || fresh.lineSendRetryKey || fresh.lineSendStartedAt || fresh.pdfFiles[0]?.sentAt ||
        !target || fresh.invoiceNumber !== `${target.prefix}I-002` || fresh.issuedDate.getTime() !== old.issuedDate.getTime() ||
        fresh.billingCustomerId !== old.billingCustomerId || fresh.billingMonth !== old.billingMonth ||
        fresh.paymentDueDate?.getTime() !== old.paymentDueDate?.getTime() ||
        fresh.totalAmount !== target.corrected[0] || fresh.taxAmount !== target.corrected[1] ||
        fresh.shippingFeeAmount !== target.corrected[2] || fresh.grossTotalAmount !== target.corrected[3] ||
        fresh.discountAmount !== target.corrected[4] || fresh.discountBasisAmount !== old.totalAmount || fresh.discountRateBps !== 300 ||
        fresh.publicToken !== null || fresh.repairs.length !== 0 || fresh.paymentAllocations.length !== 0 ||
        snapshotSignature(fresh.repairSnapshots) !== snapshotSignature(old.repairSnapshots) ||
        fresh.pdfFiles.length !== 1 || fresh.pdfFiles[0].status !== "draft" ||
        !pdfMeta || fresh.pdfFiles[0].id !== pdfMeta.id || fresh.pdfFiles[0].storageKey !== pdfMeta.storageKey ||
        fresh.pdfFiles[0].hash !== pdfMeta.hash || fresh.pdfFiles[0].fileSize !== pdfMeta.fileSize ||
        fresh.currentPdfFileId !== null || !hasConsistentInvoiceSnapshots(fresh)) fail("再発行請求書の状態が変わりました");
      const oldIds = old.repairs.map(row => row.id);
      const moved = await tx.repair.updateMany({ where: { id: { in: oldIds }, invoiceId: old.id }, data: { invoiceId: fresh.id } });
      if (moved.count !== oldIds.length) fail("修理案件の請求先が変わりました");
      const canceled = await tx.invoice.updateMany({ where: { id: old.id, status: "issued" }, data: { status: "void" } });
      if (canceled.count !== 1) fail("元請求書の状態が変わりました");
      await tx.invoicePdfFile.update({ where: { id: fresh.pdfFiles[0].id }, data: { status: "current" } });
      await tx.invoice.update({ where: { id: fresh.id }, data: { status: "issued", currentPdfFileId: fresh.pdfFiles[0].id } });
    }
    const pub = await tx.consolidatedInvoicePublication.findUnique({ where: { consolidatedInvoiceId: batch.newBundleId! } });
    if (!pub || pub.id !== stagedPublication.id || pub.status !== "draft" || pub.storageKey !== stagedPublication.storageKey ||
      pub.hash !== stagedPublication.hash || pub.fileSize !== stagedPublication.fileSize) fail("再発行集約PDFの状態が変わりました");
    await tx.consolidatedInvoiceSupersession.create({ data: {
      oldBundleId: OCTOBER_OLD_BUNDLE_ID, newBundleId: batch.newBundleId!, correctionBatchId: batch.id,
    } });
    await tx.consolidatedInvoicePublication.update({ where: { id: pub.id }, data: { status: "current", publishedAt: new Date() } });
    await tx.invoiceCorrectionBatch.update({ where: { id: batch.id }, data: { status: "activated", activatedAt: new Date() } });
    return { batchId: batch.id, status: "activated", newBundleId: batch.newBundleId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000, maxWait: 5000 });
}
