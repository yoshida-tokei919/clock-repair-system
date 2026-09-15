"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualBankTransferPayment({ invoiceId }: { invoiceId: number }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registerPayment() {
    const confirmed = window.confirm(
      "銀行口座への入金を確認しましたか？\nこの請求書を銀行振込で入金済みにします。",
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payments/manual`, { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "銀行振込の入金登録に失敗しました。");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "銀行振込の入金登録に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={registerPayment}
        disabled={isSubmitting}
        className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "登録中..." : "銀行振込を入金済みにする"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
