"use client";

import { EstimateDocument, EstimateDocumentProps } from "@/components/pdf/EstimateDocument";
import { usePDF } from "@react-pdf/renderer";
import { FormEvent, useEffect, useState } from "react";

type EstimatePDFClientProps = EstimateDocumentProps & {
  documentId?: number;
  customerType?: string;
  repairOptions?: { id: number; label: string }[];
};

export function EstimatePDFClient({ data, documentId, customerType, repairOptions = [] }: EstimatePDFClientProps) {
  const [instance, updateInstance] = usePDF({ document: <EstimateDocument data={data} /> });
  const [isClient, setIsClient] = useState(false);
  const [isSendingLine, setIsSendingLine] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [selectedRepairId, setSelectedRepairId] = useState<number | null>(repairOptions[0]?.id ?? null);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [commentSent, setCommentSent] = useState(false);

  useEffect(() => {
    setIsClient(true);
    updateInstance(<EstimateDocument data={data} />);
  }, [data, updateInstance]);

  const handleLineSend = async () => {
    if (!documentId) return;
    setIsSendingLine(true);
    try {
      const res = await fetch(`/api/documents/estimate/${documentId}/line`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        alert(result.error || "LINE送信に失敗しました。");
        return;
      }
      alert("LINEで見積書URLを送信しました。");
    } catch (error) {
      console.error(error);
      alert("LINE送信に失敗しました。");
    } finally {
      setIsSendingLine(false);
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRepairId || !commentBody.trim()) return;

    setIsSendingComment(true);
    setCommentSent(false);
    try {
      const res = await fetch(`/api/customer/repairs/${selectedRepairId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        alert(result.error || "コメントの送信に失敗しました。");
        return;
      }
      setCommentBody("");
      setCommentSent(true);
    } catch (error) {
      console.error(error);
      alert("コメントの送信に失敗しました。");
    } finally {
      setIsSendingComment(false);
    }
  };

  if (!isClient) return <div className="p-10 text-center">PDFエンジンを読み込み中...</div>;
  if (instance.loading) return <div className="p-10 text-center">PDFを生成中...</div>;
  if (instance.error) return <div className="p-10 text-center text-red-500">エラー: {String(instance.error)}</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-white px-6 py-3 shadow flex justify-between items-center shrink-0">
        <h1 className="font-bold text-lg">見積書: {data.estimateNumber}</h1>
        <div className="flex items-center gap-2">
          {documentId && (
            <button
              type="button"
              onClick={handleLineSend}
              disabled={isSendingLine}
              className="bg-[#06c755] text-white px-4 py-2 rounded hover:bg-[#05b34c] disabled:bg-gray-400 text-sm"
            >
              {isSendingLine ? "送信中..." : "LINE送信"}
            </button>
          )}
          <a
            href={instance.url || "#"}
            download={`estimate_${data.estimateNumber}.pdf`}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          >
            PDFをダウンロード
          </a>
        </div>
      </div>
      {repairOptions.length > 0 && (
        <form onSubmit={handleCommentSubmit} className="bg-white border-b px-6 py-3 shrink-0 space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            {repairOptions.length > 1 && (
              <label className="text-xs font-medium text-slate-600">
                対象案件
                <select
                  value={selectedRepairId ?? ""}
                  onChange={(event) => setSelectedRepairId(Number(event.target.value))}
                  className="mt-1 h-9 rounded border border-slate-300 px-2 text-sm"
                >
                  {repairOptions.map((repair) => (
                    <option key={repair.id} value={repair.id}>
                      {repair.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex-1 text-xs font-medium text-slate-600">
              {customerType === "business" ? "備考・連絡事項" : "ご質問・追加のご希望があればご記入ください"}
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={isSendingComment || !commentBody.trim() || !selectedRepairId}
              className="h-9 rounded bg-slate-900 px-4 text-sm text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              {isSendingComment ? "送信中..." : "送信"}
            </button>
          </div>
          {commentSent && <p className="text-xs text-blue-600">コメントを送信しました。</p>}
        </form>
      )}
      {instance.url && <iframe src={instance.url} className="flex-1 w-full border-0" title="見積書PDF" />}
    </div>
  );
}
