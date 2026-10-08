"use client";

import type { PaymentMethod, PaymentProvider, PaymentStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PREPAYMENT_STATUS_LABELS, summarizeRepairPrepayments } from "@/lib/repair-prepayment-display";
import { effectiveAllocation, refundableAmount, refundTotals } from "@/lib/payment-accounting";

type Prepayment = {
  id: number;
  amount: number;
  purpose: string | null;
  status: PaymentStatus;
  provider: PaymentProvider;
  method: PaymentMethod | null;
  createdAt: Date;
  paidAt: Date | null;
  refunds: { id: number; amount: number; status: string; reason: string }[];
  allocations: { allocatedAmount: number; releases: { amount: number }[] }[];
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function RepairPrepaymentPanel({ repairId, isBusiness, payments }: {
  repairId: number;
  isBusiness: boolean;
  payments: Prepayment[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = summarizeRepairPrepayments(payments);
  const hasPending = payments.some(payment => payment.status === "PENDING");

  async function act(payment: Prepayment, action: "cancel" | "refund" | "reconcile", refundId?: number) {
    if (busyId !== null) return;
    const reason = action === "reconcile" ? null : window.prompt(action === "cancel" ? "取消理由を入力してください" : "返金理由を入力してください");
    if (action !== "reconcile" && !reason?.trim()) return;
    const capacity = refundableAmount({ ...payment, kind: "REPAIR_PREPAYMENT" });
    const rawAmount = action === "refund" ? window.prompt(`返金額を入力してください（最大 ¥${capacity.toLocaleString()}）`) : null;
    const amount = rawAmount === null ? NaN : Number(rawAmount);
    if (action === "refund" && (!/^\d+$/.test(rawAmount ?? "") || !Number.isSafeInteger(amount) || amount <= 0 || amount > capacity)) {
      setError("返金額を確認してください"); return;
    }
    const label = action === "cancel" ? "前受金依頼を取り消しますか？" : action === "refund"
      ? `未充当の前受金 ¥${amount.toLocaleString()} をStripeで返金しますか？` : "Stripe返金結果を照合しますか？";
    if (!window.confirm(label)) return;
    setBusyId(payment.id); setError(null);
    try {
      const url = action === "cancel" ? `/api/payments/${payment.id}/cancel`
        : action === "refund" ? `/api/payments/${payment.id}/refunds` : `/api/refunds/${refundId}/reconcile`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        ...(action === "reconcile" ? {} : { body: JSON.stringify(action === "cancel" ? { reason: reason!.trim() }
          : { amount, reason: reason!.trim(), mode: "STRIPE" }) }) });
      const result = await response.json().catch(() => null);
      if (result?.reconciliationNeeded) router.refresh();
      if (!response.ok) throw new Error(result?.error || "処理に失敗しました");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "処理に失敗しました"); }
    finally { setBusyId(null); }
  }

  async function createPrepayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) return;
    setError(null);
    const normalizedPurpose = purpose.trim();
    const parsedAmount = Number(amount);
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(parsedAmount) || parsedAmount < 50 || parsedAmount > 99_999_999) {
      setError("金額は50円から99,999,999円までの整数で入力してください。");
      return;
    }
    if (!normalizedPurpose) {
      setError("用途を入力してください。");
      return;
    }
    if (!window.confirm(`前受金依頼を作成しますか？\n金額: ¥${parsedAmount.toLocaleString()}\n用途: ${normalizedPurpose}`)) return;

    setIsCreating(true);
    try {
      const response = await fetch(`/api/repairs/${repairId}/prepayments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, purpose: normalizedPurpose }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "前受金依頼を作成できませんでした。");
      setAmount("");
      setPurpose("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "前受金依頼を作成できませんでした。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="mx-8 mt-4 rounded-lg border bg-white p-4" aria-label="前受金 / 部品代先払い">
      <h2 className="font-semibold">前受金 / 部品代先払い</h2>
      <p className="mt-1 text-sm text-gray-600">オンライン前受金は個人のお客様（B2C）のみ利用できます。</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <p>入金済み合計: <strong>¥{summary.succeededTotal.toLocaleString()}</strong></p>
        {hasPending && <p>お支払い待ち: <strong>¥{summary.pendingAmount.toLocaleString()}</strong></p>}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">履歴</h3>
        {payments.length === 0 ? <p className="mt-2 text-sm text-gray-600">前受金の履歴はありません。</p> : (
          <ul className="mt-2 divide-y rounded border">
            {payments.map(payment => (
              <li key={payment.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium break-words">{payment.purpose || "用途未設定"}</span>
                  <span className="font-semibold">¥{payment.amount.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-gray-600">{PREPAYMENT_STATUS_LABELS[payment.status]} · {payment.provider === "STRIPE" ? "Stripe" : payment.provider} / {payment.method === "CARD" ? "カード" : payment.method ?? "方法未設定"}</p>
                <p className="mt-1 text-gray-600">作成: {formatDate(payment.createdAt)}{payment.paidAt && ` · 入金: ${formatDate(payment.paidAt)}`}</p>
                {payment.status === "SUCCEEDED" && (() => {
                  const applied = payment.allocations.reduce((sum, row) => sum + effectiveAllocation(row), 0);
                  const totals = refundTotals(payment.refunds);
                  const available = refundableAmount({ ...payment, kind: "REPAIR_PREPAYMENT" });
                  return <div className="mt-2 space-y-1">
                    <p>入金額 ¥{payment.amount.toLocaleString()} · 充当中 ¥{applied.toLocaleString()} · 返金済 ¥{totals.succeeded.toLocaleString()} · 返金処理中 ¥{totals.pending.toLocaleString()} · 未充当利用可能 ¥{available.toLocaleString()}</p>
                    {payment.provider === "STRIPE" && available > 0 && totals.pending === 0 && <button type="button" disabled={busyId !== null} onClick={() => act(payment, "refund")} className="rounded border px-2 py-1">未充当額を返金</button>}
                  </div>;
                })()}
                {payment.status === "PENDING" && <button type="button" disabled={busyId !== null} onClick={() => act(payment, "cancel")} className="mt-2 rounded border px-2 py-1">依頼を取消</button>}
                {payment.refunds.map(refund => <p key={refund.id} className="mt-1 text-gray-600">返金 #{refund.id}: ¥{refund.amount.toLocaleString()} · {refund.status} · {refund.reason}{refund.status === "PENDING" && <button type="button" disabled={busyId !== null} onClick={() => act(payment, "reconcile", refund.id)} className="ml-2 underline">Stripe照合</button>}</p>)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isBusiness && (hasPending ? (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">お支払い待ちの前受金依頼が既にあります。別の依頼は作成できません。</p>
      ) : (
        <form onSubmit={createPrepayment} className="mt-4 space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">前受金依頼を作成</h3>
          <label className="block text-sm">金額（円）
            <input type="number" min="50" max="99999999" step="1" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full max-w-xs rounded border px-3 py-2" />
          </label>
          <label className="block text-sm">用途
            <input type="text" required value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="例: 海外取り寄せ部品代" className="mt-1 block w-full max-w-lg rounded border px-3 py-2" />
          </label>
          <p className="text-xs text-gray-600">作成時に金額と用途を確認します。未決済の依頼は理由を記録して取り消せます。</p>
          <button type="submit" disabled={isCreating} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? "作成中..." : "前受金依頼を作成"}</button>
        </form>
      ))}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
