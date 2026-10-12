"use client";

import { useState } from "react";
import { canApplyCommunicationAiDraft } from "@/lib/communication-ai-draft";

type OriginSummary = {
  inquiryId: number;
  status: string;
  summary: string;
  firstReceivedAt: string;
  lastReceivedAt: string;
  analysisCompletedAt: string | null;
} | null;

type AiBrief = {
  id: number;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  summary: string | null;
  unresolvedItems: unknown;
  customerRequirements: unknown;
  decisions: unknown;
  replyDraft: string | null;
  createdAt: string;
  stale: boolean;
} | null;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RepairAiBriefPanel({
  repairId,
  originSummary,
  aiBrief,
  onApplyReplyDraft,
  canReply,
}: {
  repairId: number;
  originSummary: OriginSummary;
  aiBrief: AiBrief;
  onApplyReplyDraft: (text: string) => void;
  canReply: boolean;
}) {
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [draftStale, setDraftStale] = useState(false);
  const [draftError, setDraftError] = useState("");

  async function applyDraft() {
    if (!aiBrief?.replyDraft || aiBrief.stale || draftStale || applyingDraft || !canReply) return;
    setApplyingDraft(true);
    setDraftError("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/line`, { cache: "no-store" });
      if (!response.ok) throw new Error("AI返信案の最新状態を確認できませんでした。もう一度お試しください。");
      const fresh = await response.json();
      if (!canApplyCommunicationAiDraft(aiBrief, fresh.aiBrief, fresh.sendAvailable)) {
        setDraftStale(true);
        setDraftError("AI返信案は新着LINEまたは関連付け変更により古くなりました。再生成してください。");
        return;
      }
      onApplyReplyDraft(aiBrief.replyDraft);
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : "AI返信案の最新状態を確認できませんでした。");
    } finally {
      setApplyingDraft(false);
    }
  }
  if (!originSummary && !aiBrief) return null;

  const unresolved = stringArray(aiBrief?.unresolvedItems);
  const requirements = stringArray(aiBrief?.customerRequirements);
  const decisions = stringArray(aiBrief?.decisions);

  return <div className="space-y-3">
    {originSummary && <section className="rounded border border-blue-200 bg-blue-50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-blue-950">元Inquiry全体のAI要約</h3>
        <span className="text-xs text-blue-800">
          Inquiry #{originSummary.inquiryId} · {originSummary.status}
          {originSummary.analysisCompletedAt ? ` · AI解析 ${formatDate(originSummary.analysisCompletedAt)}` : ""}
          {` · 最終受信 ${formatDate(originSummary.lastReceivedAt)}`}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-zinc-800">{originSummary.summary}</p>
      <p className="mt-2 text-xs text-blue-800">この要約は元Inquiry全体のAI解析結果です。複数時計のInquiryでは他時計の内容を含む可能性があり、案件化後の新着LINEを含む現在のRepair要約ではありません。</p>
    </section>}

    {aiBrief && <section className={`space-y-3 rounded border p-4 text-sm ${aiBrief.stale || draftStale ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div>
        <h3 className="font-semibold">Repair AIブリーフ</h3>
        <p className="mt-1 text-xs text-zinc-600">{formatDate(aiBrief.createdAt)} 生成 · {aiBrief.modelProvider}/{aiBrief.modelName}{aiBrief.stale || draftStale ? " · 新着LINEまたは関連付け変更あり（再生成が必要）" : " · 表示時点のRepair文脈と一致"}</p>
      </div>
      {aiBrief.summary && <div><h4 className="font-medium">要約</h4><p className="mt-1 whitespace-pre-wrap">{aiBrief.summary}</p></div>}
      {unresolved.length > 0 && <div><h4 className="font-medium">未対応事項</h4><ul className="mt-1 list-disc space-y-1 pl-5">{unresolved.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {requirements.length > 0 && <div><h4 className="font-medium">顧客指定</h4><ul className="mt-1 list-disc space-y-1 pl-5">{requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {decisions.length > 0 && <div><h4 className="font-medium">決定事項</h4><ul className="mt-1 list-disc space-y-1 pl-5">{decisions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {aiBrief.replyDraft && <div className="rounded border border-zinc-200 bg-white/80 p-3">
        <h4 className="font-medium">AI返信案</h4>
        <p className="mt-2 whitespace-pre-wrap text-zinc-900">{aiBrief.replyDraft}</p>
        {aiBrief.stale || draftStale ? <p className="mt-2 text-xs font-medium text-amber-900">古い文脈で作られた案のため、再生成するまで返信欄へ反映できません。</p> : !canReply ? <p className="mt-2 text-xs font-medium text-amber-900">このRepairには送信可能な元Inquiryがないため、ここからは返信できません。</p> : <button
          type="button"
          className="mt-3 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-800"
          disabled={applyingDraft}
          onClick={() => void applyDraft()}
        >{applyingDraft ? "確認中…" : "返信欄に反映"}</button>}
        {draftError && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{draftError}</p>}
      </div>}
    </section>}
  </div>;
}
