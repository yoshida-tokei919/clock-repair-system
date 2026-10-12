"use client";

import { DeliveryDocument, DeliveryDocumentProps } from "@/components/pdf/DeliveryDocument";
import { usePDF } from "@react-pdf/renderer";
import { useEffect, useState } from "react";

export function DeliveryPDFClient({ data, allowFixedPrint = false }: DeliveryDocumentProps & { allowFixedPrint?: boolean }) {
  const [instance, updateInstance] = usePDF({ document: <DeliveryDocument data={data} /> });
  const [isClient, setIsClient] = useState(false);
  const [printState, setPrintState] = useState<"idle" | "printing" | "submitted" | "error">("idle");
  const [printError, setPrintError] = useState("");

  useEffect(() => {
    setIsClient(true);
    updateInstance(<DeliveryDocument data={data} />);
  }, [data, updateInstance]);

  if (!isClient) return <div className="p-10 text-center">PDFエンジンを読み込み中...</div>;
  if (instance.loading) return <div className="p-10 text-center">PDFを生成中...</div>;
  if (instance.error) return <div className="p-10 text-center text-red-500">エラー: {String(instance.error)}</div>;

  async function printFixed() {
    if (!instance.blob || printState === "printing") return;
    setPrintState("printing");
    setPrintError("");
    try {
      const response = await fetch("http://127.0.0.1:5750/print", {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: instance.blob,
      });
      if (!response.ok) throw new Error(`印刷helperがエラーを返しました (${response.status})`);
      setPrintState("submitted");
    } catch (error) {
      setPrintError(error instanceof TypeError
        ? "ローカル印刷helperに接続できません。Windows PC上でhelperが起動しているか確認してください。"
        : error instanceof Error ? error.message : "印刷に失敗しました。");
      setPrintState("error");
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-white px-6 py-3 shadow flex justify-between items-center shrink-0">
        <h1 className="font-bold text-lg">納品書: {data.deliveryNumber}</h1>
        <div className="flex items-center gap-3">
          {allowFixedPrint && <button type="button" onClick={printFixed} disabled={!instance.blob || printState === "printing"}
            className="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800 disabled:opacity-50 text-sm">
            {printState === "printing" ? "印刷中..." : "NEC MultiWriter 5750C で印刷"}
          </button>}
          <a
            href={instance.url || "#"}
            download={`delivery_${data.deliveryNumber}.pdf`}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          >
            PDFをダウンロード
          </a>
        </div>
      </div>
      {allowFixedPrint && printState === "submitted" && <p role="status" className="px-6 py-2 bg-green-50 text-green-800">印刷ジョブをNEC MultiWriter 5750Cへ投入しました。紙の出力はプリンタで確認してください。</p>}
      {allowFixedPrint && printState === "error" && <p role="alert" className="px-6 py-2 bg-red-50 text-red-700">{printError}</p>}
      {instance.url && <iframe src={instance.url} className="flex-1 w-full border-0" title="納品書PDF" />}
    </div>
  );
}
