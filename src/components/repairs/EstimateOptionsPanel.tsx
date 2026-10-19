"use client";

import { useEffect, useState } from "react";
import { displayEstimateOptionContactNote } from "@/lib/estimate-option-contact-text";

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

const newLine = (): Line => ({ lineType: "LABOR", itemNameSnapshot: "", displayNameSnapshot: "", notesForCustomerSnapshot: "", workTypeSnapshot: null,
  categoryNameSnapshot: "", actionNameSnapshot: "", targetPartNameSnapshot: "", detailLabelSnapshot: "", quantity: 1, unitPrice: 0,
  partsMasterId: null, pricingRuleId: null, repairWorkCategoryId: null, repairWorkActionId: null, targetPartNameId: null });
const newChoice = (kind: Choice["kind"]): Choice => ({ kind, name: "", notes: "", recommended: false, lines: [newLine()] });
const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;

export function EstimateOptionsPanel({ repairId }: { repairId: number }) {
  const [draft, setDraft] = useState<SetDraft>({ title: "", notes: "", isActive: false, choices: [] });
  const [editable, setEditable] = useState(false);
  const [mode, setMode] = useState<"EXCLUSIVE" | "INCLUSIVE">("EXCLUSIVE");
  const [commonAmount, setCommonAmount] = useState(0);
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
      setEditable(data.editable); setMode(data.pricingTaxMode); setCommonAmount(data.commonAmount); setLoaded(true);
    }).catch((cause) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [repairId]);
  const changeChoice = (index: number, update: (choice: Choice) => Choice) => setDraft((current) => ({ ...current, choices: current.choices.map((choice, at) => at === index ? update(choice) : choice) }));
  const changeLine = (choiceIndex: number, lineIndex: number, patch: Partial<Line>) => changeChoice(choiceIndex, (choice) => ({ ...choice,
    lines: choice.lines.map((line, at) => at === lineIndex ? { ...line, ...patch } : line) }));
  const common = commonAmount;
  const lineAmount = (choice: Choice) => choice.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const totalFor = (choice: Choice) => {
    const subtotal = common + lineAmount(choice);
    const tax = Math.floor(subtotal * 10 / (mode === "INCLUSIVE" ? 110 : 100));
    return mode === "INCLUSIVE" ? subtotal : subtotal + tax;
  };
  const save = async () => {
    setSaving(true); setError(""); setCopyMessage("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/estimate-options`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setCommonAmount(data.commonAmount); setEditable(data.editable);
      setContactText(typeof data.contactText === "string" ? data.contactText : null);
      setSavedDraft(JSON.stringify(draft)); setCopyMessage("");
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
  return <section className="m-3 rounded border bg-white p-4" aria-label="見積選択肢">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">見積選択肢（ドラフト）</h2><span className="text-xs text-zinc-600">共通明細 {yen(common)} ／ {mode === "INCLUSIVE" ? "税込" : "税抜"}入力</span></div>
    <p className="mt-1 text-xs text-zinc-600">選択肢は見積明細、発注、帳票には反映されません。承認は選択機能の提供まで保留されます。</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {loaded && contactText !== null && <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3"><strong>取引先向け連絡文（保存済みメモ全体）</strong>
        <button type="button" className="text-blue-700 underline disabled:opacity-50" disabled={!visibleContactText || hasUnsavedDraft || saving} onClick={copyContactText}>全文をコピー</button>
        <button type="button" className="text-blue-700 underline" onClick={refreshContactText}>再読込</button></div>
      <p className="mt-1 text-xs text-zinc-600">この欄は自動送信されません。別の編集画面でメモを保存した後は再読込してください。{hasUnsavedDraft ? "編集中の選択肢を保存するまでコピーできません。" : ""}</p>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-sans">{visibleContactText || "保存済みの連絡文はありません。選択肢と共通見積を保存してください。"}</pre>
      {copyMessage && <p role="status" className="mt-1 text-blue-800">{copyMessage}</p>}
    </div>}
    {!loaded ? null : <fieldset disabled={!editable || saving} className="mt-3 space-y-3 disabled:opacity-70">
      {!editable && <p className="text-sm text-amber-800">承認済みまたは見積書発行済みのため編集できません。</p>}
      <div className="flex flex-wrap gap-2"><input aria-label="見積案タイトル" placeholder="見積案タイトル" className="rounded border p-2 text-sm" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input aria-label="全体条件" placeholder="全体条件" className="min-w-64 flex-1 rounded border p-2 text-sm" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />代替案を有効化</label></div>
      {draft.choices.map((choice, index) => <div key={index} className="rounded border p-3">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{choice.kind === "PLAN" ? `プラン ${index + 1}` : "追加作業"}</strong>
          <input aria-label={`選択肢名 ${index + 1}`} placeholder="表示名" className="rounded border p-1 text-sm" value={choice.name} onChange={(event) => changeChoice(index, (old) => ({ ...old, name: event.target.value }))} />
          <input aria-label={`条件 ${index + 1}`} placeholder="条件・備考" className="min-w-48 flex-1 rounded border p-1 text-sm" value={choice.notes} onChange={(event) => changeChoice(index, (old) => ({ ...old, notes: event.target.value }))} />
          <label className="text-sm"><input type="checkbox" checked={choice.recommended} onChange={(event) => changeChoice(index, (old) => ({ ...old, recommended: event.target.checked }))} />推奨</label>
          <button type="button" className="text-sm text-red-700 underline" onClick={() => setDraft({ ...draft, choices: draft.choices.filter((_, at) => at !== index) })}>削除</button></div>
        {choice.lines.map((line, lineIndex) => <div key={lineIndex} className="mt-2 flex flex-wrap items-center gap-2 rounded bg-zinc-50 p-2 text-sm">
          <select aria-label="明細種別" className="rounded border p-1" value={line.lineType} onChange={(event) => changeLine(index, lineIndex, { lineType: event.target.value as Line["lineType"] })}><option value="LABOR">作業</option><option value="PART">部品</option></select>
          {line.lineType === "LABOR" && <select aria-label="内装外装区分" className="rounded border p-1" value={line.workTypeSnapshot ?? ""} onChange={(event) => changeLine(index, lineIndex, { workTypeSnapshot: event.target.value as Line["workTypeSnapshot"] || null })}><option value="">区分なし</option><option value="INTERNAL">内装</option><option value="EXTERNAL">外装</option></select>}
          <input aria-label="明細名" placeholder="明細名" className="min-w-40 rounded border p-1" value={line.itemNameSnapshot} onChange={(event) => changeLine(index, lineIndex, { itemNameSnapshot: event.target.value })} />
          <input aria-label="表示名" placeholder="表示名（任意）" className="min-w-36 rounded border p-1" value={line.displayNameSnapshot} onChange={(event) => changeLine(index, lineIndex, { displayNameSnapshot: event.target.value })} />
          <input aria-label="数量" type="number" min="1" className="w-16 rounded border p-1" value={line.quantity} onChange={(event) => changeLine(index, lineIndex, { quantity: Number(event.target.value) })} />
          <input aria-label="単価" type="number" min="0" className="w-24 rounded border p-1" value={line.unitPrice} onChange={(event) => changeLine(index, lineIndex, { unitPrice: Number(event.target.value) })} />
          <input aria-label="明細条件" placeholder="明細条件" className="min-w-36 rounded border p-1" value={line.notesForCustomerSnapshot} onChange={(event) => changeLine(index, lineIndex, { notesForCustomerSnapshot: event.target.value })} />
          <button type="button" className="text-red-700 underline" onClick={() => changeChoice(index, (old) => ({ ...old, lines: old.lines.filter((_, at) => at !== lineIndex) }))}>行削除</button></div>)}
        <div className="mt-2 flex items-center justify-between text-sm"><button type="button" className="text-blue-700 underline" onClick={() => changeChoice(index, (old) => ({ ...old, lines: [...old.lines, newLine()] }))}>明細を追加</button><span>{choice.kind === "PLAN" ? `共通＋この案: ${yen(totalFor(choice))}（税込）` : `追加分のみ: ${yen(lineAmount(choice))}（${mode === "INCLUSIVE" ? "税込" : "税抜"}入力）`}</span></div>
      </div>)}
      <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="text-blue-700 underline" onClick={() => setDraft({ ...draft, choices: [...draft.choices, newChoice("PLAN")] })}>プランを追加</button>
        <button type="button" className="text-blue-700 underline" onClick={() => setDraft({ ...draft, choices: [...draft.choices, newChoice("ADD_ON")] })}>任意の追加作業を追加</button>
        <button type="button" className="rounded bg-blue-700 px-3 py-1 text-white" onClick={save}>選択肢を保存</button></div>
    </fieldset>}
  </section>;
}
