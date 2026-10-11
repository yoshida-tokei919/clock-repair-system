import { type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JournalStore, oneAddedRow, productionCloudInvoicesUrl, runCloudJob, WorkerStop, type CloudApi, type CloudBrowser, type CloudJob, type CloudRow } from "./yupuri-cloud-worker-core";
import { assertAuthenticatedInvoices, assertToolboxAutomationWindowOpen, cdpEndpoint, connectDedicatedEdge,
  edgeProfilePath, isToolboxAutomationWindowOpen, msUntilToolboxAutomationWindowOpen,
  ToolboxServiceClosedError } from "./yupuri-cloud-live-session";
import { inspectCloudExportRows, inspectCloudTab } from "./yupuri-cloud-listing";
import { resolvePdfPrint } from "./yupuri-cloud-print";
import { guardedCloudCheck, guardedCloudClick, guardedCloudFiles } from "./yupuri-cloud-actions";

const appData = process.env.LOCALAPPDATA;
if (!appData) throw new Error("LOCALAPPDATA is required");
const localRoot = join(appData, "clock-repair-system", "yupuri-cloud");
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

export function appOrigin(configured = process.env.YUPURI_APP_ORIGIN ?? "https://yoshidawatchrepair.com") {
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!local && configured !== "https://yoshidawatchrepair.com") {
    throw new Error("App origin must be the exact production origin or localhost");
  }
  if (url.origin !== "https://yoshidawatchrepair.com" &&
    !(local && ["http:", "https:"].includes(url.protocol))) {
    throw new Error("App origin must be production or localhost");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Invalid app origin");
  return url.origin;
}

