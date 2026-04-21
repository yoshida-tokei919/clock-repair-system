"use client";

import { InvoiceDocument, InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { usePDF } from "@react-pdf/renderer";
import { useEffect, useState } from "react";

export function InvoicePDFClient({ data }: InvoiceDocumentProps) {
  const [instance, updateInstance] = usePDF({ document: <InvoiceDocument data={data} /> });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    updateInstance(<InvoiceDocument data={data} />);
  }, [data, updateInstance]);

  if (!isClient) return <div className="p-10 text-center">PDFエンジンを読み込み中...</div>;
  if (instance.loading) return <div className="p-10 text-center">PDFを生成中...</div>;
  if (instance.error) return <div className="p-10 text-center text-red-500">エラー: {String(instance.error)}</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-white px-6 py-3 shadow flex justify-between items-center shrink-0">
        <h1 className="font-bold text-lg">請求書: {data.invoiceNumber}</h1>
        <a
          href={instance.url || "#"}
          download={`invoice_${data.invoiceNumber}.pdf`}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
        >
          PDFをダウンロード
        </a>
      </div>
      {instance.url && <iframe src={instance.url} className="flex-1 w-full border-0" title="請求書PDF" />}
    </div>
  );
}
