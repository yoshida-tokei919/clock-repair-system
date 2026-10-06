import type { PhysicalTagLabel } from "./physical-tag-label";

export type BatchPrintItem = { repairId: number; physicalTagId: number; shortCode: string; reused: boolean; label: PhysicalTagLabel };

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
