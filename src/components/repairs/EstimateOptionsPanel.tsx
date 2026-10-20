"use client";

import { useEffect, useId, useState } from "react";
import { displayEstimateOptionContactNote } from "@/lib/estimate-option-contact-text";
import { selectedOptionTotal } from "@/lib/estimate-option-totals";

type Line = {
  lineType: "LABOR" | "PART"; itemNameSnapshot: string; displayNameSnapshot: string;
  notesForCustomerSnapshot: string; workTypeSnapshot: "INTERNAL" | "EXTERNAL" | null;
  categoryNameSnapshot: string; actionNameSnapshot: string; targetPartNameSnapshot: string;
  detailLabelSnapshot: string; quantity: number; unitPrice: number;
  partsMasterId: number | null; pricingRuleId: number | null; repairWorkCategoryId: number | null;
  repairWorkActionId: number | null; targetPartNameId: string | null;
};
type Choice = { kind: "PLAN" | "ADD_ON"; name: string; notes: string; recommended: boolean; lines: Line[] };
type SetDraft = { title: string; notes: string; isActive: boolean; choices: Choice[] };
type CommonLine = { itemName: string; quantity: number; unitPrice: number };

const newLine = (lineType: Line["lineType"] = "PART"): Line => ({ lineType, itemNameSnapshot: "", displayNameSnapshot: "", notesForCustomerSnapshot: "", workTypeSnapshot: null,
  categoryNameSnapshot: "", actionNameSnapshot: "", targetPartNameSnapshot: "", detailLabelSnapshot: "", quantity: 1, unitPrice: 0,
  partsMasterId: null, pricingRuleId: null, repairWorkCategoryId: null, repairWorkActionId: null, targetPartNameId: null });
const newChoice = (kind: Choice["kind"], name = ""): Choice => ({ kind, name, notes: "", recommended: false, lines: [newLine()] });
const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
const lineAmount = (line: { quantity: number; unitPrice: number }) => line.quantity * line.unitPrice;

