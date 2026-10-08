"use client";

import type { PaymentMethod, PaymentProvider, PaymentStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PREPAYMENT_STATUS_LABELS, summarizeRepairPrepayments } from "@/lib/repair-prepayment-display";

type Prepayment = {
  id: number;
  amount: number;
  purpose: string | null;
  status: PaymentStatus;
  provider: PaymentProvider;
  method: PaymentMethod | null;
  createdAt: Date;
  paidAt: Date | null;
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
  const [error, setError] = useState<string | null>(null);
  const summary = summarizeRepairPrepayments(payments);
  const hasPending = payments.some(payment => payment.status === "PENDING");

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
    if (!window.confirm(`前受金依頼を作成しますか？\n金額: ¥${parsedAmount.toLocaleString()}\n用途: ${normalizedPurpose}\n\n作成後、この画面から依頼の編集・取消はできません。`)) return;

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
          <p className="text-xs text-gray-600">作成時に金額と用途を確認します。作成後、この画面から編集・取消はできません。</p>
          <button type="submit" disabled={isCreating} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? "作成中..." : "前受金依頼を作成"}</button>
        </form>
      ))}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
