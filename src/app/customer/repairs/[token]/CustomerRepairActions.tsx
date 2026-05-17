"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  token: string;
  isBusiness: boolean;
  inquiryNumber: string;
};

export function CopyExplanationButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("コピーに失敗しました。");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
    >
      {copied ? "コピーしました" : "説明文をコピー"}
    </button>
  );
}

export function PartnerPrivateMemo({ token, inquiryNumber }: { token: string; inquiryNumber: string }) {
  const storageKey = `customer-repair-partner-private-memo:${token}`;
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMemo(window.localStorage.getItem(storageKey) || "");
  }, [storageKey]);

  const handleSave = () => {
    window.localStorage.setItem(storageKey, memo);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-900">貴社専用メモ</h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          このメモは貴社内確認用です。
          <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-950">
            当店には共有されません。
          </span>
        </p>
        <p className="mt-2 rounded bg-white/70 px-3 py-2 text-sm font-bold text-amber-950">
          対象案件: {inquiryNumber}
        </p>
      </div>
      <label className="block text-sm font-bold text-slate-600">
        社内メモ
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          className="mt-1 min-h-32 w-full rounded-lg border border-amber-200 bg-white p-3 text-base leading-7 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          placeholder="お客様へご案内した内容や、社内確認事項などを記録できます"
        />
      </label>
      <button
        type="button"
        onClick={handleSave}
        className="mt-3 h-12 w-full rounded-lg bg-amber-600 px-4 text-base font-bold text-white hover:bg-amber-700"
      >
        {saved ? "保存しました" : "メモを保存"}
      </button>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        このメモはこの端末のブラウザ内に保存され、共有コメントには入りません。
      </p>
    </section>
  );
}

export function CustomerRepairActions({ token, isBusiness, inquiryNumber }: Props) {
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

  return (
    <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold">連絡・承認</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {isBusiness
            ? "備考・連絡事項がございましたら、こちらのフォームよりご連絡ください。このコメントは本案件に紐づいて保存されます。"
            : "ご不明点・追加のご希望・承認前のご相談がございましたら、こちらのフォームよりお気軽にご連絡ください。このコメントは本案件に紐づいて保存されます。"}
        </p>
        <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
          対象案件: {inquiryNumber}
        </p>
      </div>

      {!isBusiness && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          内容に迷いがある場合は、承認前にコメントでご相談ください。差戻しをする場合も理由をご記入ください。
        </p>
      )}

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
        placeholder={isBusiness ? "備考・連絡事項" : "ご質問や追加のご希望があればご記入ください"}
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
