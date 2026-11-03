import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";
import { calculateInvoicePdfHash } from "@/lib/invoice-pdf-storage";
import { downloadConsolidatedPdf } from "@/lib/r2-consolidated-invoice-pdf";
import { formatIssuedDate } from "@/lib/document-issued-date";

export const dynamic = "force-dynamic";

export default async function ConsolidatedCustomerPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!validConsolidatedShareToken(token)) return notFound();
  const publication = await prisma.consolidatedInvoicePublication.findUnique({ where: { publicToken: token },
    include: { consolidatedInvoice: { include: { issueState: true, sources: { include: { deliveryNotes: true }, orderBy: { id: "asc" } } } } } });
  if (!isCurrentConsolidatedPdf(publication)) return notFound();
  try {
    const stored = await downloadConsolidatedPdf(publication.storageKey);
    if (stored.length !== publication.fileSize || calculateInvoicePdfHash(stored) !== publication.hash) return notFound();
  } catch { return notFound(); }
  const bundle = publication.consolidatedInvoice;
  if (!bundle.issueState) return notFound();
  if (bundle.sources.length < 2 || bundle.sources.reduce((sum, source) => sum + source.grossTotalAmount, 0) !== bundle.grossTotalAmount) return notFound();
  const pdfHref = `/customer/consolidated-invoices/${token}/invoice.pdf`;
  const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;
  return <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:py-10">
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-blue-600">ヨシダ時計修理工房</p>
        <h1 className="mt-1 text-2xl font-bold">集約請求書のご案内</h1>
      </header>
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold">ご請求内容</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">集約請求</dt><dd className="font-semibold">#{bundle.id}</dd></div>
          <div><dt className="text-slate-500">発行日</dt><dd className="font-semibold">{formatIssuedDate(bundle.issueState.issuedDate)}</dd></div>
          <div><dt className="text-slate-500">請求先（作成時）</dt><dd className="font-semibold">{bundle.billingCompanyName || bundle.billingName}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">請求総額（税込）</dt><dd className="text-2xl font-bold text-blue-800">{yen(bundle.grossTotalAmount)}</dd></div>
        </dl>
      </section>
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold">店舗別の元請求書</h2>
        <ul className="mt-3 space-y-2">{bundle.sources.map(source => <li key={source.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>{source.sourceCompanyName || source.sourceCustomerName} / {source.invoiceNumber}</span><strong>税込 {yen(source.grossTotalAmount)}</strong></div>
          {source.deliveryNotes.length > 0 && <p className="mt-1 text-xs text-slate-600">納品書: {source.deliveryNotes.map(note => note.slipNumber || (note.deliveryNoteId ? `#${note.deliveryNoteId}` : "未紐付け")).join("、")}</p>}
        </li>)}</ul>
      </section>
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold">請求書PDF</h2>
        <p className="mt-2 text-sm text-slate-600">保存済みの集約請求書をご確認ください。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={pdfHref} className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">PDFを開く</a>
          <a href={`${pdfHref}?download=1`} className="inline-flex min-h-11 items-center rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700">PDFを保存</a>
        </div>
      </section>
    </div>
  </main>;
}
