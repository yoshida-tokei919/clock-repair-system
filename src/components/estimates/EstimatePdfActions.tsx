"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EstimatePdfActionsProps = {
  estimateDocumentId: number;
  hasPdf: boolean;
  isBusiness: boolean;
};

export function EstimatePdfActions({ estimateDocumentId, hasPdf, isBusiness }: EstimatePdfActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [isIssuingUrl, setIsIssuingUrl] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

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
      "この見積書共有URLをLINEの送信待ちに登録します。\nPDF添付は行いません。\n登録してよろしいですか？"
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

      setMessage("LINEの送信待ちに登録しました。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LINE送信に失敗しました。");
    } finally {
      setIsSendingLine(false);
    }
  }

  async function issueShareUrl() {
    setMessage(null);
    setShareUrl(null);
    setCopyFailed(false);
    setIsIssuingUrl(true);
    try {
      const response = await fetch(`/api/documents/estimate/${estimateDocumentId}/share-url`, { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true || typeof result.url !== "string") {
        throw new Error(result?.error || "共有URLの発行に失敗しました。");
      }
      setShareUrl(result.url);
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage("共有URLをコピーしました。");
      } catch {
        setCopyFailed(true);
        setMessage("コピーできませんでした。下のURLを選択してコピーしてください。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "共有URLの発行に失敗しました。");
    } finally {
      setIsIssuingUrl(false);
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
              disabled={isGenerating || isSendingLine || isIssuingUrl}
              className="inline-flex h-9 items-center justify-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "生成中..." : "PDFを生成"}
            </button>
            <button
              type="button"
              onClick={sendLine}
              disabled={isGenerating || isSendingLine || isIssuingUrl}
              className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingLine ? "送信中..." : "LINEで送信"}
            </button>
            {isBusiness ? <button
              type="button"
              onClick={issueShareUrl}
              disabled={isGenerating || isSendingLine || isIssuingUrl}
              className="inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isIssuingUrl ? "発行・取得中..." : "共有URLを発行・コピー"}
            </button> : null}
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
      {hasPdf && isBusiness ? <p className="text-xs text-amber-700">共有URLを知っている人は見積書を閲覧し、見積案の選択・承認もできます。送付先と取り扱いに注意してください。</p> : null}
      {copyFailed && shareUrl ? (
        <div className="flex w-full max-w-xl flex-col gap-1 text-sm">
          <input aria-label="共有URL" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="w-full rounded border border-slate-300 px-2 py-1" />
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">共有ページを開く</a>
        </div>
      ) : null}
    </div>
  );
}