export function EstimateOptionsPanel({ repairId }: { repairId: number }) {
  const formId = useId();
  const [draft, setDraft] = useState<SetDraft>({ title: "", notes: "", isActive: false, choices: [] });
  const [editable, setEditable] = useState(false);
  const [mode, setMode] = useState<"EXCLUSIVE" | "INCLUSIVE">("EXCLUSIVE");
  const [commonLines, setCommonLines] = useState<CommonLine[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [contactText, setContactText] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const hasUnsavedDraft = JSON.stringify(draft) !== savedDraft;
  useEffect(() => { setCopyMessage(""); }, [draft]);
  useEffect(() => {
    let live = true;
    fetch(`/api/repairs/${repairId}/estimate-options`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "読込に失敗しました。");
      if (!live) return;
      const nextDraft: SetDraft = data.set ? { title: data.set.title, notes: data.set.notes ?? "", isActive: data.set.isActive,
        choices: data.set.choices.map((choice: Choice) => ({ ...choice, notes: choice.notes ?? "", lines: choice.lines.map((line: Line) => ({ ...line,
          displayNameSnapshot: line.displayNameSnapshot ?? "", notesForCustomerSnapshot: line.notesForCustomerSnapshot ?? "",
          categoryNameSnapshot: line.categoryNameSnapshot ?? "", actionNameSnapshot: line.actionNameSnapshot ?? "",
          targetPartNameSnapshot: line.targetPartNameSnapshot ?? "", detailLabelSnapshot: line.detailLabelSnapshot ?? "",
        })) })) } : { title: "", notes: "", isActive: false, choices: [] };
      setDraft(nextDraft); setSavedDraft(JSON.stringify(nextDraft));
      setContactText(typeof data.contactText === "string" ? data.contactText : null);
      setEditable(data.editable); setMode(data.pricingTaxMode); setCommonLines(data.commonLines ?? []); setLoaded(true);
    }).catch((cause) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [repairId]);
  const changeChoice = (index: number, update: (choice: Choice) => Choice) => setDraft((current) => ({ ...current, choices: current.choices.map((choice, at) => at === index ? update(choice) : choice) }));
  const changeLine = (choiceIndex: number, lineIndex: number, patch: Partial<Line>) => changeChoice(choiceIndex, (choice) => ({
    ...choice, lines: choice.lines.map((line, at) => at === lineIndex ? { ...line, ...patch } : line),
  }));
  const commonTotal = commonLines.reduce((sum, line) => sum + lineAmount(line), 0);
  const planCount = draft.choices.filter((choice) => choice.kind === "PLAN").length;
  const validation = draft.choices.length > 30 ? "選択肢は30件までです。"
    : draft.isActive && (draft.choices.length === 0 || planCount === 1) ? "有効な選択肢には2案以上のプラン、または1件以上の追加作業が必要です。"
    : draft.choices.some((choice) => !choice.name.trim()) ? "各選択肢の名前を入力してください。"
    : draft.choices.some((choice) => choice.lines.length === 0 || choice.lines.length > 50 || choice.lines.some((line) => !line.itemNameSnapshot.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000 || !Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0)) ? "明細名、数量（1～10000）、単価（0円以上）を確認してください。"
    : draft.choices.filter((choice) => choice.kind === "PLAN" && choice.recommended).length > 1 ? "推奨プランは1つだけ指定できます。" : "";
  const save = async () => {
    if (validation || !editable || saving) return;
    setSaving(true); setError(""); setCopyMessage("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/estimate-options`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setCommonLines(data.commonLines ?? []); setEditable(data.editable);
      setContactText(typeof data.contactText === "string" ? data.contactText : null);
      setSavedDraft(JSON.stringify(draft)); setCopyMessage("選択肢を保存しました。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存に失敗しました。"); }
    finally { setSaving(false); }
  };
  const refreshContactText = async () => {
    try {
      const response = await fetch(`/api/repairs/${repairId}/estimate-options`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "再読込に失敗しました。");
      setContactText(typeof data.contactText === "string" ? data.contactText : null);
      setCopyMessage("保存済みの連絡文を再読込しました。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "再読込に失敗しました。"); }
  };
  const visibleContactText = displayEstimateOptionContactNote(contactText);
  const copyContactText = async () => {
    if (!visibleContactText || hasUnsavedDraft || saving) return;
    try { await navigator.clipboard.writeText(visibleContactText); setCopyMessage("保存済みの連絡文全体をコピーしました。"); }
    catch { setCopyMessage("コピーできませんでした。"); }
  };
  const inputClass = "w-full min-w-0 rounded border border-zinc-300 bg-white px-2 py-2 text-sm";
  return <section className="m-3 space-y-4 rounded border bg-white p-4" aria-label="見積選択肢">
    <div><h2 className="text-lg font-bold">見積の選択肢</h2><p className="text-sm text-zinc-600">共通作業は全プランに含まれます。変更はメインの修理見積で行い、各プランへ再入力しないでください。</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loaded && <>
      <div className="rounded-lg border bg-zinc-50 p-4">
        <h3 className="font-semibold">共通作業（全プランに含む）</h3>
        {commonLines.length ? <ul className="mt-2 divide-y text-sm">{commonLines.map((line, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-2"><span>{line.itemName} × {line.quantity}</span><span>{yen(lineAmount(line))}</span></li>)}</ul>
          : <p className="mt-2 text-sm text-zinc-600">共通明細はまだありません。メインの修理見積で追加できます。</p>}
        <p className="mt-2 text-right font-semibold">共通合計 {yen(commonTotal)}（{mode === "INCLUSIVE" ? "税込入力額" : "税抜入力額"}）</p>
      </div>
      <fieldset disabled={!editable || saving} className="space-y-4 disabled:opacity-70">
        {!editable && <p className="text-sm text-amber-800">承認済みまたは見積書発行済みのため編集できません。</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">状態: {draft.isActive ? "有効" : "無効"} · プラン {planCount}案</p>
          {draft.choices.length === 0 && <button type="button" className="rounded bg-blue-700 px-4 py-3 font-semibold text-white" onClick={() => setDraft((current) => ({ ...current, isActive: true, choices: [newChoice("PLAN", "A案"), newChoice("PLAN", "B案")] }))}>2案を作成</button>}
        </div>
        <details className="rounded border p-3">
          <summary className="cursor-pointer font-medium">全体設定（タイトル・条件・有効化）</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">見積案タイトル<input className={inputClass} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label className="text-sm">全体条件<input className={inputClass} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />選択肢を有効化</label>
          </div>
        </details>
        {draft.choices.map((choice, index) => {
          const isPlan = choice.kind === "PLAN";
          const amount = choice.lines.reduce((sum, line) => sum + lineAmount(line), 0);
          const validAmounts = choice.lines.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitPrice) && line.unitPrice >= 0 && Number.isSafeInteger(lineAmount(line)) && lineAmount(line) <= 2147483647);
          let total: number | null = null;
          if (validAmounts) {
            try { total = isPlan ? selectedOptionTotal(commonLines, choice, [], mode).grossAmount : selectedOptionTotal([], null, [choice], mode).grossAmount; }
            catch { total = null; } // Keep the editor visible while an oversized draft amount is corrected.
          }
          return <article key={index} className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-48 flex-1"><label htmlFor={`${formId}-choice-${index}`} className="text-sm font-semibold">{isPlan ? `プラン ${index + 1}：修理方法 / FIT可否など` : "追加作業名"}</label>
                <input id={`${formId}-choice-${index}`} className={inputClass} value={choice.name} placeholder={isPlan ? "例：A案・FIT可能" : "追加作業"} onChange={(event) => changeChoice(index, (old) => ({ ...old, name: event.target.value }))} /></div>
              <button type="button" className="text-sm text-red-700 underline" onClick={() => setDraft((current) => ({ ...current, choices: current.choices.filter((_, at) => at !== index) }))}>この選択肢を削除</button>
            </div>
            <div className="mt-3 space-y-3">{choice.lines.map((line, lineIndex) => <div key={lineIndex} className="rounded border bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_auto]">
                <label className="text-xs">内容<input className={inputClass} value={line.itemNameSnapshot} placeholder="部品・作業名" onChange={(event) => changeLine(index, lineIndex, { itemNameSnapshot: event.target.value })} /></label>
                <label className="text-xs">数量<input className={inputClass} type="number" min="1" max="10000" value={line.quantity} onChange={(event) => changeLine(index, lineIndex, { quantity: Number(event.target.value) })} /></label>
                <label className="text-xs">単価（{mode === "INCLUSIVE" ? "税込" : "税抜"}）<input className={inputClass} type="number" min="0" value={line.unitPrice} onChange={(event) => changeLine(index, lineIndex, { unitPrice: Number(event.target.value) })} /></label>
                <div className="self-end text-right text-sm font-medium">{yen(lineAmount(line))}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <label>種別 <select className="rounded border bg-white p-1" value={line.lineType} onChange={(event) => {
                  const lineType = event.target.value as Line["lineType"];
                  changeLine(index, lineIndex, lineType === "PART"
                    ? { lineType, pricingRuleId: null, repairWorkCategoryId: null, repairWorkActionId: null, workTypeSnapshot: null }
                    : { lineType, partsMasterId: null });
                }}><option value="PART">部品</option><option value="LABOR">作業</option></select></label>
                <button type="button" className="text-red-700 underline" onClick={() => changeChoice(index, (old) => ({ ...old, lines: old.lines.filter((_, at) => at !== lineIndex) }))}>行を削除</button>
              </div>
              <details className="mt-2 text-sm"><summary className="cursor-pointer text-blue-800">この行の詳細設定</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {line.lineType === "LABOR" && <label>内装・外装区分<select className={inputClass} value={line.workTypeSnapshot ?? ""} onChange={(event) => changeLine(index, lineIndex, { workTypeSnapshot: (event.target.value || null) as Line["workTypeSnapshot"], repairWorkCategoryId: null })}><option value="">区分なし</option><option value="INTERNAL">内装</option><option value="EXTERNAL">外装</option></select></label>}
                  {(["displayNameSnapshot", "notesForCustomerSnapshot", "categoryNameSnapshot", "actionNameSnapshot", "targetPartNameSnapshot", "detailLabelSnapshot"] as const).map((field) =>
                    <label key={field}>{({ displayNameSnapshot: "表示名", notesForCustomerSnapshot: "明細条件", categoryNameSnapshot: "カテゴリ名", actionNameSnapshot: "処置名", targetPartNameSnapshot: "対象部品名", detailLabelSnapshot: "詳細" })[field]}<input className={inputClass} value={line[field]} onChange={(event) => changeLine(index, lineIndex, { [field]: event.target.value })} /></label>)}
                </div>
              </details>
            </div>)}</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><button type="button" className="text-blue-700 underline" onClick={() => changeChoice(index, (old) => ({ ...old, lines: [...old.lines, newLine()] }))}>明細を追加</button>
              <span>追加分 {yen(amount)}（{mode === "INCLUSIVE" ? "税込" : "税抜"}入力）</span></div>
            <p className="mt-2 text-right text-lg font-bold">{isPlan ? "共通＋この案" : "追加分のみ"}: {total === null ? "金額を確認してください" : yen(total)}（税込）</p>
            <details className="mt-3 border-t pt-2 text-sm"><summary className="cursor-pointer text-blue-800">条件・推奨などの詳細設定</summary>
              <div className="mt-2 flex flex-wrap gap-3"><label className="min-w-48 flex-1">条件・備考<input className={inputClass} value={choice.notes} onChange={(event) => changeChoice(index, (old) => ({ ...old, notes: event.target.value }))} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={choice.recommended} onChange={(event) => changeChoice(index, (old) => ({ ...old, recommended: event.target.checked }))} />推奨</label></div>
            </details>
          </article>;
        })}
        <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="text-blue-700 underline" onClick={() => setDraft((current) => ({ ...current, choices: [...current.choices, newChoice("PLAN")] }))}>プランを追加</button>
          <button type="button" className="text-blue-700 underline" onClick={() => setDraft((current) => ({ ...current, choices: [...current.choices, newChoice("ADD_ON")] }))}>任意の追加作業を追加</button></div>
      </fieldset>
      <div className="space-y-2 border-t pt-4">
        <p className="text-sm text-zinc-600">有効なプランは2案以上が必要です（追加作業のみの構成も可能）。保存した選択肢は見積PDFと共有ページで利用できます。ここで保存してもPDF発行・発注・LINE送信は行われません。</p>
        {validation && <p role="alert" className="text-sm text-red-700">{validation}</p>}
        <button type="button" className="rounded bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={!editable || saving || !!validation} onClick={save}>{saving ? "保存中…" : "選択肢を保存"}</button>
      </div>
      {contactText !== null && <details className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">取引先向け連絡文（保存済みメモ全体）</summary>
        <div className="mt-2 flex flex-wrap gap-3"><button type="button" className="text-blue-700 underline disabled:opacity-50" disabled={!visibleContactText || hasUnsavedDraft || saving} onClick={copyContactText}>全文をコピー</button>
          <button type="button" className="text-blue-700 underline" onClick={refreshContactText}>再読込</button></div>
        <p className="mt-1 text-xs text-zinc-600">自動送信されません。別の編集画面でメモを保存した後は再読込してください。{hasUnsavedDraft ? "編集中の選択肢を保存するまでコピーできません。" : ""}</p>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-sans">{visibleContactText || "保存済みの連絡文はありません。選択肢と共通見積を保存してください。"}</pre>
      </details>}
      {copyMessage && <p role="status" className="text-sm text-blue-800">{copyMessage}</p>}
    </>}
  </section>;
}
