"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refundTotals } from "@/lib/payment-accounting";

type InvoicePayment = { id: number; amount: number; kind: string; provider: string; status: string;
  refunds: { id: number; amount: number; status: string; reason: string }[] };
type ManualOperation = { amount: number; reason: string; manualOperationKey: string };
const storageKey = (paymentId: number) => `invoice-manual-refund:${paymentId}`;

export function InvoiceRefundControls({ payments }: { payments: InvoicePayment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingManual, setPendingManual] = useState<Record<number, ManualOperation>>({});
  const [blockedManual, setBlockedManual] = useState<number[]>([]);
  const [manualReady, setManualReady] = useState(false);

  useEffect(() => {
    const pending: Record<number, ManualOperation> = {};
    const blocked: number[] = [];
    for (const payment of payments.filter(row => row.provider === "MANUAL")) {
      try {
        const stored = sessionStorage.getItem(storageKey(payment.id));
        if (!stored) continue;
        const parsed = JSON.parse(stored) as ManualOperation;
        if (!parsed || !Number.isSafeInteger(parsed.amount) || parsed.amount <= 0
          || typeof parsed.reason !== "string" || !parsed.reason.trim()
          || typeof parsed.manualOperationKey !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.manualOperationKey)) {
          throw new Error("invalid saved operation");
        }
        pending[payment.id] = parsed;
      } catch { blocked.push(payment.id); setError("保存された手動返金操作を確認できません。管理者に確認してください。"); }
    }
    setPendingManual(pending);
    setBlockedManual(blocked);
    setManualReady(true);
  // Saved operations are loaded once for this mounted invoice view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(payment: InvoicePayment, refundId?: number) {
    if (busy) return;
    const reconcile = refundId !== undefined;
    const { succeeded, pending } = refundTotals(payment.refunds);
    const capacity = payment.amount - succeeded - pending;
    const manual = payment.provider === "MANUAL";
    let operation = manual ? pendingManual[payment.id] : undefined;
    const rawAmount = reconcile || operation ? null : window.prompt(`返金額（円、最大 ¥${capacity.toLocaleString()}）`);
    if (!reconcile && !operation && rawAmount === null) return;
    const amount = operation?.amount ?? (rawAmount === null ? NaN : Number(rawAmount));
    if (!reconcile && !operation && (!/^\d+$/.test(rawAmount ?? "") || !Number.isSafeInteger(amount) || amount <= 0 || amount > capacity)) {
      setError("返金額を確認してください"); return;
    }
    const reason = operation?.reason ?? (reconcile ? null : window.prompt("返金理由を入力してください"));
    if (!reconcile && !reason?.trim()) return;
    if (!window.confirm(reconcile ? "Stripe返金結果を照合しますか？" : operation
      ? `保存された手動返金操作（¥${amount.toLocaleString()}）を同じキーで再確認しますか？`
      : manual
      ? `銀行振込で ¥${amount.toLocaleString()} を外部で返金済みですか？この操作は記録のみ行い、送金はしません。`
      : `Stripeで ¥${amount.toLocaleString()} を返金しますか？`)) return;
    setBusy(true); setError(null);
    try {
      if (manual && !reconcile && !operation) {
        operation = { amount, reason: reason!.trim(), manualOperationKey: crypto.randomUUID() };
        sessionStorage.setItem(storageKey(payment.id), JSON.stringify(operation));
        setPendingManual(current => ({ ...current, [payment.id]: operation! }));
      }
      const response = await fetch(reconcile ? `/api/refunds/${refundId}/reconcile` : `/api/payments/${payment.id}/refunds`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        ...(reconcile ? {} : { body: JSON.stringify({ amount: operation?.amount ?? amount,
          reason: operation?.reason ?? reason!.trim(), mode: manual ? "MANUAL" : "STRIPE",
          ...(manual ? { manualOperationKey: operation!.manualOperationKey } : {}) }) }),
      });
      const result = await response.json().catch(() => null);
      if (result?.reconciliationNeeded) router.refresh();
      if (manual && response.status === 400) {
        sessionStorage.removeItem(storageKey(payment.id));
        setPendingManual(current => { const next = { ...current }; delete next[payment.id]; return next; });
      }
      if (!response.ok) throw new Error(result?.error || "返金処理に失敗しました");
      if (manual) {
        sessionStorage.removeItem(storageKey(payment.id));
        setPendingManual(current => { const next = { ...current }; delete next[payment.id]; return next; });
      }
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "返金処理に失敗しました"); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 space-y-2 border-t pt-3">
    <h3 className="font-semibold">請求入金の返金履歴</h3>
    {payments.map(payment => {
      const totals = refundTotals(payment.refunds);
      const capacity = payment.status === "SUCCEEDED" && totals.pending === 0
        ? payment.amount - totals.succeeded : 0;
      return <div key={payment.id} className="rounded border p-2">
        <p>入金 #{payment.id} · {payment.provider === "MANUAL" ? "銀行振込" : "Stripe"} · 元の入金額 ¥{payment.amount.toLocaleString()} · 返金済 ¥{totals.succeeded.toLocaleString()} · 返金処理中 ¥{totals.pending.toLocaleString()} · 新規返金可能 ¥{capacity.toLocaleString()}</p>
        {(capacity > 0 || pendingManual[payment.id]) && <button type="button" disabled={busy || (payment.provider === "MANUAL" && (!manualReady || blockedManual.includes(payment.id)))} onClick={() => submit(payment)} className="mt-1 rounded border px-2 py-1">{pendingManual[payment.id] ? "手動返金記録を同じ操作で再確認" : payment.provider === "MANUAL" ? "外部返金の完了を記録" : "Stripe返金"}</button>}
        {payment.refunds.map(refund => <p key={refund.id} className="mt-1 text-slate-600">返金 #{refund.id}: ¥{refund.amount.toLocaleString()} · {refund.status} · {refund.reason}{refund.status === "PENDING" && <button type="button" disabled={busy} onClick={() => submit(payment, refund.id)} className="ml-2 underline">Stripe照合</button>}</p>)}
      </div>;
    })}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
