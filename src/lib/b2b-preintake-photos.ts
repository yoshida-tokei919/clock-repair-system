export type UploadStatus = "pending" | "uploading" | "success" | "failed" | "unknown";

export function mapBatchRepairs(rowKeys: number[], value: unknown) {
  if (!Array.isArray(value) || value.length !== rowKeys.length || new Set(rowKeys).size !== rowKeys.length) return null;
  const ids = new Set<number>();
  const numbers = new Set<string>();
  const mapped = value.map((item, index) => {
    if (!item || typeof item !== "object") return null;
    const { id, inquiryNumber } = item as { id?: unknown; inquiryNumber?: unknown };
    if (!Number.isSafeInteger(id) || (id as number) <= 0 || typeof inquiryNumber !== "string" || !inquiryNumber.trim()) return null;
    ids.add(id as number);
    numbers.add(inquiryNumber);
    return { rowKey: rowKeys[index], id: id as number, inquiryNumber };
  });
  return ids.size === rowKeys.length && numbers.size === rowKeys.length && mapped.every(Boolean)
    ? mapped as Array<{ rowKey: number; id: number; inquiryNumber: string }> : null;
}

// The upload route rejects 4xx requests before writing. A 5xx, lost response, or
// malformed success may have saved the photo, so it must not be retried automatically.
export function uploadOutcome(httpStatus: number, body: unknown, repairId: number): "success" | "failed" | "unknown" {
  if (httpStatus >= 200 && httpStatus < 300 && body && typeof body === "object") {
    const value = body as { success?: unknown; photo?: { repairId?: unknown } };
    if (value.success === true && value.photo?.repairId === repairId) return "success";
  }
  return httpStatus >= 400 && httpStatus < 500 ? "failed" : "unknown";
}
