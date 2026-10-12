import type { Page } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { YUPURI_HISTORY_MAX_BYTES, YUPURI_HISTORY_MAX_ROWS } from "../src/lib/yupuri-history";
import { assertSingleDisabledNextPage } from "./yupuri-cloud-worker-core";
import { guardedCloudCheck, guardedCloudClick } from "./yupuri-cloud-actions";

const MANAGEMENT_TOKEN = /^SHP-[1-9][0-9]*$/;

function managementTokens(text: string): string[] {
  return [...new Set(text.split(/\s+/).filter(token => MANAGEMENT_TOKEN.test(token)))];
}

async function settledRows(page: Page, timeoutMs: number, pollMs: number) {
  const deadline = Date.now() + timeoutMs;
  let prior: string[] | undefined;
  let stableSince = Date.now();
  let current: string[] = [];
  while (true) {
    current = await page.getByRole("row").allInnerTexts();
    if (!prior || current.length !== prior.length || current.some((value, index) => value !== prior?.[index])) {
      stableSince = Date.now();
      prior = current;
    }
    if (Date.now() >= deadline) {
      if (Date.now() - stableSince < pollMs * 2) throw new Error("Cloud issued rows did not settle");
      return current;
    }
    await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
}

async function boundedDownloadBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > YUPURI_HISTORY_MAX_BYTES) throw new Error("Cloud tracking CSV exceeds the supported size");
    chunks.push(buffer);
  }
  if (!size) throw new Error("Cloud tracking CSV is empty");
  return Buffer.concat(chunks);
}

export async function downloadTrackingCsv(
  page: Page,
  filterName: string,
  beforeAction: () => void,
  settleTimeoutMs = 3000,
  settlePollMs = 100,
): Promise<Buffer | null> {
  if (!filterName || filterName.trim() !== filterName) throw new Error("Invalid Cloud tracking output filter name");
  beforeAction();
  const issuedTab = page.getByRole("tab", { name: "発行後", exact: true });
  if (await issuedTab.count() !== 1) throw new Error("Cloud issued tab is ambiguous");
  await guardedCloudClick(issuedTab, beforeAction);
  if (await issuedTab.getAttribute("aria-selected") !== "true") throw new Error("Cloud issued tab was not selected");

  const texts = await settledRows(page, settleTimeoutMs, settlePollMs);
  beforeAction();
  const nextPage = page.getByRole("button", { name: "次の500件", exact: true });
  const nextCount = await nextPage.count();
  assertSingleDisabledNextPage(nextCount, nextCount === 1 ? await nextPage.isEnabled() : null);

  const rows = page.getByRole("row");
  const selected = new Set<string>();
  for (let index = 0, count = await rows.count(); index < count; index++) {
    const row = rows.nth(index);
    const text = texts[index] ?? await row.innerText();
    const tokens = managementTokens(text);
    if (tokens.length === 0) continue;
    if (tokens.length !== 1 || selected.has(tokens[0])) throw new Error("Cloud management number is ambiguous");
    const checkbox = row.getByRole("checkbox");
    if (await checkbox.count() !== 1) throw new Error("Cloud tracking row checkbox is ambiguous");
    await guardedCloudCheck(checkbox, beforeAction);
    selected.add(tokens[0]);
    if (selected.size > YUPURI_HISTORY_MAX_ROWS) throw new Error("Cloud tracking row count exceeds the supported limit");
  }
  if (selected.size === 0) return null;

  const openDownload = page.getByRole("button", { name: "ダウンロード", exact: true });
  if (await openDownload.count() !== 1) throw new Error("Cloud CSV download button is ambiguous");
  await guardedCloudClick(openDownload, beforeAction);

  const dialog = page.getByRole("dialog");
  if (await dialog.count() !== 1) throw new Error("Cloud CSV download dialog is ambiguous");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  const filter = dialog.getByRole("combobox");
  if (await filter.count() !== 1) throw new Error("Cloud CSV output filter is ambiguous");
  await guardedCloudClick(filter, beforeAction);
  const option = page.getByRole("option", { name: filterName, exact: true });
  if (await option.count() !== 1) throw new Error("Cloud CSV output filter option is missing or ambiguous");
  await guardedCloudClick(option, beforeAction);

  const downloadButton = dialog.getByRole("button", { name: "ダウンロード", exact: true });
  if (await downloadButton.count() !== 1) throw new Error("Cloud CSV dialog download button is ambiguous");
  beforeAction();
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await guardedCloudClick(downloadButton, beforeAction);
  const download = await downloadPromise;
  beforeAction();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Cloud CSV download stream is unavailable");
  const bytes = await boundedDownloadBytes(stream);
  beforeAction();
  return bytes;
}
