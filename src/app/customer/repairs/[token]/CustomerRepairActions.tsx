"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clipboard, Copy, FileText, RefreshCw, Share2, X } from "lucide-react";

type CustomerMessage = {
  id: number;
  body: string;
  createdAt: Date | string;
  readAt?: Date | string | null;
  senderType?: "shop" | "partner" | string | null;
};

type Props = {
  token: string;
  isBusiness: boolean;
  inquiryNumber: string;
  messages?: CustomerMessage[];
  customerName?: string;
};

function MiniToast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg">
      <CheckCircle className="h-4 w-4" />
      <span>{message}</span>
      <button type="button" onClick={onClose} className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white" aria-label="閉じる">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PdfLinkButton({ href }: { href: string }) {
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => showToast("PDFを開きました")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
      >
        <FileText className="h-4 w-4" />
        PDF
      </a>
      <MiniToast message={toast} onClose={() => setToast("")} />
    </>
  );
}

export function CopyExplanationButton({ text }: { text: string }) {
  const [toast, setToast] = useState("");

  const handleCopy = async () => {
    try {
      await copyText(text);
      setToast("説明文をコピーしました");
    } catch {
      setToast("コピーできませんでした");
    } finally {
      window.setTimeout(() => setToast(""), 2200);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
        aria-label="説明文をコピー"
      >
        <Copy className="h-4 w-4" />
      </button>
      <MiniToast message={toast} onClose={() => setToast("")} />
    </>
  );
}

export function PartnerPrivateMemo({ token }: { token: string; inquiryNumber: string }) {
  const storageKey = `customer-repair-partner-private-memo:${token}`;
  const [memo, setMemo] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const value = window.localStorage.getItem(storageKey) || "";
    setMemo(value);
    window.dispatchEvent(
      new CustomEvent("customer-private-memo-change", {
        detail: { key: storageKey, memo: value },
      }),
    );
  }, [storageKey]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const handleMemoChange = (value: string) => {
    setMemo(value);
    window.localStorage.setItem(storageKey, value);
    window.dispatchEvent(
      new CustomEvent("customer-private-memo-change", {
        detail: { key: storageKey, memo: value },
      }),
    );
  };

  const handleCopy = async () => {
    try {
      await copyText(memo);
      showToast("テキストをコピーしました");
    } catch {
      showToast("コピーできませんでした");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "貴社専用メモ", text: memo });
        showToast("共有を起動しました");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await handleCopy();
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">貴社専用メモ</h2>
        <span className="text-sm font-bold text-amber-900">この内容は当店には送信されません。</span>
      </div>
      <textarea
        value={memo}
        onChange={(event) => handleMemoChange(event.target.value)}
        className="min-h-24 w-full rounded-lg border border-amber-200 bg-white p-3 text-base leading-6 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        placeholder="こちらにメモを入力してください"
      />
      <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          <Share2 className="h-4 w-4" />
          メモアプリへ共有
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          <Clipboard className="h-4 w-4" />
          テキストをコピー
        </button>
      </div>
      <MiniToast message={toast} onClose={() => setToast("")} />
    </section>
  );
}

function getBusinessMessageSenderName(message: CustomerMessage, partnerName?: string) {
  if (message.senderType === "shop") return "ヨシダ時計修理工房";
  const name = partnerName?.trim();
  return `${name || "取引先"} 様`;
}

export function CustomerRepairActions({ token, isBusiness, inquiryNumber, messages = [], customerName }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const postAction = async (path: string, body?: unknown) => {
    setLoading(path);
    try {
      const response = await fetch(`/api/customer/repairs/${token}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "処理に失敗しました。");
      }
      return result;
    } finally {
      setLoading(null);
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) {
      alert("コメントを入力してください。");
      return;
    }
    try {
      await postAction("messages", { body: comment });
      setComment("");
      router.refresh();
      alert("コメントを送信しました。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "コメント送信に失敗しました。");
    }
  };

  const handleApprove = async () => {
    try {
      await postAction("approve");
      router.refresh();
      alert("承認しました。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "承認に失敗しました。");
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      alert("差戻し理由をコメント欄に入力してください。");
      return;
    }
    try {
      await postAction("reject", { body: comment });
      setComment("");
      router.refresh();
      alert("差戻しを送信しました。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "差戻しに失敗しました。");
    }
  };

  if (isBusiness) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={!!loading}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle className="h-5 w-5" />
            <span>
              この内容で
              <br className="min-[420px]:hidden" />
              承認する
            </span>
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <RefreshCw className="h-5 w-5" />
            <span>
              差戻し・
              <br className="min-[420px]:hidden" />
              修正依頼する
            </span>
          </button>
        </div>

        <div className="mt-4">
          <h2 className="text-base font-bold text-slate-900">コメント</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            ご不明点は本案件のコメント欄よりご連絡ください。
            <br />
            このコメントは本案件に紐づいて保存されます。
          </p>
        </div>

        {messages.length > 0 && (
          <div className="mt-3 space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-bold text-slate-800">{getBusinessMessageSenderName(message, customerName)}</span>
                  <span>{new Date(message.createdAt).toLocaleString("ja-JP")}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{message.body}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-[1fr_11rem]">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
            className="min-h-11 rounded-lg border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="コメントを入力してください"
            maxLength={500}
          />
          <button
            type="button"
            onClick={handleComment}
            disabled={!!loading}
            className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            コメント送信
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold">連絡・承認</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ご不明点や追加のご希望がございましたら、こちらのフォームよりお気軽にご連絡ください。
        </p>
        <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
          対象案件: {inquiryNumber}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={!!loading}
          className="h-12 rounded-lg border border-green-300 bg-green-50 px-4 text-base font-bold text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          承認する
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={!!loading}
          className="h-12 rounded-lg border border-amber-300 bg-amber-50 px-4 text-base font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          差戻し
        </button>
      </div>

      <div className="my-4 border-t border-slate-200" />

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value.slice(0, 500))}
        className="min-h-32 w-full rounded-lg border border-slate-300 p-3 text-base leading-7 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        placeholder="ご質問や追加のご希望があればご記入ください"
        maxLength={500}
      />
      <div className="mt-1 text-right text-xs text-slate-400">{comment.length}/500</div>

      <button
        type="button"
        onClick={handleComment}
        disabled={!!loading}
        className="mt-3 h-12 w-full rounded-lg bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        コメント送信
      </button>
    </section>
  );
}
