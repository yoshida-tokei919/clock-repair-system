import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSingleDisabledNextPage, cloudInvoicesUrl, JournalStore, oneAddedRow, runCloudJob, WorkerStop, type CloudBrowser, type CloudJob } from "./yupuri-cloud-worker-core";

const job: CloudJob = { shipmentId: 42, managementNumber: "SHP-42",
  csvBase64: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("SHP-42\r\n")]).toString("base64") };

test("PDF list comparison requires exactly one addition and no missing old row", () => {
  assert.equal(oneAddedRow(["old", "old"], ["new", "old", "old"]), 0);
  assert.throws(() => oneAddedRow(["old"], ["new"]));
  assert.throws(() => oneAddedRow(["old"], ["old", "new", "other"]));
  assert.throws(() => oneAddedRow(["old"], ["old"]));
  assert.throws(() => oneAddedRow(["old"], ["old", "old"]));
});

test("production URL and pagination contracts", () => {
  assert.equal(cloudInvoicesUrl(), "https://btoolboxprintservice.jp/invoices/");
  assert.equal(cloudInvoicesUrl("https://btoolboxprintservice.jp/invoices"), "https://btoolboxprintservice.jp/invoices");
  assert.equal(cloudInvoicesUrl("http://localhost:3000/invoices/"), "http://localhost:3000/invoices/");
  for (const url of ["https://example.com/invoices/", "https://static.btoolboxprintservice.jp/invoices/",
    "http://btoolboxprintservice.jp/invoices/", "https://btoolboxprintservice.jp:8443/invoices/",
    "https://btoolboxprintservice.jp/invoices/invoices.html", "https://btoolboxprintservice.jp/invoices/?x=1",
    "https://btoolboxprintservice.jp/invoices/#x", "https://user@btoolboxprintservice.jp/invoices/"]) {
    assert.throws(() => cloudInvoicesUrl(url), url);
  }
  assert.doesNotThrow(() => assertSingleDisabledNextPage(1, false));
  for (const state of [[0, null], [1, true], [2, false], [1, null]] as const) {
    assert.throws(() => assertSingleDisabledNextPage(state[0], state[1]));
  }
});

