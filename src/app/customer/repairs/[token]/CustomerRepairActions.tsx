"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clipboard, Copy, FileText, Share2, X } from "lucide-react";

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
  isApproved?: boolean;
  showApproval?: boolean;
  lineUrl?: string;
  inquiryNumber: string;
  messages?: CustomerMessage[];
  customerName?: string;
  photoPostingOptOut?: boolean;
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
  const [isOpen, setIsOpen] = useState(false);
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
    <section className="rounded-lg border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
        aria-expanded={isOpen}
      >
        <span>貴社専用メモ</span>
        <span aria-hidden="true">{isOpen ? "⌃" : "∨"}</span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500">この内容は当店には送信されません。</span>
          </div>
      <textarea
        value={memo}
        onChange={(event) => handleMemoChange(event.target.value)}
        className="min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-base leading-6 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
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
        </div>
      )}
    </section>
  );
}

function getBusinessMessageSenderName(message: CustomerMessage, partnerName?: string) {
  if (message.senderType === "shop") return "ヨシダ時計修理工房";
  const name = partnerName?.trim();
  return `${name || "取引先"} 様`;
}

export function CustomerRepairActions({ token, isBusiness, isApproved = false, showApproval = true, lineUrl, inquiryNumber, messages = [], customerName, photoPostingOptOut = false }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [approved, setApproved] = useState(isApproved);
  const [postingOptOut, setPostingOptOut] = useState(photoPostingOptOut);

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
    if (approved || loading) return;
    try {
      await postAction("approve");
      setApproved(true);
      router.refresh();
      alert("承認しました。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "承認に失敗しました。");
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      alert(isBusiness ? "差戻し理由をコメント欄に入力してください。" : "相談・修正をご希望の内容を入力してください。");
      return;
    }
    try {
      await postAction("reject", { body: comment });
      setComment("");
      router.refresh();
      alert(isBusiness ? "差戻しを送信しました。" : "相談内容を送信しました。");
    } catch (error) {
      alert(isBusiness ? (error instanceof Error ? error.message : "差戻しに失敗しました。") : "相談内容の送信に失敗しました。");
    }
  };

  const handlePostingOptOut = async (checked: boolean) => {
    try {
      await postAction("photo-posting-opt-out", { photoPostingOptOut: checked });
      setPostingOptOut(checked);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "写真掲載設定の変更に失敗しました。");
    }
  };

  if (isBusiness) {
    return (
      <section className="rounded-xl border border-blue-100 bg-[#f8fbff] p-4 shadow-sm">
        <div className="mb-3 border-b border-blue-100 pb-3">
          <p className="text-sm font-bold text-slate-800">ご確認・ご回答</p>
          <p className="mt-1 text-sm text-slate-600">見積内容をご確認のうえ、承認または修正依頼を選択してください。</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approved || !!loading}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle className="h-5 w-5" />
            <span>{approved ? "承認済み" : "この内容で承認する"}</span>
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={!!loading}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <span>修正を依頼する</span>
          </button>
        </div>

        <div className="mt-5">
          <h2 className="text-base font-bold text-slate-900">コメント</h2>
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

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem]">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
            className="min-h-11 rounded-lg border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="コメントを入力してください（任意）"
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
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {showApproval && (
        <>
          <div className="mb-3">
            <h2 className="text-lg font-bold">お見積の確認</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              内容をご確認のうえ、この内容で進めてよいかお知らせください。
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approved || !!loading}
              className="h-12 w-full rounded-lg bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approved ? "承認済み" : "この内容で進める"}
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={postingOptOut} disabled={!!loading} onChange={(event) => void handlePostingOptOut(event.target.checked)} className="mt-1" />
            <span><span className="font-bold">修理写真の事例・SNSへの掲載を希望しない</span><span className="mt-1 block text-xs leading-5 text-slate-500">顧客共有ページの写真表示には影響しません。</span></span>
          </label>

          <div className="my-4 border-t border-slate-200" />
        </>
      )}

      {lineUrl && (
        <a
          href={lineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center rounded-lg border border-[#06c755] bg-white px-4 text-base font-bold text-[#078a3f] hover:bg-[#f0fbf4]"
        >
          LINEで相談する
        </a>
      )}
    </section>
  );
}
