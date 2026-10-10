export type PdfPrint = (path: string, options: { printer: string }) => Promise<void>;

export function resolvePdfPrint(module: unknown): PdfPrint {
  if (module && typeof module === "object") {
    const direct = (module as { print?: unknown }).print;
    if (typeof direct === "function") return direct as PdfPrint;
    const fallback = (module as { default?: { print?: unknown } }).default?.print;
    if (typeof fallback === "function") return fallback as PdfPrint;
  }
  throw new Error("pdf-to-printer print export unavailable");
}
