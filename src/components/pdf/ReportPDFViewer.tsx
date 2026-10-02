"use client";

import { PDFViewer } from "@react-pdf/renderer";
import type { ComponentProps } from "react";

export function ReportPDFViewer(props: ComponentProps<typeof PDFViewer>) {
  return <PDFViewer {...props} />;
}
