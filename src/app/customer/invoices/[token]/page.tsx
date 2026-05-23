import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type InvoiceTokenRow = {
  id: number;
  billingMonth: string | null;
  currentPdfFileId: number | null;
  pdfFileName: string | null;
  hasStorageKey: boolean;
};

type DeliveryGroup = {
  key: string;
  slipNumber: string;
  date: Date;
  repairCount: number;
  amount: number;
};

function formatDate(date: Date | null | undefined) {
  return date ? date.toLocaleDateString("ja-JP") : "未設定";
}

function formatCurrency(amount: number) {
  return `¥${amount.toLocaleString()}`;
}

function formatBillingMonth(billingMonth: string | null, deliveryGroups: DeliveryGroup[]) {
  if (billingMonth) {
    const match = billingMonth.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      return `${match[1]}年${Number(match[2])}月分`;
    }

    return billingMonth;
  }

  const firstDeliveryDate = deliveryGroups
    .map((group) => group.date)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!firstDeliveryDate) {
    return "対象月未設定";
  }

  return `${firstDeliveryDate.getFullYear()}年${firstDeliveryDate.getMonth() + 1}月分`;
}

function buildDeliveryGroups(invoice: NonNullable<Awaited<ReturnType<typeof findInvoiceForSharePage>>>) {
  const deliveryGroups = new Map<string, DeliveryGroup>();

  for (const repair of invoice.repairs) {
    const groupKey = repair.deliveryNoteId
      ? `delivery-note-id:${repair.deliveryNoteId}`
      : repair.deliveryNote?.slipNumber
        ? `delivery-note-slip:${repair.deliveryNote.slipNumber}`
        : "unlinked-delivery-note";

    const repairAmount = (repair.estimate?.items || []).reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    const groupDate = repair.deliveryNote?.issuedDate || repair.deliveryDateActual || invoice.issuedDate;
    const existing = deliveryGroups.get(groupKey);

    if (existing) {
      existing.repairCount += 1;
      existing.amount += repairAmount;
      if (groupDate < existing.date) existing.date = groupDate;
    } else {
      deliveryGroups.set(groupKey, {
        key: groupKey,
        slipNumber: repair.deliveryNote?.slipNumber || "未紐付け",
        date: groupDate,
        repairCount: 1,
        amount: repairAmount,
      });
    }
  }

  return Array.from(deliveryGroups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function findInvoiceForSharePage(invoiceId: number) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      repairs: {
        include: {
          estimate: { include: { items: true } },
          deliveryNote: true,
        },
      },
    },
  });
}

export default async function CustomerInvoicePage({ params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) return notFound();

  const [tokenRow] = await prisma.$queryRaw<InvoiceTokenRow[]>`
    SELECT
      i."id",
      i."billingMonth",
      i."currentPdfFileId",
      f."fileName" AS "pdfFileName",
      COALESCE(LENGTH(f."storageKey") > 0, false) AS "hasStorageKey"
    FROM "Invoice" i
    LEFT JOIN "InvoicePdfFile" f ON f."id" = i."currentPdfFileId"
    WHERE i."publicToken" = ${token}
    LIMIT 1
  `;

  if (!tokenRow) return notFound();

  const invoice = await findInvoiceForSharePage(tokenRow.id);
  if (!invoice) return notFound();

  const deliveryGroups = buildDeliveryGroups(invoice);
  const customerName =
    invoice.customer.type === "business"
      ? invoice.customer.companyName || invoice.customer.name
      : invoice.customer.name;
  const pdfHref = `/customer/invoices/${token}/invoice.pdf`;
  const billingMonth = formatBillingMonth(tokenRow.billingMonth, deliveryGroups);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-bold text-blue-600">ヨシダ時計修理工房</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">請求書のご確認</h1>
          <p className="mt-2 text-sm text-slate-600">請求書の内容をご確認ください。</p>
        </header>

        <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-900">概要</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">請求書番号</dt>
              <dd className="mt-1 font-semibold">{invoice.invoiceNumber}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">対象月</dt>
              <dd className="mt-1 font-semibold">{billingMonth}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">取引先名</dt>
              <dd className="mt-1 font-semibold">{customerName}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">発行日</dt>
              <dd className="mt-1 font-semibold">{formatDate(invoice.issuedDate)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <dt className="text-xs font-bold text-slate-500">支払期限</dt>
              <dd className="mt-1 font-semibold">{formatDate(invoice.paymentDueDate)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-900">請求書PDF</h2>
          {tokenRow.currentPdfFileId && tokenRow.hasStorageKey ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">
                保存済みの請求書PDFをご確認いただけます。
                {tokenRow.pdfFileName ? ` ファイル名: ${tokenRow.pdfFileName}` : ""}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={pdfHref}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
                >
                  請求書PDFを開く
                </a>
                <a
                  href={pdfHref}
                  download
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"
                >
                  PDFをダウンロード
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">保存済みPDFはまだ生成されていません。</p>
              <p className="mt-1">恐れ入りますが、ヨシダ時計修理工房までお問い合わせください。</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-900">明細</h2>
          <div className="mt-4 space-y-2">
            {deliveryGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                明細はありません。
              </div>
            ) : (
              deliveryGroups.map((group) => (
                <div
                  key={group.key}
                  className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-500">納品書番号</div>
                    <div className="mt-1 font-semibold">{group.slipNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">納品日</div>
                    <div className="mt-1 font-semibold">{formatDate(group.date)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">納品点数</div>
                    <div className="mt-1 font-semibold">{group.repairCount}点</div>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-xs font-bold text-slate-500">金額</div>
                    <div className="mt-1 font-mono font-bold text-blue-700">{formatCurrency(group.amount)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          ご不明点がございましたら、ヨシダ時計修理工房までお問い合わせください。
        </footer>
      </div>
    </main>
  );
}
