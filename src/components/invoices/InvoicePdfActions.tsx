"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InvoicePdfActionsProps = {
  invoiceId: number;
  delivery: { method: "LINE" | "POSTAL"; status: string } | null;
  hasPdf: boolean;
  canModifyInvoice: boolean;
  canVoidInvoice: boolean;
};

function deliveryStatusLabel(status: string) {
  switch (status) {
    case "READY": return "未登録";
    case "APPROVED": return "送信待ち（未送信）";
    case "CLAIMED": return "送信処理中（未確認）";
    case "PRE_SEND_FAILED": return "送信前失敗・再試行待ち";
    case "POST_UNCONFIRMED": return "送信結果の照合待ち";
    case "CONFIRMED": return "送信確認済み";
    case "CANCELLED": return "送信待ち取消済み";
    case "LEGACY_SENT": return "旧LINE送信記録あり（通常トーク照合対象外）";
    case "LEGACY_UNRESOLVED": return "旧LINE送信状態の確認が必要";
    default: return "状態の確認が必要";
  }
}

export function InvoicePdfActions({ invoiceId, delivery, hasPdf, canModifyInvoice, canVoidInvoice }: InvoicePdfActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

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
      "この請求書共有URLをLINE通常トークの送信待ちに登録します。\nPDF添付は行いません。\n登録してよろしいですか？"
    );

    if (!confirmed) return;

    setMessage(null);
    setIsSendingLine(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/line`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || "LINE送信待ちの登録に失敗しました。");
      }
      setMessage(result.outboxStatus === "CONFIRMED" ? "LINE通常トークで送信確認済みです。" : "LINE通常トークの送信待ちに登録しました。送信確認は照合後に反映されます。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LINE送信待ちの登録に失敗しました。");
    } finally {
      setIsSendingLine(false);
    }
  }

  async function voidInvoice() {
    const confirmed = window.confirm(
      "この請求書を取消し、紐づく納品書を未請求状態に戻します。\n有効な前受金充当は解除され、未使用の前受金に戻ります。返金は行いません。\n請求入金に未返金額や処理中の返金がある場合は取消できません。\n保存済みPDFと送信履歴は削除されません。\n請求書番号は再利用されません。\n実行してよろしいですか？"
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
      {delivery ? <p className="text-sm text-slate-700">
        {delivery.method === "POSTAL" ? "送付方法: 郵送（印刷対象・未送付）" : `送付方法: LINE通常トーク — ${deliveryStatusLabel(delivery.status)}`}
      </p> : null}
      <div className="flex flex-wrap gap-2">
        {hasPdf ? (
          <>
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              PDFを開く
            </a>
            {canModifyInvoice ? <>
              <button
                type="button"
                onClick={generatePdf}
                disabled={isGenerating || isSendingLine || isVoiding}
                className="inline-flex h-9 items-center justify-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "生成中..." : "PDFを生成"}
              </button>
              {delivery?.method === "LINE" && delivery.status === "READY" ? <button
                type="button"
                onClick={sendLine}
                disabled={isGenerating || isSendingLine || isVoiding}
                className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingLine ? "登録中..." : "LINE通常トークの送信待ちに登録"}
              </button> : null}
            </> : null}
          </>
        ) : (canModifyInvoice ? (
          <button
            type="button"
            onClick={generatePdf}
            disabled={isGenerating || isVoiding}
            className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "生成中..." : "PDFを生成"}
          </button>
        ) : null)}
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
