import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fetchInvoicePdfForPrint, isPostalInvoicePrintTarget, orderedSelectedPostalIds,
  printPostalInvoiceBatch, submitInvoicePdfToFixedPrinter,
} from "./postal-invoice-print";

const eligibleInvoice = {
  status: "issued", customer: { type: "business" },
  currentPdfFile: { status: "current", storageKey: "invoices/1.pdf" },
};

test("only active B2B POSTAL invoices with a current stored PDF are print targets", () => {
  const postal = { method: "POSTAL" as const };
  assert.equal(isPostalInvoicePrintTarget(eligibleInvoice, postal), true);
  assert.equal(isPostalInvoicePrintTarget({ ...eligibleInvoice, status: "paid" }, postal), true);
  for (const invoice of [
    { ...eligibleInvoice, status: "void" },
    { ...eligibleInvoice, status: "canceled" },
    { ...eligibleInvoice, customer: { type: "individual" } },
    { ...eligibleInvoice, currentPdfFile: null },
    { ...eligibleInvoice, currentPdfFile: { status: "draft", storageKey: "invoices/1.pdf" } },
    { ...eligibleInvoice, currentPdfFile: { status: "current", storageKey: "" } },
  ]) assert.equal(isPostalInvoicePrintTarget(invoice, postal), false);
  assert.equal(isPostalInvoicePrintTarget(eligibleInvoice, { method: "LINE" }), false);
  assert.equal(isPostalInvoicePrintTarget(eligibleInvoice, null), false);
});

test("selection follows presented invoice order and removes duplicates", () => {
  const targets = [3, 1, 2, 1].map(id => ({ id, invoiceNumber: `TI-${id}`, customerName: "Customer" }));
  assert.deepEqual(orderedSelectedPostalIds(targets, [2, 3, 2, 1, 99]), [3, 1, 2]);
});

test("batch checks each invoice immediately before fetch and stops on first failure", async () => {
  const calls: string[] = [];
  const progress: number[] = [];
  const result = await printPostalInvoiceBatch([3, 1, 1, 2], {
    isStillEligible: async id => { calls.push(`check:${id}`); return id !== 1; },
    fetchPdf: async id => { calls.push(`fetch:${id}`); return new Blob(["%PDF-1.4"]); },
    submitPdf: async () => { calls.push("submit"); },
  }, count => progress.push(count));
  assert.deepEqual(calls, ["check:3", "fetch:3", "submit", "check:1"]);
  assert.deepEqual(progress, [1]);
  assert.deepEqual(result.submittedIds, [3]);
  assert.deepEqual(result.remainingIds, [1, 2]);
  assert.ok(result.error);
});

test("batch stops on helper failure without retrying or processing later invoices", async () => {
  const calls: string[] = [];
  const result = await printPostalInvoiceBatch([3, 1, 2], {
    isStillEligible: async id => { calls.push(`check:${id}`); return true; },
    fetchPdf: async id => { calls.push(`fetch:${id}`); return new Blob(["%PDF-1.4"]); },
    submitPdf: async () => { calls.push("submit"); if (calls.filter(call => call === "submit").length === 2) throw new Error("helper unavailable"); },
  });
  assert.deepEqual(calls, ["check:3", "fetch:3", "submit", "check:1", "fetch:1", "submit"]);
  assert.deepEqual(result.submittedIds, [3]);
  assert.deepEqual(result.remainingIds, [1, 2]);
  assert.equal(result.error, "helper unavailable");
});

test("PDF fetch uses the existing endpoint and rejects non-PDF responses", async () => {
  const requests: unknown[][] = [];
  const fetcher = (async (...args: unknown[]) => { requests.push(args); return new Response("%PDF-1.4", {
    headers: { "Content-Type": "application/pdf; charset=binary" },
  }); }) as typeof fetch;
  assert.equal((await fetchInvoicePdfForPrint(7, fetcher)).size, 8);
  assert.deepEqual(requests, [["/api/invoices/7/pdf", { cache: "no-store" }]]);
  await assert.rejects(fetchInvoicePdfForPrint(7, (async () => new Response("wrong", {
    headers: { "Content-Type": "application/pdfx" },
  })) as typeof fetch));
  await assert.rejects(fetchInvoicePdfForPrint(7, (async () => new Response("missing", { status: 404 })) as typeof fetch));
});

test("fixed helper receives raw PDF and only its explicit submission result counts", async () => {
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  const requests: unknown[][] = [];
  const fetcher = (async (...args: unknown[]) => { requests.push(args); return Response.json({ submitted: true, printer: "NEC MultiWriter 5750C" }); }) as typeof fetch;
  await submitInvoicePdfToFixedPrinter(pdf, fetcher);
  assert.equal(requests[0][0], "http://127.0.0.1:5750/print");
  assert.deepEqual(requests[0][1], { method: "POST", headers: { "Content-Type": "application/pdf" }, body: pdf });
  for (const response of [
    Response.json({ submitted: false, printer: "NEC MultiWriter 5750C" }),
    Response.json({ submitted: true, printer: "another printer" }),
    new Response("uncertain"),
    new Response("failed", { status: 503 }),
  ]) await assert.rejects(submitInvoicePdfToFixedPrinter(pdf, (async () => response) as typeof fetch));
  await assert.rejects(submitInvoicePdfToFixedPrinter(pdf, (async () => { throw new Error("offline"); }) as typeof fetch), /helper/);
});

test("postal target endpoint requires admin and rechecks Task207E state", () => {
  const route = readFileSync("src/app/api/invoices/postal-print-targets/route.ts", "utf8");
  assert.match(route, /requireAdminApi\(\)/);
  assert.match(route, /if \(unauthorized\) return unauthorized/);
  assert.match(route, /status: \{ in: \["issued", "paid"\] \}/);
  assert.match(route, /customer: \{ type: "business" \}/);
  assert.match(route, /getInvoiceDeliveryState\(prisma, invoice\.id\)/);
  assert.match(route, /isPostalInvoicePrintTarget\(invoice, states\[index\]\)/);
});
