"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { customerPlanName, selectedOptionTotal } from "@/lib/estimate-option-totals";
import { customerOptionLineLabel, customerOptionLineQuantity } from "@/lib/customer-option-line-label";
import type { PricingTaxMode } from "@/lib/pricing-tax";
import { isTerminalApprovalRepairStatus, matchesApprovedOptionSelection } from "@/lib/customer-approval-recovery";
import { createApprovalSubmitLatch } from "@/lib/customer-approval-submit-latch";
import { CustomerReturnAddress, type ReturnAddress } from "./CustomerReturnAddress";

type Line = { id: number; itemNameSnapshot: string; displayNameSnapshot: string | null; lineType?: string | null; quantity: number; quantityUnit?: string | null; unitPrice: number };
type Choice = { id: number; kind: string; name: string; notes: string | null; recommended: boolean; lines: Line[] };

export function CustomerEstimateOptions(props: {
  token: string; repairId: number; inquiryNumber: string; title: string; notes: string | null;
  commonLines: Line[]; choices: Choice[]; mode: PricingTaxMode;
  pdfFileId: number | null; optionSourceHash: string; available: boolean; approved: boolean;
  pdfHref?: string;
  unavailableMessage?: string;
  returnAddress?: ReturnAddress;
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
  const [address, setAddress] = useState(props.returnAddress);
  const [addressOpen, setAddressOpen] = useState(false);
  const plan = plans.find(choice => choice.id === planId) ?? null;
  const selectedAddOns = addOns.filter(choice => addOnIds.includes(choice.id));
  const totals = selectedOptionTotal(props.commonLines, plan, selectedAddOns, props.mode);
  const money = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
  const lineLabel = (line: Line) => customerOptionLineLabel(line.displayNameSnapshot || line.itemNameSnapshot, line.lineType);
  const planName = (choice: Choice) => customerPlanName(choice.name, plans.indexOf(choice));
  const canReview = props.available && !props.approved && !resolved && !uncertain && (!plans.length || !!plan) &&
    (props.commonLines.length > 0 || Boolean(plan?.lines.length) || selectedAddOns.some(choice => choice.lines.length > 0)) && !!approverName.trim();
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
    {address && <CustomerReturnAddress token={props.token} address={address} open={addressOpen} disabled={props.approved || resolved}
      onOpenChange={setAddressOpen} onAddressSaved={next => { setAddress(next); setAddressOpen(false); }} />}
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{props.title || "見積プラン・追加作業"}</h2>{props.pdfHref && <a className="text-sm font-bold text-blue-700 underline" href={props.pdfHref}>見積PDFを見る</a>}</div>
    {props.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{props.notes}</p>}
    {!props.available && !props.approved && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{props.unavailableMessage || "発行済みPDFと現在の見積内容を確認できません。工房へ再発行を依頼してください。"}</p>}
    <p className="mt-3 text-xs text-slate-600">明細の金額は{props.mode === "INCLUSIVE" ? "税込" : "税抜"}です。各案の合計は税込で表示しています。</p>
    {plans.length > 0 && <fieldset className="mt-4 space-y-2" disabled={!props.available || props.approved || submitting || uncertain || resolved}>
      <legend className="mb-2 font-bold">プラン（1つ選択）</legend>
      {plans.map(choice => <label key={choice.id} className="block cursor-pointer rounded-lg border border-slate-200 p-3">
        <span className="flex items-center gap-2"><input type="radio" name={`plan-${props.repairId}`} checked={planId === choice.id} onChange={() => { setPlanId(choice.id); setConfirming(false); }} />
          <span className="font-bold">{planName(choice)}</span>{choice.recommended && <span className="text-xs text-blue-700">おすすめ</span>}</span>
        {choice.notes && <span className="ml-6 block text-sm text-slate-600">{choice.notes}</span>}
        {[...props.commonLines, ...choice.lines].map((line, index) => <span key={`${index}-${line.id}`} className="ml-6 flex flex-wrap justify-between gap-x-3 text-sm"><span>{lineLabel(line)}{customerOptionLineQuantity(line.quantity, line.quantityUnit)}</span><span>{money(line.unitPrice * line.quantity)}</span></span>)}
        <span className="ml-6 mt-2 flex flex-wrap justify-between gap-x-2 border-t border-slate-200 pt-2 font-bold"><span>この案の税込合計</span><span>{money(selectedOptionTotal(props.commonLines, choice, [], props.mode).grossAmount)}</span></span>
      </label>)}
    </fieldset>}
    {addOns.length > 0 && <fieldset className="mt-4 space-y-2" disabled={!props.available || props.approved || submitting || uncertain || resolved}>
      <legend className="mb-2 font-bold">追加作業（複数選択可）</legend>
      {addOns.map(choice => <label key={choice.id} className="block cursor-pointer rounded-lg border border-slate-200 p-3">
        <span className="flex items-center gap-2"><input type="checkbox" checked={addOnIds.includes(choice.id)} onChange={event => { setAddOnIds(current => event.target.checked ? [...current, choice.id] : current.filter(id => id !== choice.id)); setConfirming(false); }} />
          <span className="font-bold">{choice.name}</span></span>
        {choice.notes && <span className="ml-6 block text-sm text-slate-600">{choice.notes}</span>}
        {choice.lines.map(line => <span key={line.id} className="ml-6 flex justify-between gap-3 text-sm"><span>{lineLabel(line)}{customerOptionLineQuantity(line.quantity, line.quantityUnit)}</span><span>{money(line.unitPrice * line.quantity)}</span></span>)}
      </label>)}
    </fieldset>}
    {(plan || plans.length === 0) && <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
      {selectedAddOns.length > 0 && <div className="flex justify-between"><span>選択した追加作業</span><span>{money(totals.addOnAmount)}</span></div>}
      <div className="flex justify-between"><span>{props.mode === "INCLUSIVE" ? "内消費税" : "消費税"}</span><span>{money(totals.taxAmount)}</span></div>
      <div className="mt-2 flex justify-between border-t border-blue-200 pt-2 text-lg font-bold"><span>税込合計</span><span>{money(totals.grossAmount)}</span></div>
    </div>}
    {props.approved || resolved ? <p className="mt-4 font-bold text-green-700">この選択内容は承認済みです。改訂・再承認は工房へご相談ください。</p> : <>
      <p className="mt-4 text-sm text-slate-600">見積内容の変更が必要な場合はコメントで工房へご相談ください。発行後のプラン改訂はこの画面では対応していません。</p>
      {address && <button type="button" className="mt-4 block text-sm text-blue-700 underline" onClick={() => setAddressOpen(true)}>返送先を確認・編集する</button>}
      <label className="mt-4 block text-sm font-bold">承認者のお名前{address ? "" : "（取引先ご担当者）"}<input className="mt-1 w-full rounded border border-slate-300 p-2" value={approverName} maxLength={100} disabled={!props.available || submitting || uncertain} onChange={event => { setApproverName(event.target.value); setConfirming(false); }} /></label>
      {!confirming ? <button type="button" className="mt-4 rounded bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={!canReview} onClick={() => setConfirming(true)}>選択内容を確認する</button>
        : <div className="mt-4 rounded border border-blue-300 p-3"><p className="font-bold">承認内容の最終確認</p><p>プラン: {plan ? planName(plan) : "なし"}</p><p>追加作業: {selectedAddOns.map(choice => choice.name).join("、") || "なし"}</p><p>承認者: {approverName.trim()}</p><p className="font-bold">税込合計: {money(totals.grossAmount)}</p><button type="button" className="mt-3 rounded bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50" disabled={submitting || uncertain} onClick={submit}>{submitting ? "承認を確認中…" : "この内容で承認を確定する"}</button><button type="button" className="ml-3 text-sm underline" disabled={submitting || uncertain} onClick={() => setConfirming(false)}>選択に戻る</button></div>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
  </section>;
}
