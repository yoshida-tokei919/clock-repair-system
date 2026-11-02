"use client";

import { useState } from "react";

export function InvoiceBankCopyButton({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");

  async function copy() {
    setMessage("");
    try {
      await navigator.clipboard.writeText(value);
      setMessage("コピーしました");
    } catch {
      setMessage("コピーできませんでした");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        aria-label={`${label}をコピー`}
      >
        コピー
      </button>
      <span role="status" aria-live="polite" className="text-xs font-normal text-slate-600">{message}</span>
    </span>
  );
}
