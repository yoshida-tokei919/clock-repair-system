"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { selectedOptionTotal } from "@/lib/estimate-option-totals";
import type { PricingTaxMode } from "@/lib/pricing-tax";
import { isTerminalApprovalRepairStatus, matchesApprovedOptionSelection } from "@/lib/customer-approval-recovery";
import { createApprovalSubmitLatch } from "@/lib/customer-approval-submit-latch";

type Line = { id: number; itemNameSnapshot: string; displayNameSnapshot: string | null; quantity: number; quantityUnit?: string | null; unitPrice: number };
type Choice = { id: number; kind: string; name: string; notes: string | null; recommended: boolean; lines: Line[] };

export function CustomerEstimateOptions(props: {
  token: string; repairId: number; inquiryNumber: string; title: string; notes: string | null;
  commonLines: { quantity: number; unitPrice: number }[]; choices: Choice[]; mode: PricingTaxMode;
  pdfFileId: number | null; optionSourceHash: string; available: boolean; approved: boolean;
  unavailableMessage?: string;
  approvedPlanId?: number | null; approvedAddOnIds?: number[];
}) {
  const router = useRouter();
  const plans = props.choices.filter(choice => choice.kind === "PLAN");
  const addOns = props.choices.filter(choice => choice.kind === "ADD_ON");
  const [planId, setPlanId] = useState<number | null>(props.approvedPlanId ?? null);
  const [addOnIds, setAddOnIds] = useState<number[]>(props.approvedAddOnIds ?? []);
  const [approverName, setApproverName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLatch = useRef(createApprovalSubmitLatch());
  const submitBlocked = useRef(false);
  const [resolved, setResolved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const plan = plans.find(choice => choice.id === planId) ?? null;
  const selectedAddOns = addOns.filter(choice => addOnIds.includes(choice.id));
  const totals = selectedOptionTotal(props.commonLines, plan, selectedAddOns, props.mode);
  const money = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
  const canReview = props.available && !props.approved && !resolved && !uncertain && (!plans.length || !!plan) && !!approverName.trim();
  const submit = async () => {
    if (submitBlocked.current || !confirming || !canReview || !props.pdfFileId || submitting || !submitLatch.current.tryStart()) return;
    setSubmitting(true); setError("");
    const requestedAddOns = [...addOnIds].sort((a, b) => a - b);
    let conflictMessage = "";
    try {
      const response = await fetch(`/api/customer/repairs/${encodeURIComponent(props.token)}/estimate-options`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repairId: props.repairId, planChoiceId: planId, addOnChoiceIds: requestedAddOns,
          approverName: approverName.trim(), pdfFileId: props.pdfFileId, optionSourceHash: props.optionSourceHash }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status === 409) conflictMessage = result.error || "承認内容が変更されました。";
        throw new Error(result.error || "承認結果を確認できませんでした。");
      }
      submitBlocked.current = true;
      setResolved(true);
      setNotice(result.alreadyApproved ? "この選択内容はすでに承認済みです。" : "承認しました。");
      router.refresh();
    } catch {
      submitBlocked.current = true;
      setUncertain(true);
      try {
        const response = await fetch(`/api/customer/repairs/${encodeURIComponent(props.token)}/approval-status?repairId=${props.repairId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("status unavailable");
        const status = await response.json();
        const same = matchesApprovedOptionSelection(status, { pdfFileId: props.pdfFileId, optionSourceHash: props.optionSourceHash,
          planChoiceId: planId, addOnChoiceIds: requestedAddOns, approverName: approverName.trim() });
        if (isTerminalApprovalRepairStatus(status.repairStatus)) {
          setError("案件の状態が変更されました。ページを読み直して状態をご確認ください。");
        } else if (status.approvalStatus === "approved" && same) {
          setResolved(true);
          setNotice("この選択内容はすでに承認済みです。");
          router.refresh();
        } else if (status.approvalStatus === "approved") {
          setError("別の内容で承認済みです。ページを読み直して内容をご確認ください。");
        } else {
          setError(status.approvalStatus === "pending"
            ? `${conflictMessage ? `${conflictMessage} ` : ""}現在は未承認です。処理中の可能性があるため、ページを読み直してから状態をご確認ください。`
            : "承認状態を確認してください。ページを読み直してください。");
        }
      } catch { setError("承認結果を確認できません。ページを読み直してから状態をご確認ください。"); }
    }
    finally { submitLatch.current.finish(); setSubmitting(false); }
  };
  return <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm" aria-label={`${props.inquiryNumber} の見積選択`}>
    <h2 className="text-lg font-bold">{props.title || "見積プラン・追加作業"}</h2>
    {props.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{props.notes}</p>}
    {!props.available && !props.approved && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{props.unavailableMessage || "発行済みPDFと現在の見積内容を確認できません。工房へ再発行を依頼してください。"}</p>}
    {plans.length > 0 && <fieldset className="mt-4 space-y-2" disabled={!props.available || props.approved || submitting || uncertain || resolved}>
      <legend className="mb-2 font-bold">プラン（1つ選択）</legend>
      {plans.map(choice => <label key={choice.id} className="block cursor-pointer rounded-lg border border-slate-200 p-3">
        <span className="flex items-center gap-2"><input type="radio" name={`plan-${props.repairId}`} checked={planId === choice.id} onChange={() => { setPlanId(choice.id); setConfirming(false); }} />
          <span className="font-bold">{choice.name}</span>{choice.recommended && <span className="text-xs text-blue-700">推奨</span>}</span>
        {choice.notes && <span className="ml-6 block text-sm text-slate-600">{choice.notes}</span>}
        {choice.lines.map(line => <span key={line.id} className="ml-6 flex justify-between gap-3 text-sm"><span>{line.displayNameSnapshot || line.itemNameSnapshot} × {line.quantity}{line.quantityUnit ?? ""}</span><span>{money(line.unitPrice * line.quantity)}</span></span>)}
      </label>)}
    </fieldset>}
    {addOns.length > 0 && <fieldset className="mt-4 space-y-2" disabled={!props.available || props.approved || submitting || uncertain || resolved}>
      <legend className="mb-2 font-bold">追加作業（複数選択可）</legend>
      {addOns.map(choice => <label key={choice.id} className="block cursor-pointer rounded-lg border border-slate-200 p-3">
        <span className="flex items-center gap-2"><input type="checkbox" checked={addOnIds.includes(choice.id)} onChange={event => { setAddOnIds(current => event.target.checked ? [...current, choice.id] : current.filter(id => id !== choice.id)); setConfirming(false); }} />
          <span className="font-bold">{choice.name}</span></span>
        {choice.notes && <span className="ml-6 block text-sm text-slate-600">{choice.notes}</span>}
        {choice.lines.map(line => <span key={line.id} className="ml-6 flex justify-between gap-3 text-sm"><span>{line.displayNameSnapshot || line.itemNameSnapshot} × {line.quantity}{line.quantityUnit ?? ""}</span><span>{money(line.unitPrice * line.quantity)}</span></span>)}
      </label>)}
    </fieldset>}
    <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
      <div className="flex justify-between"><span>共通見積</span><span>{money(totals.commonAmount)}</span></div>
      <div className="flex justify-between"><span>選択プラン</span><span>{money(totals.planAmount)}</span></div>
      <div className="flex justify-between"><span>追加作業</span><span>{money(totals.addOnAmount)}</span></div>
      <div className="flex justify-between"><span>{props.mode === "INCLUSIVE" ? "内消費税" : "消費税"}</span><span>{money(totals.taxAmount)}</span></div>
      <div className="mt-2 flex justify-between border-t border-blue-200 pt-2 text-lg font-bold"><span>税込合計</span><span>{money(totals.grossAmount)}</span></div>
    </div>
    {props.approved || resolved ? <p className="mt-4 font-bold text-green-700">この選択内容は承認済みです。改訂・再承認は工房へご相談ください。</p> : <>
      <p className="mt-4 text-sm text-slate-600">見積内容の変更が必要な場合はコメントで工房へご相談ください。発行後のプラン改訂はこの画面では対応していません。</p>
      <label className="mt-4 block text-sm font-bold">承認者のお名前（取引先ご担当者）<input className="mt-1 w-full rounded border border-slate-300 p-2" value={approverName} maxLength={100} disabled={!props.available || submitting || uncertain} onChange={event => { setApproverName(event.target.value); setConfirming(false); }} /></label>
      {!confirming ? <button type="button" className="mt-4 rounded bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={!canReview} onClick={() => setConfirming(true)}>選択内容を確認する</button>
        : <div className="mt-4 rounded border border-blue-300 p-3"><p className="font-bold">承認内容の最終確認</p><p>プラン: {plan?.name ?? "なし"}</p><p>追加作業: {selectedAddOns.map(choice => choice.name).join("、") || "なし"}</p><p>承認者: {approverName.trim()}</p><p className="font-bold">税込合計: {money(totals.grossAmount)}</p><button type="button" className="mt-3 rounded bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={submitting || uncertain} onClick={submit}>{submitting ? "承認を確認中…" : "この内容で承認を確定する"}</button><button type="button" className="ml-3 text-sm underline" disabled={submitting || uncertain} onClick={() => setConfirming(false)}>選択に戻る</button></div>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
  </section>;
}
