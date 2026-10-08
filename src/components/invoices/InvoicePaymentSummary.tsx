import { ManualBankTransferPayment } from "@/components/invoices/ManualBankTransferPayment";
import { InvoiceRefundControls } from "@/components/invoices/InvoiceRefundControls";

type Props = {
  invoiceId: number;
  customerType: string;
  invoiceStatus: string;
  paymentStatus: "paid" | "pending" | "unpaid" | "void";
  grossTotalAmount: number;
  paidAmount: number;
  prepaymentAppliedAmount: number;
  invoiceRefundPendingAmount: number;
  outstandingBalance: number;
  latestSucceededPayment: { provider: string; method: string | null; paidAt: Date | null } | null;
  invoicePayments: { id: number; amount: number; kind: string; provider: string; status: string;
    refunds: { id: number; amount: number; status: string; reason: string }[] }[];
};

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function paymentStatusLabel(status: Props["paymentStatus"]) {
  if (status === "paid") return "入金済み";
  if (status === "pending") return "決済処理中";
  if (status === "void") return "取消済み";
  return "未入金";
}

function paymentMethodLabel(payment: Props["latestSucceededPayment"]) {
  if (!payment) return null;
  if (payment.provider === "STRIPE" && payment.method === "CARD") return "カード";
  if (payment.provider === "STRIPE" && payment.method === "PAYPAY") return "PayPay";
  if (payment.provider === "MANUAL" && payment.method === "BANK_TRANSFER") return "銀行振込";
  return null;
}

function formatPaidAt(paidAt: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(paidAt);
}

export function InvoicePaymentSummary(props: Props) {
  if (props.customerType !== "individual") return null;

  const method = paymentMethodLabel(props.latestSucceededPayment);
  const canRegisterManualPayment = props.invoiceStatus === "issued" && props.paymentStatus === "unpaid";

  return (
    <section className="mt-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <h2 className="font-semibold text-slate-900">お支払い状況</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt>支払状態</dt><dd className="font-medium">{paymentStatusLabel(props.paymentStatus)}</dd></div>
        <div className="flex justify-between gap-3"><dt>請求総額（税込）</dt><dd>{formatYen(props.grossTotalAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt>前受金充当額</dt><dd>{formatYen(props.prepaymentAppliedAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt>今回請求額</dt><dd>{formatYen(props.grossTotalAmount - props.prepaymentAppliedAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt>入金済額</dt><dd>{formatYen(props.paidAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt>請求入金の返金済額</dt><dd>{formatYen(props.invoicePayments.reduce((sum, payment) => sum + payment.refunds.filter(refund => refund.status === "SUCCEEDED").reduce((s, refund) => s + refund.amount, 0), 0))}</dd></div>
        {props.invoiceRefundPendingAmount > 0 && <div className="flex justify-between gap-3"><dt>返金処理中</dt><dd>{formatYen(props.invoiceRefundPendingAmount)}</dd></div>}
        {props.paymentStatus !== "void" && <div className="flex justify-between gap-3"><dt>未入金残高</dt><dd>{formatYen(props.outstandingBalance)}</dd></div>}
        {props.paymentStatus === "paid" && method ? <div className="flex justify-between gap-3"><dt>支払方法</dt><dd>{method}</dd></div> : null}
        {props.paymentStatus === "paid" && props.latestSucceededPayment?.paidAt ? <div className="flex justify-between gap-3"><dt>入金日時</dt><dd>{formatPaidAt(props.latestSucceededPayment.paidAt)}</dd></div> : null}
      </dl>
      {canRegisterManualPayment ? <ManualBankTransferPayment invoiceId={props.invoiceId} /> : null}
      {props.invoicePayments.length > 0 && <InvoiceRefundControls payments={props.invoicePayments} />}
    </section>
  );
}
