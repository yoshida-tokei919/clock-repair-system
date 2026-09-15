import assert from "node:assert/strict";
import test from "node:test";

import { buildInvoicePdfStorageKey } from "./invoice-pdf-storage-key";

test("invoice PDF storage keys include a unique UUID", () => {
  const firstKey = buildInvoicePdfStorageKey(1, 2);
  const secondKey = buildInvoicePdfStorageKey(1, 2);

  assert.match(
    firstKey,
    /^invoices\/1\/2-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i,
  );
  assert.notEqual(firstKey, secondKey);
});
