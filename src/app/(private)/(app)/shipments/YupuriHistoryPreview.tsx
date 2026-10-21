"use client";

import { useState, type FormEvent } from "react";
import type { HistoryRow } from "@/lib/yupuri-history";

export default function YupuriHistoryPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setRows(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/shipments/yupuri-history/preview", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `プレビューに失敗しました (${response.status})。`);
      if (!Array.isArray(result.rows)) throw new Error("プレビューの応答が不正です。");
      setRows(result.rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "プレビューに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return <section className="space-y-3 rounded-lg border bg-white p-5" aria-label="ゆうプリR発送履歴プレビュー">
    <h2 className="text-xl font-semibold">ゆうプリR 発送履歴CSV</h2>
    <p className="text-sm font-medium text-amber-800">読み取り専用プレビューです。候補はShipmentの更新可否や更新承認を意味しません。日時2列はCSVの生値です。</p>
    <form onSubmit={preview} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">CSVファイル（1件）
        <input type="file" accept=".csv,text/csv" disabled={loading} onChange={event => {
          setFile(event.target.files?.[0] ?? null); setRows(null); setError("");
        }} className="mt-1 block text-sm" />
      </label>
      <button type="submit" disabled={!file || loading} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">
        {loading ? "照合中…" : "プレビュー"}
      </button>
    </form>
    {loading && <p role="status" className="text-sm">CSVとShipmentを照合しています…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {rows && <>
      <p className="text-sm">{rows.length}行の結果。現在値はCSV照合時にAPIが読み取ったShipmentです。</p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-2">CSV行</th><th className="p-2">Shipment</th>
            <th className="p-2">追跡番号 現在 / 候補 / 比較</th>
            <th className="p-2">日本郵便 公式状態</th>
            <th className="p-2">Shipment状態 現在 / 候補 / 比較</th>
            <th className="p-2">仮引受確定作業年月日（生値）</th>
            <th className="p-2">配送完了作業年月日（生値）</th>
            <th className="p-2">警告</th><th className="p-2">エラー・ブロッカー</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.rowNumber} className="border-t align-top">
            <td className="p-2">{row.rowNumber}</td>
            <td className="p-2">{row.currentShipment ? `#${row.currentShipment.id} (${row.currentShipment.direction})` :
              row.resolvedShipmentId === null ? "未解決" : `#${row.resolvedShipmentId}（未発見）`}</td>
            <td className="p-2 break-all">{row.currentShipment?.trackingNumber ?? "未設定"}<br />→ {row.trackingNumberCandidate || "空欄"}<br />
              {row.trackingChange === "NO_CHANGE" ? "変更なし" : row.trackingChange === "CANDIDATE" ? "設定候補" :
                row.trackingChange === "CONFLICT" ? "競合" : "比較不可"}</td>
            <td className="p-2">{row.confirmedDescriptionOrNull ?? "説明なし"}<br />
              <span className="text-gray-600">{row.aggregateStatusCode}/{row.detailStatusCode}</span></td>
            <td className="p-2">{row.currentShipment?.status ?? "未解決"}<br />→ {row.statusCandidate ?? "候補なし"}<br />
              {row.statusChange === "NO_CHANGE" ? "変更なし" : row.statusChange === "CANDIDATE" ? "比較候補（更新可否未判定）" : "比較不可"}
              {row.currentShipment && <span className="mt-1 block text-xs text-gray-600">
                現在の実発送: {row.currentShipment.actualShippedAt ?? "未設定"}<br />
                現在の配達完了: {row.currentShipment.deliveredAt ?? "未設定"}
              </span>}</td>
            <td className="p-2 break-all">{row.acceptanceRelatedValue || "空欄"}</td>
            <td className="p-2 break-all">{row.deliveryCompletionCandidate || "空欄"}</td>
            <td className="p-2 text-amber-800">{row.warnings.length ? row.warnings.join(" / ") : "なし"}</td>
            <td className="p-2 text-red-700">{row.errors.length ? row.errors.join(" / ") : "なし"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
