"use client";

import dynamic from "next/dynamic";
import type { DeliveryDocumentProps } from "@/components/pdf/DeliveryDocument";

const DeliveryPDFClient = dynamic(
  () => import("@/components/pdf/DeliveryPDFClient").then((mod) => mod.DeliveryPDFClient),
  {
    ssr: false,
    loading: () => <div className="p-10 text-center">PDFを読み込み中...</div>,
  }
);

export function DeliveryPDFClientLoader(props: DeliveryDocumentProps) {
  return <DeliveryPDFClient {...props} />;
}
