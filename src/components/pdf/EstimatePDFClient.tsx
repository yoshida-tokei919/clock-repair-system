"use client";

import { EstimateDocument, EstimateDocumentProps } from "@/components/pdf/EstimateDocument";
import { usePDF } from "@react-pdf/renderer";
import { useEffect, useState } from "react";

export function EstimatePDFClient({ data }: EstimateDocumentProps) {
    const [instance, updateInstance] = usePDF({ document: <EstimateDocument data={data} /> });
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        updateInstance(<EstimateDocument data={data} />);
    }, [data, updateInstance]);

    if (!isClient) return <div className="p-10 text-center">Loading PDF Generator...</div>;

    if (instance.loading) return <div className="p-10 text-center">Generating PDF...</div>;
    if (instance.error) return <div className="p-10 text-center text-red-500">Error: {String(instance.error)}</div>;

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            <div className="bg-white px-6 py-3 shadow flex justify-between items-center shrink-0">
                <h1 className="font-bold text-lg">御見積書: {data.estimateNumber}</h1>
                <a
                    href={instance.url || "#"}
                    download={`estimate_${data.estimateNumber}.pdf`}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                >
                    PDFダウンロード
                </a>
            </div>
            {instance.url && (
                <iframe src={instance.url} className="flex-1 w-full border-0" />
            )}
        </div>
    );
}
