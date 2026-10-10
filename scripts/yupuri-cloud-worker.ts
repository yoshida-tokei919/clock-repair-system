import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { assertSingleDisabledNextPage, cloudInvoicesUrl, JournalStore, oneAddedRow, runCloudJob, WorkerStop, type CloudApi, type CloudBrowser, type CloudJob, type CloudRow } from "./yupuri-cloud-worker-core";

const appData = process.env.LOCALAPPDATA;
if (!appData) throw new Error("LOCALAPPDATA is required");
const localRoot = join(appData, "clock-repair-system", "yupuri-cloud");
const profile = join(appData, "clock-repair-system", "yupuri-cloud-browser");
const pdfDir = join(localRoot, "pdf");
const journal = new JournalStore(join(localRoot, "journal"));

function args() {
  const values = process.argv.slice(2);
  if (values.some(value => !["--once", "--allow-issue", "--poll-seconds"].includes(value) &&
    !/^\d+$/.test(value))) throw new Error("Unknown worker option");
  const pollIndex = values.indexOf("--poll-seconds");
  const seconds = pollIndex < 0 ? 30 : Number(values[pollIndex + 1]);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 3600) throw new Error("poll-seconds must be 5..3600");
  return { once: values.includes("--once"), allowIssue: values.includes("--allow-issue"), seconds };
}

