"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { printPhysicalTagLabel } from "@/lib/bpac-physical-tag-print";
import { BatchPrintStopped, printBatchFrom, type BatchPrintItem } from "@/lib/b2b-batch-print-progress";

type IntakeResult = { partnerId: number; repairs: Array<{ id: number; inquiryNumber: string }> };

export function B2bBatchTagPrinting({ result, onReset }: { result: IntakeResult; onReset: () => void }) {
  const [labels, setLabels] = useState<BatchPrintItem[] | null>(null);
  const [completed, setCompleted] = useState<number[]>([]);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  async function withLock(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "管理タグの処理に失敗しました。"); }
    finally { locked.current = false; setBusy(false); }
  }

  async function printFrom(items: BatchPrintItem[], start: number) {
    try {
      await printBatchFrom(items, start, printPhysicalTagLabel, index => {
        setCompleted(current => current.includes(index) ? current : [...current, index]);
        setNextIndex(index + 1);
      });
      setNextIndex(items.length);
    } catch (cause) {
      if (cause instanceof BatchPrintStopped) {
        setFailedIndex(cause.failedIndex);
        setNextIndex(cause.failedIndex + 1);
        throw new Error(`${items[cause.failedIndex].label.inquiryNumber} / ${items[cause.failedIndex].shortCode} の印刷結果は不明です。${cause.message}`);
      }
      throw cause;
    }
  }

  function prepareAndPrint() {
    void withLock(async () => {
      const response = await fetch("/api/physical-tags/b2b-batch-prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repairIds: result.repairs.map(repair => repair.id) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "管理タグを準備できませんでした。再度実行できます。");
      const prepared = body.labels as BatchPrintItem[];
      if (!Array.isArray(prepared) || prepared.length !== result.repairs.length ||
          prepared.some((item, index) => item.repairId !== result.repairs[index].id ||
            item.label?.inquiryNumber !== result.repairs[index].inquiryNumber ||
            item.label?.customerType !== "business" || item.label?.shortCode !== item.shortCode ||
            !Number.isSafeInteger(item.physicalTagId) || item.physicalTagId < 1 ||
            !/^PT-\d{6,}$/.test(item.shortCode) || typeof item.label?.qrPayload !== "string" ||
            !item.label.qrPayload ||
            prepared.some((other, otherIndex) => otherIndex < index &&
              (other.shortCode === item.shortCode || other.label?.qrPayload === item.label.qrPayload)))) {
        throw new Error("管理タグと受付結果の対応を確認できません。印刷は開始していません。");
      }
      setLabels(prepared);
      setCompleted([]);
      setFailedIndex(null);
      setNextIndex(0);
      await printFrom(prepared, 0);
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
        setFailedIndex(null);
      } catch (cause) {
        throw new Error(`${labels[index].label.inquiryNumber} / ${labels[index].shortCode} の再印刷結果は不明です。${cause instanceof Error ? cause.message : ""}`);
      }
    });
  }

  function confirmFailedOnPaper() {
    if (failedIndex === null || locked.current) return;
    setCompleted(current => current.includes(failedIndex) ? current : [...current, failedIndex]);
    setFailedIndex(null);
    setError("");
  }

  return <div className="mt-5 rounded-md border border-green-300 bg-white p-4 text-sm">
    <h3 className="font-semibold">管理タグと修理袋ラベル</h3>
    <p className="mt-1">既存の有効なPhysicalTagは再利用し、未割当の案件にだけ発行します。Brother QL-800へ1枚ずつ印刷します。</p>
    {labels && <>
      <p role="status" className="mt-2">印刷完了を確認: {completed.length}/{labels.length}枚。既存タグ再利用: {labels.filter(item => item.reused).length}件。</p>
      <ol className="mt-2 space-y-1">{labels.map((item, index) => <li key={item.repairId}>
        {index + 1}. {item.label.inquiryNumber} / {item.shortCode} — {completed.includes(index) ? "印刷完了" : failedIndex === index ? "印刷結果不明" : index >= nextIndex ? "未試行" : "要確認"}
      </li>)}</ol>
    </>}
    {busy && <p role="status" className="mt-2">{labels ? "印刷中..." : "管理タグ準備中..."}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {failedIndex !== null && labels && <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
      <p>{labels[failedIndex].label.inquiryNumber} / {labels[failedIndex].shortCode} は出力済みの可能性があります。現物を確認してから再印刷を判断してください。</p>
      <Link href={`/repairs/${labels[failedIndex].repairId}`} className="text-blue-700 underline">該当案件を開く（手動再印刷）</Link>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={reprintFailed}>この1枚を明示的に再印刷</button>
        <button type="button" disabled={busy} className="rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={confirmFailedOnPaper}>現物で印刷済みを確認</button>
      </div>
    </div>}
    {labels && failedIndex === null && nextIndex < labels.length && <button type="button" disabled={busy} className="mt-3 rounded border bg-white px-3 py-2 disabled:opacity-40" onClick={continueUnattempted}>未試行の残り{labels.length - nextIndex}枚を印刷</button>}
    {(!labels || (completed.length === labels.length && failedIndex === null)) && <button type="button" disabled={busy} className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-40" onClick={prepareAndPrint}>
      {labels ? `${labels.length}枚を再印刷` : `${result.repairs.length}本の管理タグを準備して印刷`}
    </button>}
    <button type="button" className="mt-4 block rounded-md border bg-white px-4 py-2 disabled:opacity-40" disabled={busy} onClick={onReset}>別のバッチを受付</button>
  </div>;
}
