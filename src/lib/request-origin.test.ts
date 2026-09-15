import assert from "node:assert/strict";
import test from "node:test";

import { getRequestOrigin } from "./request-origin";

test("uses the inbound LAN Host instead of a localhost request URL", () => {
  const request = new Request("http://localhost:3000/api/customer/invoices/token/checkout", {
    headers: { host: "192.168.0.190:3000" },
  });
  assert.equal(getRequestOrigin(request), "http://192.168.0.190:3000");
});

test("uses the trusted proxy origin for production requests", () => {
  const request = new Request("http://localhost:3000/api/customer/invoices/token/checkout", {
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "yoshidawatchrepair.com",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(getRequestOrigin(request), "https://yoshidawatchrepair.com");
});

test("falls back to request.url for absent or invalid forwarded headers", () => {
  assert.equal(getRequestOrigin(new Request("http://localhost:3000/api/checkout")), "http://localhost:3000");
  const request = new Request("http://localhost:3000/api/checkout", {
    headers: { host: "localhost:3000", "x-forwarded-proto": "file" },
  });
  assert.equal(getRequestOrigin(request), "http://localhost:3000");
});
