import { hasConsistentInvoiceSnapshots } from "@/lib/invoice-repair-snapshots";
import { notFound } from "next/navigation";

import { InvoiceCheckoutButton } from "@/components/customer/InvoiceCheckoutButton";
import { calculateInvoicePaymentSummary } from "@/lib/invoice-payment";
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

  const rows = hasConsistentInvoiceSnapshots(invoice) ? invoice.repairSnapshots : [];
  for (const row of rows) {
    const groupKey = row.deliveryNoteId
      ? `delivery-note-id:${row.deliveryNoteId}`
      : row.deliverySlipNumber
        ? `delivery-note-slip:${row.deliverySlipNumber}`
        : "unlinked-delivery-note";
    const groupDate = row.deliveryIssuedDate || row.deliveryDateActual || invoice.issuedDate;
    const existing = deliveryGroups.get(groupKey);
    if (existing) {
      existing.repairCount += 1;
      existing.amount += row.subtotalAmount;
      if (groupDate < existing.date) existing.date = groupDate;
    } else {
      deliveryGroups.set(groupKey, {
        key: groupKey,
        slipNumber: row.deliverySlipNumber || "未紐付け",
        date: groupDate,
        repairCount: 1,
        amount: row.subtotalAmount,
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
      repairSnapshots: true,
      paymentAllocations: {
        select: { allocatedAmount: true, payment: { select: { status: true } } },
      },
    },
  });
}

export default async function CustomerInvoicePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { checkout?: string };
}) {
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
  const paymentSummary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
  const isPaid = paymentSummary.outstandingBalance === 0;
  const canPayOnline = invoice.customer.type === "individual"
    && invoice.status === "issued"
    && paymentSummary.outstandingBalance > 0;
  const checkoutState = searchParams?.checkout;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-bold text-blue-600">ヨシダ時計修理工房</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">請求書のご確認</h1>
          <p className="mt-2 text-sm text-slate-600">請求書の内容をご確認ください。</p>
        </header>

        {(!isPaid || invoice.customer.type === "business") && checkoutState === "success" ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            決済結果を確認しています。お支払い済みの表示への更新には少し時間がかかる場合があります。
          </div>
        ) : null}
        {(!isPaid || invoice.customer.type === "business") && checkoutState === "cancel" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            お支払いは完了していません。ご都合のよいときに、あらためてお手続きください。
          </div>
        ) : null}

        <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-bold text-slate-900">概要</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">請求書番号</dt>
              <dd className="mt-1 font-semibold">{invoice.invoiceNumber}</dd>
            </div>
            {invoice.customer.type === "business" ? (
              <>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-bold text-slate-500">対象月</dt>
                  <dd className="mt-1 font-semibold">{billingMonth}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-bold text-slate-500">取引先名</dt>
                  <dd className="mt-1 font-semibold">{customerName}</dd>
                </div>
              </>
            ) : null}
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">発行日</dt>
              <dd className="mt-1 font-semibold">{formatDate(invoice.issuedDate)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <dt className="text-xs font-bold text-slate-500">支払期限</dt>
              <dd className="mt-1 font-semibold">{formatDate(invoice.paymentDueDate)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
              <dt className="text-xs font-bold text-slate-500">請求総額（税込）</dt>
              <dd className="mt-1 font-semibold">{formatCurrency(invoice.grossTotalAmount)}</dd>
            </div>
          </dl>
        </section>

        {invoice.customer.type === "individual" && !isPaid ? (
          <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">銀行振込のご案内</h2>
            <dl className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <dt className="text-xs font-bold text-slate-500">金融機関</dt>
                <dd className="mt-1 font-semibold">三井住友銀行</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-slate-500">店番</dt>
                <dd className="mt-1 font-semibold">411</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-slate-500">口座番号</dt>
                <dd className="mt-1 font-semibold">普通 3602468</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-slate-500">口座名義</dt>
                <dd className="mt-1 font-semibold">ヨシダ シュウヘイ</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-600">振込手数料はお客様のご負担となります。</p>
          </section>
        ) : null}

        {invoice.customer.type === "individual" ? (
          <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">オンライン決済</h2>
            {canPayOnline ? (
              <>
                <p className="mt-3 text-sm text-slate-600">
                  クレジットカード、Apple Pay、Google Payで安全にお支払いいただけます。
                </p>
                <InvoiceCheckoutButton token={token} />
                <div className="mt-4 flex flex-wrap items-center gap-3" aria-label="利用可能な決済ブランド">
                  {[
                    ["visa.svg", "Visa"],
                    ["mastercard.svg", "Mastercard"],
                    ["jcb.svg", "JCB"],
                    ["american-express.svg", "American Express"],
                    ["apple-pay.svg", "Apple Pay"],
                    ["google-pay.svg", "Google Pay"],
                  ].map(([fileName, alt]) => (
                    <img
                      key={fileName}
                      src={`/img/payment-logos/${fileName}`}
                      alt={alt}
                      className="h-6 w-auto object-contain"
                    />
                  ))}
                </div>
              </>
            ) : isPaid ? (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                お支払い済みです。
              </p>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                現在、この請求ではオンライン決済をご利用いただけません。
              </p>
            )}
          </section>
        ) : null}

        {invoice.customer.type === "individual" ? (
          <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">今回の修理</h2>
            <div className="mt-4 space-y-3">
              {hasConsistentInvoiceSnapshots(invoice) ? invoice.repairSnapshots.map((repair) => (
                <article key={repair.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">修理番号</p>
                      <p className="mt-1 font-semibold text-slate-900">{repair.inquiryNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-500">修理料金（税抜）</p>
                      <p className="mt-1 font-mono font-bold text-blue-700">{formatCurrency(repair.subtotalAmount)}</p>
                    </div>
                  </div>
                </article>
              )) : (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  修理内容は請求書PDFでご確認ください。
                </p>
              )}
            </div>
          </section>
        ) : null}

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

        {invoice.customer.type === "business" ? (
          <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">明細</h2>
            <div className="mt-4 space-y-2">
              {deliveryGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  発行時の明細は保存済みPDFをご確認ください。
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
        ) : null}

        <footer className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          ご不明点がございましたら、ヨシダ時計修理工房までお問い合わせください。
        </footer>
      </div>
    </main>
  );
}
