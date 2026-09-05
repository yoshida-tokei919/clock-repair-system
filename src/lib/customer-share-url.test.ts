import assert from "node:assert/strict";
import test from "node:test";

import { buildCustomerShareUrl } from "./customer-share-url";

test("uses NEXT_PUBLIC_APP_URL for customer share URLs and removes trailing slashes", () => {
  assert.equal(
    buildCustomerShareUrl(
      "/customer/repairs/token-123",
      "http://localhost:8080/api/documents/estimate/1/line",
      "https://yoshidawatchrepair.com///"
    ),
    "https://yoshidawatchrepair.com/customer/repairs/token-123"
  );
});

test("falls back to the request URL origin when NEXT_PUBLIC_APP_URL is unset", () => {
  assert.equal(
    buildCustomerShareUrl(
      "/customer/invoices/token-123",
      "http://localhost:3000/api/invoices/1/line",
      undefined
    ),
    "http://localhost:3000/customer/invoices/token-123"
  );
});
