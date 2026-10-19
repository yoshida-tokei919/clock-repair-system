import type { PhysicalTagLabel } from "./physical-tag-label";

export type BatchPrintItem = { repairId: number; physicalTagId: number; shortCode: string; nfcUid: string | null; reused: boolean; label: PhysicalTagLabel };

export function validatePreparedBatchLabels(
  value: unknown,
  requested: Array<{ id: number; inquiryNumber: string }>,
  previous: Readonly<Record<number, BatchPrintItem>> = {},
): BatchPrintItem[] {
  const prepared = value as BatchPrintItem[];
  if (!Array.isArray(prepared) || prepared.length !== requested.length ||
      prepared.some((item, index) => !item || item.repairId !== requested[index].id ||
        item.label?.inquiryNumber !== requested[index].inquiryNumber ||
        item.label?.customerType !== "business" || item.label?.shortCode !== item.shortCode ||
        !Number.isSafeInteger(item.physicalTagId) || item.physicalTagId < 1 ||
        (item.nfcUid !== null && typeof item.nfcUid !== "string") ||
        !/^PT-\d{6,}$/.test(item.shortCode) || typeof item.label?.qrPayload !== "string" ||
        !item.label.qrPayload ||
        prepared.some((other, otherIndex) => otherIndex < index &&
          (other.physicalTagId === item.physicalTagId || other.shortCode === item.shortCode ||
            other.label?.qrPayload === item.label.qrPayload)))) {
    throw new Error("管理タグと受付結果の対応を確認できません。印刷は開始していません。");
  }
  for (const item of prepared) {
    const earlier = previous[item.repairId];
    if (earlier && (earlier.physicalTagId !== item.physicalTagId || earlier.shortCode !== item.shortCode ||
        earlier.label.qrPayload !== item.label.qrPayload)) {
      throw new Error("以前準備した管理タグと一致しません。案件画面で確認してください。印刷は開始していません。");
    }
    if (Object.values(previous).some(other => other.repairId !== item.repairId &&
        (other.physicalTagId === item.physicalTagId || other.shortCode === item.shortCode ||
          other.label.qrPayload === item.label.qrPayload))) {
      throw new Error("別案件と同じ管理タグが返されました。印刷は開始していません。");
    }
  }
  return prepared;
}

export class BatchPrintStopped extends Error {
  constructor(public readonly failedIndex: number, cause: unknown) {
    super(cause instanceof Error ? cause.message : "印刷結果を確認できませんでした。");
  }
}

export async function printBatchFrom(
  labels: BatchPrintItem[], startIndex: number,
  print: (label: PhysicalTagLabel) => Promise<void>, onComplete: (index: number) => void,
): Promise<void> {
  for (let index = startIndex; index < labels.length; index += 1) {
    try {
      await print(labels[index].label);
      onComplete(index);
    } catch (cause) {
      throw new BatchPrintStopped(index, cause);
    }
  }
}
