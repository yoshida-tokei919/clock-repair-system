"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EstimatePdfActionsProps = {
  estimateDocumentId: number;
  hasPdf: boolean;
};

export function EstimatePdfActions({ estimateDocumentId, hasPdf }: EstimatePdfActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);

  async function generatePdf() {
    setMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/documents/estimate/${estimateDocumentId}/pdf/generate`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "見積書PDFの生成に失敗しました。");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "見積書PDFの生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendLine() {
    const confirmed = window.confirm(
      "この見積書共有URLをLINEで送信します。\nPDF添付は行いません。\n送信してよろしいですか？"
    );

    if (!confirmed) return;

    setMessage(null);
    setIsSendingLine(true);

    try {
      const response = await fetch(`/api/documents/estimate/${estimateDocumentId}/line`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.success === false || result?.ok === false) {
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

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex flex-wrap gap-2">
        {hasPdf ? (
          <>
            <a
              href={`/api/documents/estimate/${estimateDocumentId}/pdf`}
              className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              PDFを開く
            </a>
            <button
              type="button"
              onClick={generatePdf}
              disabled={isGenerating || isSendingLine}
              className="inline-flex h-9 items-center justify-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "生成中..." : "PDFを生成"}
            </button>
            <button
              type="button"
              onClick={sendLine}
              disabled={isGenerating || isSendingLine}
              className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingLine ? "送信中..." : "LINEで送信"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={generatePdf}
            disabled={isGenerating}
            className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "生成中..." : "PDFを生成"}
          </button>
        )}
      </div>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
