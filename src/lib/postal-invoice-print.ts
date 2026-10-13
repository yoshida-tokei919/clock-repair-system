export type PostalInvoiceTarget = { id: number; invoiceNumber: string; customerName: string };

export function isPostalInvoicePrintTarget(
  invoice: { status: string; customer: { type: string | null }; currentPdfFile: { status: string; storageKey: string } | null },
  delivery: { method: "LINE" | "POSTAL" } | null,
) {
  return ["issued", "paid"].includes(invoice.status)
    && invoice.customer.type === "business"
    && delivery?.method === "POSTAL"
    && invoice.currentPdfFile?.status === "current"
    && Boolean(invoice.currentPdfFile.storageKey);
}

export function orderedSelectedPostalIds(targets: PostalInvoiceTarget[], selectedIds: Iterable<number>) {
  const selected = new Set(selectedIds);
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const target of targets) {
    if (!selected.has(target.id) || seen.has(target.id)) continue;
    seen.add(target.id);
    ordered.push(target.id);
  }
  return ordered;
}

export type PostalPrintResult = { submittedIds: number[]; remainingIds: number[]; error: string | null };

export async function printPostalInvoiceBatch(
  ids: number[],
  operations: {
    isStillEligible: (id: number) => Promise<boolean>;
    fetchPdf: (id: number) => Promise<Blob>;
    submitPdf: (pdf: Blob) => Promise<void>;
  },
  onSubmitted?: (count: number) => void,
): Promise<PostalPrintResult> {
  const ordered = [...new Set(ids)];
  const submittedIds: number[] = [];
  for (const [index, id] of ordered.entries()) {
    try {
      if (!await operations.isStillEligible(id)) throw new Error("請求書の郵送対象またはPDFの状態が変わりました。画面を更新してください。");
      const pdf = await operations.fetchPdf(id);
      await operations.submitPdf(pdf);
      submittedIds.push(id);
      onSubmitted?.(submittedIds.length);
    } catch (error) {
      return { submittedIds, remainingIds: ordered.slice(index),
        error: error instanceof Error ? error.message : "印刷ジョブの投入結果を確認できません。プリンタのジョブを確認してください。" };
    }
  }
  return { submittedIds, remainingIds: [], error: null };
}

export async function fetchInvoicePdfForPrint(invoiceId: number, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/invoices/${invoiceId}/pdf`, { cache: "no-store" });
  if (!response.ok) throw new Error(`請求書PDFを取得できませんでした (${response.status})。`);
  if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") {
    throw new Error("請求書PDFの形式を確認できませんでした。");
  }
  return response.blob();
}

export async function submitInvoicePdfToFixedPrinter(pdf: Blob, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher("http://127.0.0.1:5750/print", {
      method: "POST", headers: { "Content-Type": "application/pdf" }, body: pdf,
    });
  } catch {
    throw new Error("ローカル印刷helperに接続できません。Windows PCでhelperの起動とプリンタのジョブを確認してください。");
  }
  if (!response.ok) throw new Error(`ローカル印刷helperがエラーを返しました (${response.status})。プリンタのジョブを確認してください。`);
  const result = await response.json().catch(() => null);
  if (result?.submitted !== true || result?.printer !== "NEC MultiWriter 5750C") {
    throw new Error("印刷ジョブ投入結果が不明です。プリンタのジョブを確認してから再操作してください。");
  }
}
