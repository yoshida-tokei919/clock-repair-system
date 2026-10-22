"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { printPhysicalTagLabel } from "@/lib/bpac-physical-tag-print";
import { BatchPrintStopped, printBatchFrom, validatePreparedBatchLabels, type BatchPrintItem } from "@/lib/b2b-batch-print-progress";
import { PhysicalTagNfcBinding } from "@/components/repairs/PhysicalTagNfcBinding";

type IntakeResult = { partnerId: number; repairs: Array<{ id: number; inquiryNumber: string }> };

export function B2bBatchTagPrinting({ result, onReset }: { result: IntakeResult; onReset: () => void }) {
  const [labels, setLabels] = useState<BatchPrintItem[] | null>(null);
  const [individual, setIndividual] = useState<Record<number, BatchPrintItem>>({});
  const [printed, setPrinted] = useState<number[]>([]);
  const [uncertainPrints, setUncertainPrints] = useState<number[]>([]);
  const [relabelRequired, setRelabelRequired] = useState<number[]>([]);
  const [bindingActive, setBindingActive] = useState(false);
  const [preparedMessage, setPreparedMessage] = useState("");
  const [completed, setCompleted] = useState<number[]>([]);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  async function prepare(requested: IntakeResult["repairs"], previous: Readonly<Record<number, BatchPrintItem>> = individual,
    expected?: { physicalTagId: number; shortCode: string; nfcUid: string }): Promise<BatchPrintItem[]> {
    const response = await fetch("/api/physical-tags/b2b-batch-prepare", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repairIds: requested.map(repair => repair.id) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "管理タグを準備できませんでした。案件画面で確認してください。");
    const items = validatePreparedBatchLabels(body.labels, requested, previous);
    if (expected && (items[0].physicalTagId !== expected.physicalTagId ||
        items[0].shortCode !== expected.shortCode || items[0].nfcUid !== expected.nfcUid))
      throw new Error("再割当後の管理タグを確認できません。案件画面で確認してください。");
    setIndividual(current => ({ ...current, ...Object.fromEntries(items.map(item => [item.repairId, item])) }));
    return items;
  }

  function prepareOne(repair: IntakeResult["repairs"][number]) {
    void withLock(async () => {
      const [item] = await prepare([repair]);
      setPreparedMessage(`${repair.inquiryNumber} / ${item.shortCode} を準備しました。NFC登録または印刷へ進めます。`);
    });
  }

  function printOne(repair: IntakeResult["repairs"][number], reprint: boolean) {
    const item = individual[repair.id];
    if (!item || (uncertainPrints.includes(repair.id) && !reprint) || (printed.includes(repair.id) && !reprint)) return;
    void withLock(async () => {
      try {
        await printPhysicalTagLabel(item.label);
        setPrinted(current => current.includes(repair.id) ? current : [...current, repair.id]);
        setRelabelRequired(current => current.filter(id => id !== repair.id));
        setUncertainPrints(current => current.filter(id => id !== repair.id));
        setPreparedMessage(`${repair.inquiryNumber} / ${item.shortCode} の印刷が完了しました。`);
      } catch (cause) {
        setUncertainPrints(current => current.includes(repair.id) ? current : [...current, repair.id]);
        throw new Error(`${repair.inquiryNumber} / ${item.shortCode} の印刷結果は不明です。現物を確認してください。${cause instanceof Error ? cause.message : ""}`);
      }
    });
  }

  async function withLock(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setPreparedMessage("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "管理タグの処理に失敗しました。"); }
    finally { locked.current = false; setBusy(false); }
  }

  async function printFrom(items: BatchPrintItem[], start: number) {
    try {
      await printBatchFrom(items, start, printPhysicalTagLabel, index => {
        setCompleted(current => current.includes(index) ? current : [...current, index]);
        setPrinted(current => current.includes(items[index].repairId) ? current : [...current, items[index].repairId]);
        setRelabelRequired(current => current.filter(id => id !== items[index].repairId));
        setNextIndex(index + 1);
      });
      setNextIndex(items.length);
    } catch (cause) {
      if (cause instanceof BatchPrintStopped) {
        setFailedIndex(cause.failedIndex);
        setUncertainPrints(current => current.includes(items[cause.failedIndex].repairId) ? current : [...current, items[cause.failedIndex].repairId]);
        setNextIndex(cause.failedIndex + 1);
        throw new Error(`${items[cause.failedIndex].label.inquiryNumber} / ${items[cause.failedIndex].shortCode} の印刷結果は不明です。${cause.message}`);
      }
      throw cause;
    }
  }

  function prepareAndPrint() {
    void withLock(async () => {
      const prepared = await prepare(result.repairs);
      const queue = prepared.filter(item => !printed.includes(item.repairId) && !uncertainPrints.includes(item.repairId));
      if (uncertainPrints.length) throw new Error("印刷結果不明の案件があります。現物確認後に該当案件から操作してください。");
      if (!queue.length) { setPreparedMessage("全件の印刷が完了しています。再印刷は案件ごとのボタンから行ってください。"); return; }
      setLabels(queue);
      setCompleted([]);
      setFailedIndex(null);
      setNextIndex(0);
      await printFrom(queue, 0);
    });
  }

  function handleReused(repair: IntakeResult["repairs"][number], tag: { physicalTagId: number; shortCode: string; nfcUid: string }) {
    // The old label may already exist on paper. Clear every cached copy before fetching its replacement.
    const previous = { ...individual };
    delete previous[repair.id];
    setIndividual(current => { const next = { ...current }; delete next[repair.id]; return next; });
    setLabels(null); setCompleted([]); setFailedIndex(null); setNextIndex(0);
    setPrinted(current => current.filter(id => id !== repair.id));
    setUncertainPrints(current => current.filter(id => id !== repair.id));
    setRelabelRequired(current => current.includes(repair.id) ? current : [...current, repair.id]);
    void withLock(async () => {
      await prepare([repair], previous, tag);
      setPreparedMessage(`${repair.inquiryNumber} は ${tag.shortCode} に再割当しました。旧QRラベルを破棄し、新しいQRラベルを印刷してください。`);
    });
  }

  function continueUnattempted() {
    if (!labels || nextIndex >= labels.length) return;
    void withLock(() => printFrom(labels, nextIndex));
  }

  function reprintFailed() {
    if (!labels || failedIndex === null) return;
    void withLock(async () => {
      const index = failedIndex;
      try {
        await printPhysicalTagLabel(labels[index].label);
        setCompleted(current => current.includes(index) ? current : [...current, index]);
        setPrinted(current => current.includes(labels[index].repairId) ? current : [...current, labels[index].repairId]);
        setRelabelRequired(current => current.filter(id => id !== labels[index].repairId));
        setUncertainPrints(current => current.filter(id => id !== labels[index].repairId));
        setFailedIndex(null);
      } catch (cause) {
        throw new Error(`${labels[index].label.inquiryNumber} / ${labels[index].shortCode} の再印刷結果は不明です。${cause instanceof Error ? cause.message : ""}`);
      }
    });
  }

  function confirmFailedOnPaper() {
    if (failedIndex === null || locked.current) return;
    setCompleted(current => current.includes(failedIndex) ? current : [...current, failedIndex]);
    setPrinted(current => current.includes(labels![failedIndex].repairId) ? current : [...current, labels![failedIndex].repairId]);
    setUncertainPrints(current => current.filter(id => id !== labels![failedIndex].repairId));
    setFailedIndex(null);
    setError("");
  }

  return <div className="mt-5 rounded-md border border-green-300 bg-white p-4 text-sm">
    <h3 className="font-semibold">管理タグと修理袋ラベル</h3>
    <p className="mt-1">既存の有効なPhysicalTagは再利用し、未割当の案件にだけ発行します。Brother QL-800へ1枚ずつ印刷します。</p>
    <p className="mt-1">案件を選んでタグだけ準備し、NFC UIDを確認して登録した後にラベルを印刷できます。印刷済みの案件は一括印刷から除外します。</p>
    <ul className="mt-3 space-y-3">{result.repairs.map(repair => {
      const item = individual[repair.id];
      const ambiguous = uncertainPrints.includes(repair.id);
      const batchPending = !!labels && (failedIndex !== null || nextIndex < labels.length);
      return <li key={repair.id} className="rounded border p-3">
        <p className="font-medium">{repair.inquiryNumber}（Repair ID: {repair.id}）{item ? ` / ${item.shortCode}` : ""}</p>
        <p role="status" className="mt-1">{relabelRequired.includes(repair.id) ?
          ambiguous ? "旧QRラベルは無効・新QRラベルの印刷結果不明。現物確認か明示的な再印刷が必要" :
            "旧QRラベルは無効・新しいQRラベルの印刷が必要" :
          ambiguous ? "印刷結果不明・現物確認が必要" : printed.includes(repair.id) ? "印刷完了" : item ? "タグ準備済み・ラベル未印刷" : "タグ未準備"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!item && <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={busy || batchPending || bindingActive} onClick={() => prepareOne(repair)}>この案件のタグを準備</button>}
          {item && !ambiguous && <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={busy || batchPending || bindingActive} onClick={() => printOne(repair, printed.includes(repair.id))}>
            {printed.includes(repair.id) ? "この案件を明示的に再印刷" : "この案件のQRラベルを印刷"}
          </button>}
          {item && ambiguous && failedIndex === null && !relabelRequired.includes(repair.id) && <>
            <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={busy || batchPending || bindingActive} onClick={() => { setUncertainPrints(current => current.filter(id => id !== repair.id)); setPrinted(current => current.includes(repair.id) ? current : [...current, repair.id]); setError(""); }}>現物で印刷済みを確認</button>
            <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={busy || batchPending || bindingActive} onClick={() => printOne(repair, true)}>この1枚を明示的に再印刷</button>
          </>}
          {item && ambiguous && relabelRequired.includes(repair.id) && failedIndex === null &&
            <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={busy || batchPending || bindingActive} onClick={() => printOne(repair, true)}>新しいQRラベルを明示的に再印刷</button>}
        </div>
        {item && <div className="mt-2"><PhysicalTagNfcBinding physicalTagId={item.physicalTagId} repairId={item.repairId}
          shortCode={item.shortCode} inquiryNumber={item.label.inquiryNumber} initialNfcUid={item.nfcUid}
          onBound={uid => setIndividual(current => ({ ...current, [repair.id]: { ...current[repair.id], nfcUid: uid } }))}
          onReused={tag => handleReused(repair, tag)} disabled={busy || batchPending || bindingActive}
          onActivityChange={setBindingActive} /></div>}
      </li>;
    })}</ul>
    {labels && <>
      <p role="status" className="mt-2">印刷完了を確認: {completed.length}/{labels.length}枚。既存タグ再利用: {labels.filter(item => item.reused).length}件。</p>
      <ol className="mt-2 space-y-1">{labels.map((item, index) => <li key={item.repairId}>
        {index + 1}. {item.label.inquiryNumber} / {item.shortCode} — {completed.includes(index) ? "印刷完了" : failedIndex === index ? "印刷結果不明" : index >= nextIndex ? "未試行" : "要確認"}
      </li>)}</ol>
    </>}
    {busy && <p role="status" className="mt-2">{labels ? "印刷中..." : "管理タグ準備中..."}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {preparedMessage && <p role="status" className="mt-2 text-green-800">{preparedMessage}</p>}
    {failedIndex !== null && labels && <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
      <p>{labels[failedIndex].label.inquiryNumber} / {labels[failedIndex].shortCode} は出力済みの可能性があります。現物を確認してから再印刷を判断してください。</p>
      <Link href={`/repairs/${labels[failedIndex].repairId}`} className="text-blue-700 underline">該当案件を開く（手動再印刷）</Link>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy || bindingActive} className="rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={reprintFailed}>この1枚を明示的に再印刷</button>
        <button type="button" disabled={busy || bindingActive} className="rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={confirmFailedOnPaper}>現物で印刷済みを確認</button>
      </div>
    </div>}
    {labels && failedIndex === null && nextIndex < labels.length && <button type="button" disabled={busy || bindingActive} className="mt-3 rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={continueUnattempted}>未試行の残り{labels.length - nextIndex}枚を印刷</button>}
    {(!labels || (completed.length === labels.length && failedIndex === null)) && <button type="button" disabled={busy || bindingActive || uncertainPrints.length > 0 || printed.length === result.repairs.length} className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-40" onClick={prepareAndPrint}>
      {`${result.repairs.length - printed.length}本の未印刷タグを準備して一括印刷`}
    </button>}
    <button type="button" className="mt-4 block rounded-md border bg-white px-4 py-2 disabled:opacity-40" disabled={busy || bindingActive} onClick={onReset}>別のバッチを受付</button>
  </div>;
}