class InternalApi implements CloudApi {
  constructor(private readonly origin: string, private readonly token: string) {}
  private async call(path: string, body?: unknown) {
    assertToolboxAutomationWindowOpen();
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

export function assertCloudPageTopology(page: Page, popup?: Page): void {
  const context = page.context();
  const browser = context.browser();
  const contexts = browser?.contexts();
  const pages = context.pages().filter(candidate => !candidate.isClosed());
  if (!contexts || contexts.length !== 1 || contexts[0] !== context ||
    page.isClosed() || pages.length !== (popup ? 2 : 1) || !pages.includes(page) ||
    (popup && !pages.includes(popup))) throw new Error("Unexpected Cloud browser tab; stop for manual review");
}

export async function withCloudPdfPopup<T>(page: Page, beforeAction: () => void,
  click: () => Promise<void>, usePopup: (popup: Page) => Promise<T>): Promise<T> {
  assertCloudPageTopology(page);
  const context = page.context();
  const opened: Page[] = [];
  const onPage = (popup: Page) => { opened.push(popup); };
  context.on("page", onPage);
  let result: T | undefined;
  let failure: unknown;
  try {
    const popupPromise = context.waitForEvent("page", { timeout: 15000 });
    try { beforeAction(); await click(); }
    catch (error) { void popupPromise.catch(() => {}); throw error; }
    const popup = await popupPromise;
    if (opened.length !== 1 || opened[0] !== popup || await popup.opener() !== page) {
      throw new Error("Cloud PDF popup is unrelated or ambiguous");
    }
    assertCloudPageTopology(page, popup);
    result = await usePopup(popup);
    assertCloudPageTopology(page, popup);
  } catch (error) {
    failure = error;
  } finally {
    context.off("page", onPage);
    const cleanupErrors: unknown[] = [];
    for (const popup of opened) {
      try {
        if (!popup.isClosed() && await popup.opener() === page) await popup.close();
      } catch (error) { cleanupErrors.push(error); }
    }
    try { assertCloudPageTopology(page); }
    catch (error) { cleanupErrors.push(error); }
    if (opened.length !== 1 && !failure) failure = new Error("Cloud PDF popup is unrelated or ambiguous");
    if (cleanupErrors.length) {
      throw new AggregateError(failure ? [failure, ...cleanupErrors] : cleanupErrors,
        "Cloud PDF popup cleanup failed; stop for manual review");
    }
  }
  if (failure) throw failure;
  return result as T;
}

export class PlaywrightCloudBrowser implements CloudBrowser {
  constructor(private readonly page: Page, private readonly invoicesUrl: string, private readonly filterName: string,
    private readonly serviceGuard: () => void = assertToolboxAutomationWindowOpen) {}
  private assertTopology(popup?: Page): void {
    assertCloudPageTopology(this.page, popup);
  }
  assertOperationalPage(): void { this.assertTopology(); }
  private beforeAction(): void { this.assertTopology(); this.serviceGuard(); }
  private async invoices() {
    this.beforeAction();
    await this.page.goto(this.invoicesUrl, { waitUntil: "domcontentloaded" });
    this.assertTopology();
    await assertAuthenticatedInvoices(this.page, this.invoicesUrl);
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
    const issued = await inspectCloudTab(this.page, "\u767a\u884c\u5f8c", managementNumber, 3000, 100, () => this.beforeAction());
    const unissued = await inspectCloudTab(this.page, "\u767a\u884c\u524d", managementNumber, 3000, 100, () => this.beforeAction());
    this.assertTopology();
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
    this.beforeAction();
    await guardedCloudClick(this.page.getByRole("button", { name: "送り状のダウンロード" }), () => this.beforeAction());
    await this.page.waitForURL("**/invoices/export");
    this.assertTopology();
    const rows = await inspectCloudExportRows(this.page);
    this.assertTopology();
    return rows;
  }
  async upload(csv: Buffer, managementNumber: string) {
    await this.invoices();
    this.beforeAction();
    await this.page.goto(new URL("/invoices/upload", this.invoicesUrl).href, { waitUntil: "domcontentloaded" });
    await this.page.waitForURL("**/invoices/upload");
    this.assertTopology();
    const filter = this.page.locator("#shippingDataFilterId");
    if (await filter.count() !== 1) throw new Error("Cloud filter input ambiguous");
    await guardedCloudClick(filter, () => this.beforeAction());
    this.assertTopology();
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
    await guardedCloudClick(option, () => this.beforeAction());
    this.assertTopology();
    const selected = this.page.locator("#shippingDataFilterId").locator("xpath=ancestor::*[contains(@class,'ant-select-selector')][1]");
    if (await selected.count() !== 1 || !(await selected.innerText()).includes(this.filterName)) throw new Error("Cloud filter mismatch");
    const input = this.page.locator("#dragger-button");
    if (await input.count() !== 1) throw new Error("Cloud CSV input ambiguous");
    await guardedCloudFiles(input, { name: `${managementNumber}.csv`, mimeType: "text/csv", buffer: csv },
      () => this.beforeAction());
    await guardedCloudClick(this.page.getByRole("button", { name: "アップロード", exact: true }),
      () => this.beforeAction());
    this.assertTopology();
  }
  async issue(managementNumber: string) {
    if ((await this.find(managementNumber))?.state !== "unissued") throw new Error("Cloud row is no longer unissued");
    const beforeIssueTab = this.page.getByRole("tab", { name: "\u767a\u884c\u524d", exact: true });
    if (await beforeIssueTab.count() !== 1) throw new Error("Cloud before-issue tab ambiguous");
    await guardedCloudClick(beforeIssueTab, () => this.beforeAction());
    this.assertTopology();
    const rows = await this.matchingRows(managementNumber);
    if (rows.length !== 1 || await rows[0].getByRole("checkbox").count() !== 1) throw new Error("Cloud issue selection ambiguous");
    await guardedCloudCheck(rows[0].getByRole("checkbox"), () => this.beforeAction());
    await guardedCloudClick(this.page.getByRole("button", { name: "送り状を発行" }),
      () => this.beforeAction());
    this.assertTopology();
  }
  async downloadNewPdf(before: string[], managementNumber: string): Promise<string> {
    await this.invoices();
    this.beforeAction();
    await guardedCloudClick(this.page.getByRole("button", { name: "送り状のダウンロード" }), () => this.beforeAction());
    await this.page.waitForURL("**/invoices/export");
    this.assertTopology();
    const after = await inspectCloudExportRows(this.page);
    const addedIndex = oneAddedRow(before, after);
    const rows = this.page.getByRole("row").filter({ hasText: "シート式ラベル(ユ00783)" }).filter({ hasText: "発行済み" });
    const added = rows.nth(addedIndex);
    if (await rows.count() !== after.length || await added.innerText() !== after[addedIndex]) {
      throw new Error("Cloud PDF row changed after inspection");
    }
    const button = added.getByRole("button", { name: "ダウンロード", exact: true });
    if (await button.count() !== 1) {
      throw new Error("Cloud PDF cannot be correlated to one issue");
    }
    const context = this.page.context();
    const id = Number(managementNumber.slice(4));
    return withCloudPdfPopup(this.page, () => this.beforeAction(),
      () => guardedCloudClick(button, () => this.beforeAction()), async popup => {
      await popup.waitForURL(url => url.href !== "about:blank" && url.protocol === "https:");
      this.assertTopology(popup);
      this.serviceGuard();
      const response = await context.request.get(popup.url());
      this.assertTopology(popup);
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
      this.assertTopology(popup);
      return target;
    });
  }
}

export function edgeRestartExitError(now: Date = new Date()): Error {
  return isToolboxAutomationWindowOpen(now) ?
    new Error("Cloud login was not confirmed. Log in manually with auto-login enabled, then restart the dedicated Edge.") :
    new ToolboxServiceClosedError();
}

async function restartDedicatedEdgeSession(): Promise<void> {
  assertToolboxAutomationWindowOpen();
  const script = fileURLToPath(new URL("./open-yupuri-cloud-login.ps1", import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", script], { windowsHide: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(edgeRestartExitError()));
  });
}

async function run() {
  const options = args();
  if (options.once && !isToolboxAutomationWindowOpen()) {
    console.log("Yu-Pri Cloud automation window closed; --once skipped until 06:00 JST");
    return;
  }
  const token = process.env.N8N_INTERNAL_TOKEN;
  if (!token) throw new Error("N8N_INTERNAL_TOKEN is required");
  const api = new InternalApi(appOrigin(), token);
  await mkdir(localRoot, { recursive: true });
  const lock = join(localRoot, "worker.lock");
  await mkdir(lock); // A second instance fails; stale locks require an explicit operator review.
  try {
    let browser: CloudBrowser | undefined;
    let livePage: Page | undefined;
    let invoicesUrl: string | undefined;
    while (true) {
      if (!isToolboxAutomationWindowOpen()) {
        livePage = undefined;
        browser = undefined;
        if (options.once) return;
        await delay(Math.min(msUntilToolboxAutomationWindowOpen(), 60000));
        continue;
      }
      try {
        if (options.allowIssue && !livePage) {
          invoicesUrl = productionCloudInvoicesUrl(process.env.YUPURI_CLOUD_INVOICES_URL);
          const filter = process.env.YUPURI_CLOUD_FILTER_NAME ?? "\u6642\u8a08\u4fee\u7406\u30a2\u30d7\u30ea17\u5217";
          if (!filter || filter.trim() !== filter) throw new Error("Invalid Cloud filter name");
          await restartDedicatedEdgeSession();
          assertToolboxAutomationWindowOpen();
          const edge = await connectDedicatedEdge(cdpEndpoint(process.env.YUPURI_CLOUD_CDP_URL), edgeProfilePath(appData ?? ""));
          const contexts = edge.contexts();
          const pages = contexts.length === 1 ? contexts[0].pages().filter(page => !page.isClosed()) : [];
          if (pages.length !== 1) throw new Error("Dedicated Edge must have exactly one authenticated Cloud tab");
          livePage = pages[0];
          await assertAuthenticatedInvoices(livePage, invoicesUrl);
          browser = new PlaywrightCloudBrowser(livePage, invoicesUrl, filter);
          if (browser instanceof PlaywrightCloudBrowser) browser.assertOperationalPage();
        }
        if (livePage && invoicesUrl) {
          if (browser instanceof PlaywrightCloudBrowser) browser.assertOperationalPage();
          assertToolboxAutomationWindowOpen();
          await livePage.goto(invoicesUrl, { waitUntil: "domcontentloaded" });
          assertToolboxAutomationWindowOpen();
          if (browser instanceof PlaywrightCloudBrowser) browser.assertOperationalPage();
          await assertAuthenticatedInvoices(livePage, invoicesUrl);
        }
        if (browser instanceof PlaywrightCloudBrowser) browser.assertOperationalPage();
        assertToolboxAutomationWindowOpen();
        const job = await api.next();
        if (job) {
          assertToolboxAutomationWindowOpen();
          console.log(`shipment=${job.shipmentId} stage=${options.allowIssue ? "processing" : "preview"}`);
          if (browser instanceof PlaywrightCloudBrowser) {
            const operationalBrowser = browser;
            const printer = process.env.YUPURI_CLOUD_PRINTER_NAME;
            const printPdf = printer ? async (path: string) => {
              assertToolboxAutomationWindowOpen();
              const module = await import("pdf-to-printer");
              operationalBrowser.assertOperationalPage();
              assertToolboxAutomationWindowOpen();
              await resolvePdfPrint(module)(path, { printer });
            } : undefined;
            const result = await runCloudJob(job, api, operationalBrowser, journal, true, printPdf,
              () => operationalBrowser.assertOperationalPage());
            console.log(`shipment=${result.shipmentId} stage=${result.status}`);
          }
        }
      } catch (error) {
        if (!(error instanceof ToolboxServiceClosedError)) throw error;
        livePage = undefined;
        browser = undefined;
        if (options.once) return;
        continue;
      }
      if (options.once) return;
      await delay(options.seconds * 1000);
    }
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().then(() => {
  // The process exit drops CDP without sending Browser.close to Edge.
  process.exit(0);
}).catch(error => {
  // Do not emit browser, HTTP, CSV, PDF, or profile contents to service logs.
  if (error instanceof WorkerStop) console.error(error.message);
  else console.error("Yu-Pri Cloud worker stopped; inspect the local journal and Cloud UI before retrying");
  process.exit(1);
});
