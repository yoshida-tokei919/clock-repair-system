import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { createDeliveryPrintServer, DELIVERY_PRINTER, printFixedDeliveryNote } from "./delivery-note-print-helper-core";

const origin = "https://clock.example.test";
const printed: Buffer[] = [];
const server = createDeliveryPrintServer(origin, async (pdf) => { printed.push(pdf); });
let url: string;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/print`;
});
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test("accepts only the configured browser origin and supports its private-network preflight", async () => {
  const denied = await fetch(url, { method: "POST", headers: { Origin: "https://other.example.test", "Content-Type": "application/pdf" }, body: "%PDF-1.4" });
  assert.equal(denied.status, 403);
  const noOrigin = await fetch(url, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: "%PDF-1.4" });
  assert.equal(noOrigin.status, 403);
  const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Private-Network": "true" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
  assert.equal(printed.length, 0);
});

test("rejects wrong media type, invalid PDF, and oversized body without printing", async () => {
  const headers = { Origin: origin, "Content-Type": "application/pdf" };
  assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: "%PDF-1.4" })).status, 415);
  assert.equal((await fetch(url, { method: "POST", headers, body: "not a pdf" })).status, 422);
  assert.equal((await fetch(url, { method: "POST", headers, body: Buffer.alloc(20 * 1024 * 1024 + 1, 37) })).status, 413);
  assert.equal(printed.length, 0);
});

test("submits a valid PDF body and reports the fixed printer", async () => {
  const response = await fetch(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/pdf" }, body: "%PDF-1.4\n%%EOF" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { printer: DELIVERY_PRINTER, submitted: true });
  assert.equal(printed.at(-1)?.toString(), "%PDF-1.4\n%%EOF");
});

test("printer adapter passes the exact printer and never omits it", async () => {
  let received: { path: string; printer: string } | undefined;
  await printFixedDeliveryNote("test.pdf", { print: async (path: string, options: { printer: string }) => {
    received = { path, printer: options.printer };
  } });
  assert.deepEqual(received, { path: "test.pdf", printer: "NEC MultiWriter 5750C" });
});

test("rejects an unsafe allowed origin at startup", () => {
  assert.throws(() => createDeliveryPrintServer("http://example.test", async () => {}));
  assert.throws(() => createDeliveryPrintServer("https://example.test/path", async () => {}));
});