function serverOrigin() {
  const url = new URL(process.env.YUPURI_APP_ORIGIN ?? "https://yoshidawatchrepair.com");
  if (url.origin !== "https://yoshidawatchrepair.com" &&
    !(["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol))) {
    throw new Error("App origin must be production or localhost");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Invalid app origin");
  return url.origin;
}

class InternalApi implements CloudApi {
  constructor(private readonly origin: string, private readonly token: string) {}
  private async call(path: string, body?: unknown) {
    const response = await fetch(`${this.origin}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${this.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Internal API ${path} returned ${response.status}`);
    return response.json();
  }
  async next(): Promise<CloudJob | null> {
    const result = await this.call("/api/internal/yupuri-cloud/next");
    return result.job ?? null;
  }
  async complete(input: { shipmentId: number; managementNumber: string; trackingNumber: string }) {
    await this.call("/api/internal/yupuri-cloud/complete", input);
  }
}

function exactManagement(text: string, managementNumber: string) {
  return text.split(/\s+/).includes(managementNumber);
}

class PlaywrightCloudBrowser implements CloudBrowser {
  constructor(private readonly page: Page, private readonly invoicesUrl: string, private readonly filterName: string) {}
  private async invoices() {
    await this.page.goto(this.invoicesUrl, { waitUntil: "domcontentloaded" });
    if (new URL(this.page.url()).pathname.replace(/\/$/, "") !== "/invoices" ||
      new URL(this.page.url()).origin !== new URL(this.invoicesUrl).origin ||
      await this.page.getByRole("tab", { name: "\u767a\u884c\u5f8c", exact: true }).count() !== 1) {
      throw new Error("Cloud session or invoice page unavailable");
    }
  }
  private async matchingRows(managementNumber: string) {
    const rows = this.page.getByRole("row");
    const matches = [];
    for (let i = 0, count = await rows.count(); i < count; i++) {
      const row = rows.nth(i);
      if (exactManagement(await row.innerText(), managementNumber)) matches.push(row);
    }
    return matches;
  }
  async find(managementNumber: string): Promise<CloudRow | null> {
    await this.invoices();
    const inspect = async (tabName: string) => {
      const tab = this.page.getByRole("tab", { name: tabName, exact: true });
      if (await tab.count() !== 1) throw new Error("Cloud tab ambiguous");
      await tab.click();
      const matches = await this.matchingRows(managementNumber);
      const nextPage = this.page.getByRole("button", { name: "次の500件", exact: true });
      const count = await nextPage.count();
      assertSingleDisabledNextPage(count, count === 1 ? await nextPage.isEnabled() : null);
      if (matches.length > 1) throw new Error("Duplicate Cloud management number");
      return matches[0] ? await matches[0].innerText() : null;
    };
    const issued = await inspect("\u767a\u884c\u5f8c");
    const unissued = await inspect("\u767a\u884c\u524d");
    if (issued && unissued) throw new Error("Cloud management number occurs on both tabs");
    if (issued) {
      const numbers = [...issued.matchAll(/(?<!\d)\d{12}(?!\d)/g)].map(match => match[0]);
      if (numbers.length !== 1) throw new Error("Cloud tracking row ambiguous");
      return { state: "issued", trackingNumber: numbers[0] };
    }
    return unissued ? { state: "unissued", trackingNumber: null } : null;
  }
  async exportRows(): Promise<string[]> {
    await this.invoices();
    await this.page.getByRole("button", { name: "送り状のダウンロード" }).click();
    await this.page.waitForURL("**/invoices/export");
    const rows = this.page.getByRole("row").filter({ hasText: "シート式ラベル(ユ00783)" }).filter({ hasText: "発行済み" });
    const result: string[] = [];
    for (let i = 0, count = await rows.count(); i < count; i++) result.push(await rows.nth(i).innerText());
    return result;
  }
  async upload(csv: Buffer, managementNumber: string) {
    await this.invoices();
    await this.page.goto(new URL("/invoices/upload", this.invoicesUrl).href, { waitUntil: "domcontentloaded" });
    await this.page.waitForURL("**/invoices/upload");
    const filter = this.page.locator("#shippingDataFilterId");
    if (await filter.count() !== 1) throw new Error("Cloud filter input ambiguous");
    await filter.click();
    const options = this.page.locator('[role="option"]');
    await options.first().waitFor({ state: "visible" });
    const matchingOptions = [];
    for (let i = 0, count = await options.count(); i < count; i++) {
      const candidate = options.nth(i);
      if (await candidate.getAttribute("title") === this.filterName) matchingOptions.push(candidate);
    }
    if (matchingOptions.length !== 1) throw new Error("Cloud filter option ambiguous");
    const option = matchingOptions[0];
    const optionText = await option.innerText();
    if (!optionText.includes(this.filterName) || !optionText.includes("\u3042\u308a")) throw new Error("Cloud filter option mismatch");
    await option.click();
    const selected = this.page.locator("#shippingDataFilterId").locator("xpath=ancestor::*[contains(@class,'ant-select-selector')][1]");
    if (await selected.count() !== 1 || !(await selected.innerText()).includes(this.filterName)) throw new Error("Cloud filter mismatch");
    const input = this.page.locator("#dragger-button");
    if (await input.count() !== 1) throw new Error("Cloud CSV input ambiguous");
    await input.setInputFiles({ name: `${managementNumber}.csv`, mimeType: "text/csv", buffer: csv });
    await this.page.getByRole("button", { name: "アップロード", exact: true }).click();
  }
  async issue(managementNumber: string) {
    if ((await this.find(managementNumber))?.state !== "unissued") throw new Error("Cloud row is no longer unissued");
    const beforeIssueTab = this.page.getByRole("tab", { name: "\u767a\u884c\u524d", exact: true });
    if (await beforeIssueTab.count() !== 1) throw new Error("Cloud before-issue tab ambiguous");
    await beforeIssueTab.click();
    const rows = await this.matchingRows(managementNumber);
    if (rows.length !== 1 || await rows[0].getByRole("checkbox").count() !== 1) throw new Error("Cloud issue selection ambiguous");
    await rows[0].getByRole("checkbox").check();
    await this.page.getByRole("button", { name: "送り状を発行" }).click();
  }
  async downloadNewPdf(before: string[], managementNumber: string): Promise<string> {
    await this.invoices();
    await this.page.getByRole("button", { name: "送り状のダウンロード" }).click();
    await this.page.waitForURL("**/invoices/export");
    const rows = this.page.getByRole("row").filter({ hasText: "シート式ラベル(ユ00783)" }).filter({ hasText: "発行済み" });
    const after: string[] = [];
    for (let i = 0, count = await rows.count(); i < count; i++) {
      after.push(await rows.nth(i).innerText());
    }
    const added = rows.nth(oneAddedRow(before, after));
    const button = added.getByRole("button", { name: "ダウンロード", exact: true });
    if (await button.count() !== 1) {
      throw new Error("Cloud PDF cannot be correlated to one issue");
    }
    const context = this.page.context();
    const popupPromise = context.waitForEvent("page");
    await button.click();
    const popup = await popupPromise;
    const id = Number(managementNumber.slice(4));
    try {
      await popup.waitForURL(url => url.href !== "about:blank" && url.protocol === "https:");
      const response = await context.request.get(popup.url());
      if (!response.ok()) throw new Error("Cloud PDF request failed");
      const contentType = response.headers()["content-type"];
      if (contentType && !contentType.toLowerCase().includes("application/pdf")) throw new Error("Cloud PDF content type mismatch");
      const bytes = await response.body();
      if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Downloaded label is not a PDF");
      }
      await mkdir(pdfDir, { recursive: true });
      const target = join(pdfDir, `shipment-${id}.pdf`);
      await writeFile(target, bytes, { mode: 0o600 });
      return target;
    } finally {
      await popup.close();
    }
  }
}

async function run() {
  const options = args();
  const token = process.env.N8N_INTERNAL_TOKEN;
  if (!token) throw new Error("N8N_INTERNAL_TOKEN is required");
  const api = new InternalApi(serverOrigin(), token);
  await mkdir(localRoot, { recursive: true });
  const lock = join(localRoot, "worker.lock");
  await mkdir(lock); // A second instance fails; stale locks require an explicit operator review.
  let context: BrowserContext | undefined;
  try {
    let browser: CloudBrowser | undefined;
    if (options.allowIssue) {
      const url = cloudInvoicesUrl(process.env.YUPURI_CLOUD_INVOICES_URL);
      const filter = process.env.YUPURI_CLOUD_FILTER_NAME ?? "\u6642\u8a08\u4fee\u7406\u30a2\u30d7\u30ea17\u5217";
      if (!filter || filter.trim() !== filter) throw new Error("Invalid Cloud filter name");
      context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: false, acceptDownloads: true });
      browser = new PlaywrightCloudBrowser(context.pages()[0] ?? await context.newPage(), url, filter);
    }
    do {
      const job = await api.next();
      if (job) {
        console.log(`shipment=${job.shipmentId} stage=${options.allowIssue ? "processing" : "preview"}`);
        if (browser) {
          const printer = process.env.YUPURI_CLOUD_PRINTER_NAME;
          const printPdf = printer ? async (path: string) => {
            const module = await import("pdf-to-printer");
            await module.print(path, { printer });
          } : undefined;
          const result = await runCloudJob(job, api, browser, journal, true, printPdf);
          console.log(`shipment=${result.shipmentId} stage=${result.status}`);
        }
      }
      if (!options.once) await delay(options.seconds * 1000);
    } while (!options.once);
  } finally {
    await context?.close();
    await rm(lock, { recursive: true, force: true });
  }
}

run().catch(error => {
  // Do not emit browser, HTTP, CSV, PDF, or profile contents to service logs.
  if (error instanceof WorkerStop) console.error(error.message);
  else console.error("Yu-Pri Cloud worker stopped; inspect the local journal and Cloud UI before retrying");
  process.exitCode = 1;
});