test("worker uploads once, reconciles exact row, downloads PDF, prints and completes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    let row: "none" | "unissued" | "issued" = "none";
    let uploads = 0; let issues = 0; let downloads = 0; let prints = 0; let completes = 0;
    const calls: string[] = [];
    const browser: CloudBrowser = {
      find: async () => row === "none" ? null : { state: row, trackingNumber: row === "issued" ? "398007150100" : null },
      exportRows: async () => ["old row"],
      upload: async () => { uploads++; calls.push("upload"); row = "unissued"; },
      issue: async () => { issues++; calls.push("issue"); row = "issued"; },
      downloadNewPdf: async before => { assert.deepEqual(before, ["old row"]); downloads++; calls.push("pdf"); return "label.pdf"; },
    };
    const store = new JournalStore(dir);
    const api = { next: async () => job, complete: async () => { completes++; calls.push("complete"); } };
    const print = async () => { prints++; calls.push("print"); };
    assert.equal((await runCloudJob(job, api, browser, store, false, print)).status, "preview");
    assert.equal(uploads, 0);
    assert.equal((await runCloudJob(job, api, browser, store, true, print)).status, "completed");
    assert.deepEqual([uploads, issues, downloads, prints, completes], [1, 1, 1, 1, 1]);
    await runCloudJob(job, api, browser, store, true, print);
    assert.deepEqual([uploads, issues, downloads, prints, completes], [1, 1, 1, 1, 1]);
    assert.deepEqual(calls, ["upload", "issue", "complete", "pdf", "print"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("uncertain upload and preexisting remote row stop without reupload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    const store = new JournalStore(dir);
    let uploads = 0; let issues = 0;
    const browser: CloudBrowser = {
      find: async () => null, exportRows: async () => [], upload: async () => { uploads++; },
      issue: async () => { issues++; }, downloadNewPdf: async () => "",
    };
    const api = { next: async () => job, complete: async () => {} };
    await assert.rejects(runCloudJob(job, api, browser, store, true), WorkerStop);
    await assert.rejects(runCloudJob(job, api, browser, store, true), WorkerStop);
    assert.equal(uploads, 1);
    const otherStore = new JournalStore(join(dir, "other"));
    await assert.rejects(runCloudJob(job, api, { ...browser, find: async () => ({ state: "unissued", trackingNumber: null }) }, otherStore, true), WorkerStop);
    assert.deepEqual([uploads, issues], [1, 0]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("uncertain issue never retries the issue click, and missing PDF snapshot does not block writeback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    let issues = 0; let completes = 0;
    let row: "unissued" | "issued" = "unissued";
    const browser: CloudBrowser = {
      find: async () => ({ state: row, trackingNumber: row === "issued" ? "398007150100" : null }),
      exportRows: async () => [], upload: async () => {},
      issue: async () => { issues++; throw Error("response lost"); },
      downloadNewPdf: async () => "label.pdf",
    };
    const api = { next: async () => job, complete: async () => { completes++; } };
    const store = new JournalStore(dir);
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "started" });
    await assert.rejects(runCloudJob(job, api, browser, store, true));
    await assert.rejects(runCloudJob(job, api, browser, store, true), WorkerStop);
    assert.equal(issues, 1);
    row = "issued";
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "issuing" });
    await assert.rejects(runCloudJob(job, api, browser, store, true), WorkerStop);
    assert.equal(completes, 1); // Issuance writeback precedes artifact correlation.

    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "completed", trackingNumber: "398007150100", exportBefore: [] });
    await assert.rejects(runCloudJob(job, api, browser, store, true, async () => { throw Error("printer response lost"); }));
    await assert.rejects(runCloudJob(job, api, browser, store, true, async () => {}), WorkerStop);
    assert.equal(completes, 1);
    assert.equal(issues, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("preexisting issued row recovers completion without upload, issue, or PDF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    const calls: string[] = [];
    const store = new JournalStore(dir);
    const browser: CloudBrowser = {
      find: async () => ({ state: "issued", trackingNumber: "398007150100" }),
      exportRows: async () => [], upload: async () => { calls.push("upload"); },
      issue: async () => { calls.push("issue"); }, downloadNewPdf: async () => { calls.push("pdf"); return "label.pdf"; },
    };
    const api = { next: async () => job, complete: async () => { calls.push("complete"); } };
    assert.equal((await runCloudJob(job, api, browser, store, true)).status, "recovered");
    assert.deepEqual(calls, ["complete"]);
    assert.equal((await store.read(42))?.stage, "completed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("uncertain issue restart with issued row completes without a second issue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    const store = new JournalStore(dir);
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "issuing", exportBefore: ["old"] });
    let issues = 0; let completes = 0;
    const browser: CloudBrowser = {
      find: async () => ({ state: "issued", trackingNumber: "398007150100" }),
      exportRows: async () => [], upload: async () => {}, issue: async () => { issues++; },
      downloadNewPdf: async () => "label.pdf",
    };
    const api = { next: async () => job, complete: async () => { completes++; } };
    await runCloudJob(job, api, browser, store, true);
    assert.deepEqual([issues, completes], [0, 1]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("PDF failure leaves DB complete and does not reissue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    const store = new JournalStore(dir);
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "issuing", exportBefore: ["old"] });
    let issues = 0; let completes = 0;
    const browser: CloudBrowser = {
      find: async () => ({ state: "issued", trackingNumber: "398007150100" }),
      exportRows: async () => [], upload: async () => {}, issue: async () => { issues++; },
      downloadNewPdf: async () => { throw Error("PDF unavailable"); },
    };
    const api = { next: async () => job, complete: async () => { completes++; } };
    await assert.rejects(runCloudJob(job, api, browser, store, true), /PDF unavailable/);
    assert.equal((await store.read(42))?.stage, "completed");
    await assert.rejects(runCloudJob(job, api, browser, store, true), /PDF unavailable/);
    assert.deepEqual([issues, completes], [0, 1]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("print failure leaves DB complete and does not reissue or reprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yupuri-worker-"));
  try {
    const store = new JournalStore(dir);
    await store.write({ shipmentId: 42, managementNumber: "SHP-42", stage: "issuing", exportBefore: ["old"] });
    let issues = 0; let completes = 0; let prints = 0;
    const browser: CloudBrowser = {
      find: async () => ({ state: "issued", trackingNumber: "398007150100" }),
      exportRows: async () => [], upload: async () => {}, issue: async () => { issues++; },
      downloadNewPdf: async () => "label.pdf",
    };
    const api = { next: async () => job, complete: async () => { completes++; } };
    const print = async () => { prints++; throw Error("printer unavailable"); };
    await assert.rejects(runCloudJob(job, api, browser, store, true, print), /printer unavailable/);
    assert.equal((await store.read(42))?.stage, "completed");
    await assert.rejects(runCloudJob(job, api, browser, store, true, print), WorkerStop);
    assert.deepEqual([issues, completes, prints], [0, 1, 1]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
