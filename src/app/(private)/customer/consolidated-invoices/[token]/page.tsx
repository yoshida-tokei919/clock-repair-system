import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { consolidatedDeliveryNoteRows, isConsolidatedDeliveryNotePdf, isCurrentConsolidatedPdf, validConsolidatedShareToken } from "@/lib/consolidated-invoice-publication";
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
  const newFormat = isConsolidatedDeliveryNotePdf(bundle.id, publication.fileName);
  let rows: ReturnType<typeof consolidatedDeliveryNoteRows> | null = null;
  if (newFormat) {
    try { rows = consolidatedDeliveryNoteRows(bundle); } catch { return notFound(); }
  }
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
          <div><dt className="text-slate-500">請求先（作成時）</dt><dd className="font-semibold">{bundle.companyName}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">請求総額（税込）</dt><dd className="text-2xl font-bold text-blue-800">{yen(bundle.grossTotalAmount)}</dd></div>
        </dl>
      </section>
      {rows ? <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold">納品書別のご請求</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">納品書番号</th><th>納品日</th><th>内容</th><th className="text-right">金額（税込）</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.slipNumber}-${index}`} className="border-b"><td className="py-2">{row.slipNumber}</td><td>{row.date}</td><td>修理 {row.repairCount}点</td><td className="text-right">{yen(row.amount)}</td></tr>)}</tbody></table></div>
      </section> : <section className="rounded-xl border border-blue-100 bg-white p-5 text-sm shadow-sm">ご請求内容は保存済みPDFをご確認ください。</section>}
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
