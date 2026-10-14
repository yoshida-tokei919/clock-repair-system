"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IssuedDateDialog } from "./IssuedDateDialog";

type DocumentType = "estimate" | "delivery" | "invoice" | "warranty";

export function IssuedDateEditor({ type, id, issuedDate, hasPdf = false, onSaved }: {
  type: DocumentType; id: number; issuedDate: string; hasPdf?: boolean; onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(date: string) {
    if (date === issuedDate) { setOpen(false); return; }
    setBusy(true); setError(null);
    try {
      const pdfUrl = type === "estimate" ? `/api/documents/estimate/${id}/pdf/generate` : `/api/invoices/${id}/pdf/generate`;
      const response = await fetch(hasPdf ? pdfUrl : `/api/documents/issued-date/${type}/${id}`, {
        method: hasPdf ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuedDate: date }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok === false) throw new Error(result?.error || "発行日の変更に失敗しました");
      setOpen(false); onSaved?.(); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "発行日の変更に失敗しました");
    } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span>発行日: {issuedDate}</span>
    <button type="button" className="rounded border px-2 py-1 hover:bg-slate-50" onClick={() => setOpen(true)}>変更</button>
    {error && <span role="alert" className="text-red-700">{error}</span>}
    <IssuedDateDialog open={open} title="発行日を変更" initialDate={issuedDate} busy={busy}
      onClose={() => setOpen(false)} onConfirm={date => void save(date ?? issuedDate)} />
  </div>;
}
