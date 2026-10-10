import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CloudJob = { shipmentId: number; managementNumber: string; csvBase64: string };
export type CloudRow = { state: "unissued" | "issued"; trackingNumber: string | null };
export type Journal = { shipmentId: number; managementNumber: string; stage: "started" | "issuing" | "issued" | "completed";
  trackingNumber?: string; pdfPath?: string; exportBefore?: string[]; printAttempted?: boolean; printCompleted?: boolean; recovered?: boolean };

export interface CloudApi {
  next(): Promise<CloudJob | null>;
  complete(input: { shipmentId: number; managementNumber: string; trackingNumber: string }): Promise<void>;
}
export interface CloudBrowser {
  find(managementNumber: string): Promise<CloudRow | null>;
  exportRows(): Promise<string[]>;
  upload(csv: Buffer, managementNumber: string): Promise<void>;
  issue(managementNumber: string): Promise<void>;
  downloadNewPdf(exportBefore: string[], managementNumber: string): Promise<string>;
}

export class WorkerStop extends Error {
  constructor(public readonly stage: string, public readonly shipmentId: number) {
    super(`shipment=${shipmentId} stage=${stage} stopped for review`);
  }
}

export function oneAddedRow(before: string[], after: string[]): number {
  const remaining = [...before];
  const added: number[] = [];
  for (let index = 0; index < after.length; index++) {
    const oldIndex = remaining.indexOf(after[index]);
    if (oldIndex >= 0) remaining.splice(oldIndex, 1);
    else added.push(index);
  }
  if (remaining.length || added.length !== 1) throw new Error("Cloud PDF cannot be correlated to one issue");
  if (before.includes(after[added[0]])) throw new Error("Cloud PDF row is indistinguishable from an existing row");
  return added[0];
}

export function cloudInvoicesUrl(configured = "https://btoolboxprintservice.jp/invoices/"): string {
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
    (local ? !["http:", "https:"].includes(url.protocol) :
      url.protocol !== "https:" || url.hostname !== "btoolboxprintservice.jp") ||
    !["/invoices", "/invoices/"].includes(url.pathname) ||
    (url.port && !local)) throw new Error("Invalid Cloud invoices URL");
  return url.href;
}

export function assertSingleDisabledNextPage(count: number, enabled: boolean | null): void {
  if (count !== 1 || enabled !== false) throw new Error("Cloud pagination is ambiguous");
}

export class JournalStore {
  constructor(private readonly dir: string) {}
  private path(id: number) { return join(this.dir, `${id}.json`); }
  async read(id: number): Promise<Journal | null> {
    try { return JSON.parse(await readFile(this.path(id), "utf8")) as Journal; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async write(value: Journal) {
    await mkdir(this.dir, { recursive: true });
    const target = this.path(value.shipmentId);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}

function checkedJob(job: CloudJob): void {
  if (!Number.isInteger(job.shipmentId) || job.shipmentId < 1 || job.managementNumber !== `SHP-${job.shipmentId}` ||
    typeof job.csvBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(job.csvBase64)) {
    throw new Error("Invalid job contract");
  }
  const csv = Buffer.from(job.csvBase64, "base64");
  if (csv.subarray(0, 3).toString("hex") !== "efbbbf" || !csv.includes(Buffer.from(job.managementNumber))) {
    throw new Error("Invalid CSV contract");
  }
}

function tracking(row: CloudRow | null, id: number): string {
  if (!row || row.state !== "issued" || !row.trackingNumber || !/^\d{12}$/.test(row.trackingNumber)) {
    throw new WorkerStop("tracking-uncertain", id);
  }
  return row.trackingNumber;
}

export async function runCloudJob(job: CloudJob, api: CloudApi, browser: CloudBrowser, store: JournalStore,
  allowIssue: boolean, printPdf?: (path: string) => Promise<void>) {
  checkedJob(job);
  const id = job.shipmentId;
  let journal = await store.read(id);
  if (journal && journal.managementNumber !== job.managementNumber) throw new WorkerStop("journal-conflict", id);
  if (!allowIssue) return { shipmentId: id, status: "preview" as const };

  // Reconcile the remote row on every run, including after a transport failure or crash.
  let row = await browser.find(job.managementNumber);
  if (!journal) {
    if (row?.state === "unissued") throw new WorkerStop("preexisting-unissued-row", id);
    if (row?.state === "issued") {
      const trackingNumber = tracking(row, id);
      await api.complete({ shipmentId: id, managementNumber: job.managementNumber, trackingNumber });
      journal = { shipmentId: id, managementNumber: job.managementNumber, trackingNumber, stage: "completed", recovered: true };
      await store.write(journal);
      return { shipmentId: id, status: "recovered" as const };
    }
    journal = { shipmentId: id, managementNumber: job.managementNumber, stage: "started" };
    await store.write(journal);
    await browser.upload(Buffer.from(job.csvBase64, "base64"), job.managementNumber);
    row = await browser.find(job.managementNumber);
  }
  if (!row) throw new WorkerStop("upload-uncertain", id);
  if (row.state === "unissued") {
    if (journal.stage !== "started") throw new WorkerStop("issue-uncertain", id);
    journal.exportBefore = await browser.exportRows();
    journal.stage = "issuing";
    await store.write(journal);
    await browser.issue(job.managementNumber);
    row = await browser.find(job.managementNumber);
  }
  const trackingNumber = tracking(row, id);
  if (journal.trackingNumber && journal.trackingNumber !== trackingNumber) throw new WorkerStop("tracking-conflict", id);
  journal.trackingNumber = trackingNumber;
  if (journal.stage === "completed" && journal.recovered) return { shipmentId: id, status: "recovered" as const };
  if (journal.stage !== "completed") {
    journal.stage = "issued";
    await store.write(journal);
    await api.complete({ shipmentId: id, managementNumber: job.managementNumber, trackingNumber });
    journal.stage = "completed";
    await store.write(journal);
  }

  if (!journal.pdfPath) {
    if (!journal.exportBefore) throw new WorkerStop("pdf-correlation-unknown", id);
    journal.pdfPath = await browser.downloadNewPdf(journal.exportBefore, job.managementNumber);
    await store.write(journal);
  }
  if (printPdf && !journal.printCompleted) {
    if (journal.printAttempted) throw new WorkerStop("print-uncertain", id);
    journal.printAttempted = true;
    await store.write(journal);
    await printPdf(journal.pdfPath);
    journal.printCompleted = true;
    await store.write(journal);
  }
  return { shipmentId: id, status: "completed" as const, pdfPath: journal.pdfPath };
}
