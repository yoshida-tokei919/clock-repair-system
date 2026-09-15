"use client";

import { useState } from "react";

export function InvoiceCheckoutButton({ token }: { token: string }) {
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startCheckout() {
    setIsStarting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/customer/invoices/${encodeURIComponent(token)}/checkout`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) {
        throw new Error(result?.error || "オンライン決済の開始に失敗しました。");
      }
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "オンライン決済の開始に失敗しました。");
      setIsStarting(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={startCheckout}
        disabled={isStarting}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isStarting ? "決済ページを準備中..." : "オンラインでお支払い"}
      </button>
      {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
