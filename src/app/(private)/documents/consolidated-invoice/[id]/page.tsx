import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatIssuedDate } from "@/lib/document-issued-date";
import { calculateInvoicePaymentSummary } from "@/lib/invoice-payment";
import { consolidatedDeliveryKey } from "@/lib/consolidated-invoice-operations";
import { hasConsolidatedSourceSnapshotIntegrity, isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";
import { IssuedDateEditor } from "@/components/documents/IssuedDateEditor";
import { ConsolidatedInvoiceActions } from "@/components/invoices/ConsolidatedInvoiceActions";
import { invoiceDeliveryKey } from "@/lib/invoice-delivery-routing";
import { resolveInvoiceLineDestination } from "@/lib/invoice-delivery-routing";

export const dynamic = "force-dynamic";
const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

export default async function ConsolidatedInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return notFound();
  const bundle = await prisma.consolidatedInvoice.findUnique({ where: { id }, include: {
    publication: true, issueState: true, sources: { orderBy: { invoiceId: "asc" }, include: { deliveryNotes: true,
      invoice: { select: { id: true, invoiceNumber: true, customerId: true, issuedDate: true, totalAmount: true, taxAmount: true,
        shippingFeeAmount: true, grossTotalAmount: true, paymentDueDate: true, status: true, sentAt: true, lineSendRetryKey: true,
        lineSendStartedAt: true, pdfFiles: { select: { sentAt: true } },
        paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
          payment: { select: { status: true, kind: true, refunds: { select: { amount: true, status: true } } } } } } } } } },
  } });
  if (!bundle) return notFound();
  const sourceIds = bundle.sources.map(source => source.invoiceId);
  const [outbox, prepaymentCount, individualOutboxCount, destination] = await Promise.all([
    prisma.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: consolidatedDeliveryKey(id) }, select: { status: true } }),
    prisma.payment.count({ where: { kind: "REPAIR_PREPAYMENT", repair: { invoiceId: { in: sourceIds } } } }),
    prisma.lineManagerSendOutbox.count({ where: { idempotencyKey: { in: sourceIds.map(invoiceDeliveryKey) } } }),
    resolveInvoiceLineDestination(prisma, bundle.billingCustomerId),
  ]);
  const paidAmount = bundle.sources.reduce((sum, source) => sum + calculateInvoicePaymentSummary(source.invoice, source.invoice.paymentAllocations).paidAmount, 0);
  const outstanding = bundle.sources.reduce((sum, source) => sum + calculateInvoicePaymentSummary(source.invoice, source.invoice.paymentAllocations).outstandingBalance, 0);
  const paymentStatus = outstanding === 0 ? "入金済み" : paidAmount > 0 ? "一部入金" : "未入金";
  const dueDates = bundle.sources.map(source => source.invoice.paymentDueDate?.getTime() ?? null);
  const dueDate = dueDates.length > 0 && dueDates[0] !== null && dueDates.every(value => value === dueDates[0])
    ? formatIssuedDate(new Date(dueDates[0])) : null;
  const pdfReady = isCurrentConsolidatedPdf(bundle.publication) && !!bundle.publication.publishedAt && validConsolidatedShareToken(bundle.publication.publicToken);
  const individuallyDelivered = individualOutboxCount > 0 || bundle.sources.some(source => source.invoice.sentAt || source.invoice.lineSendRetryKey || source.invoice.lineSendStartedAt || source.invoice.pdfFiles.some(file => file.sentAt));
  const snapshotSafe = !!bundle.issueState && hasConsolidatedSourceSnapshotIntegrity(bundle);
  const unpaidSafe = outstanding === bundle.grossTotalAmount && paidAmount === 0 && prepaymentCount === 0 && bundle.sources.every(source => source.invoice.status === "issued" && source.invoice.paymentAllocations.length === 0);
  const canGenerate = snapshotSafe && !bundle.publication && !outbox && !individuallyDelivered && unpaidSafe;
  const canConfirmPayment = snapshotSafe && !individuallyDelivered && unpaidSafe;
  const canQueue = snapshotSafe && pdfReady && !!destination && !outbox && !individuallyDelivered && unpaidSafe;
  const delivery = outbox?.status === "CONFIRMED" ? "LINE送信確認済み" : outbox?.status === "APPROVED" ? "LINE送信待ち（未送信）"
    : outbox ? `LINE ${outbox.status}` : individuallyDelivered ? "元請求書の個別送信履歴あり" : pdfReady ? "PDF発行済み・送信前" : "PDF未発行";
  return <div className="min-h-screen bg-gray-100 p-6">
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/invoices" className="text-sm text-blue-700 underline">← 請求書管理</Link>
      <header className="rounded-lg bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold">集約請求書 #{bundle.id}</h1>
        {!bundle.issueState ? <p role="alert" className="mt-2 text-sm text-red-800">発行日を確認できません。操作を停止しています。</p>
          : bundle.publication ? <p className="mt-2 text-sm">発行日: {formatIssuedDate(bundle.issueState.issuedDate)} <span className="text-slate-500">（PDF発行後は変更できません。{outbox ? "LINE送信履歴があります。" : "再発行は未対応です。"}）</span></p>
          : <IssuedDateEditor type="consolidated-invoice" id={id} issuedDate={formatIssuedDate(bundle.issueState.issuedDate)} />}
        <p className="mt-2 text-sm">請求先: {bundle.billingCompanyName || bundle.billingName} / {bundle.billingName}</p>
        <p className="text-sm">支払期限: {dueDate ?? "未確定（元請求書の期限が一致しません）"}</p>
        <p className="text-sm">請求額: {yen(bundle.grossTotalAmount)}　入金済: {yen(paidAmount)}　未収: {yen(outstanding)} <strong>{paymentStatus}</strong></p>
        <p className="text-sm">案内: {delivery}</p>
        {!snapshotSafe && <p role="alert" className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">元請求書と作成時の請求内容が一致しません。新しい操作は停止しています。元請求書の内容を確認してください。</p>}
        {bundle.publication && <p className="text-xs text-slate-500">PDF version {bundle.publication.version} / {bundle.publication.status}</p>}
        <div className="mt-4"><ConsolidatedInvoiceActions id={id} pdfReady={pdfReady} canGenerate={canGenerate} canQueue={canQueue} canConfirmPayment={canConfirmPayment} shareToken={pdfReady ? bundle.publication!.publicToken : null} /></div>
      </header>
      <section className="rounded-lg bg-white p-5 shadow-sm text-sm">
        <h2 className="font-bold">元請求書・納品書</h2>
        {bundle.sources.map(source => <div key={source.id} className="mt-3 rounded border p-3">
          <Link className="text-blue-700 underline" href={`/documents/invoice/${source.invoiceId}`}>{source.invoiceNumber}</Link>　{source.sourceCompanyName || source.sourceCustomerName}　{yen(source.grossTotalAmount)}
          {source.deliveryNotes.map(note => <p key={note.id} className="ml-4 text-slate-600">納品書 {note.slipNumber || (note.deliveryNoteId ? `#${note.deliveryNoteId}` : "未紐付け")} / 修理 {note.repairCount}件{note.subtotalAmount !== null ? ` / 税抜小計 ${yen(note.subtotalAmount)}` : ""}</p>)}
        </div>)}
        <p className="mt-3 text-xs text-slate-500">集約請求の取消だけでは、元請求書の入金・発行は取り消されません。</p>
      </section>
      {pdfReady ? <iframe src={`/api/invoices/consolidated/${id}/pdf`} className="h-[75vh] w-full border-0 bg-white" title="保存済み集約請求書PDF" />
        : <div className="rounded border border-amber-200 bg-amber-50 p-5 text-sm">保存済みPDFがありません。元請求書と入金・送信状態を確認してPDFを生成してください。</div>}
    </div>
  </div>;
}
