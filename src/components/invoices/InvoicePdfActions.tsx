"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InvoicePdfActionsProps = {
  invoiceId: number;
  hasPdf: boolean;
  invoiceStatus?: string;
};

export function InvoicePdfActions({ invoiceId, hasPdf, invoiceStatus }: InvoicePdfActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const canVoidInvoice = invoiceStatus !== "paid" && invoiceStatus !== "void";

  async function generatePdf() {
    setMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf/generate`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "請求書PDFの生成に失敗しました。");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "請求書PDFの生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendLine() {
    const confirmed = window.confirm(
      "この請求書共有URLをLINEで送信します。\nPDF添付は行いません。\n送信してよろしいですか？"
    );

    if (!confirmed) return;

    setMessage(null);
    setIsSendingLine(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/line`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "LINE送信に失敗しました。");
      }

      setMessage("送信しました。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LINE送信に失敗しました。");
    } finally {
      setIsSendingLine(false);
    }
  }

  async function voidInvoice() {
    const confirmed = window.confirm(
      "この請求書を取消し、紐づく納品書を未請求状態に戻します。\n保存済みPDFと送信履歴は削除されません。\n請求書番号は再利用されません。\n実行してよろしいですか？"
    );

    if (!confirmed) return;

    setMessage(null);
    setIsVoiding(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/void`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "請求書の取消に失敗しました。");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "請求書の取消に失敗しました。");
    } finally {
      setIsVoiding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap gap-2">
        {hasPdf ? (
          <>
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              PDFを開く
            </a>
            <button
              type="button"
              onClick={generatePdf}
              disabled={isGenerating || isSendingLine || isVoiding}
              className="inline-flex h-9 items-center justify-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "生成中..." : "PDFを生成"}
            </button>
            <button
              type="button"
              onClick={sendLine}
              disabled={isGenerating || isSendingLine || isVoiding}
              className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingLine ? "送信中..." : "LINEで送信"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={generatePdf}
            disabled={isGenerating || isVoiding}
            className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "生成中..." : "PDFを生成"}
          </button>
        )}
        {canVoidInvoice ? (
          <button
            type="button"
            onClick={voidInvoice}
            disabled={isGenerating || isSendingLine || isVoiding}
            className="inline-flex h-9 items-center justify-center rounded border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVoiding ? "取消中..." : "取消して未請求に戻す"}
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
