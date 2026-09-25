import { createHash } from "node:crypto";

export class StaleScheduleError extends Error {}

export function scheduleRevision(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function assertScheduleRevision(submitted: string, current: string): void {
  if (submitted !== current) throw new StaleScheduleError("予定が変更されました。再プレビューしてください。");
}
