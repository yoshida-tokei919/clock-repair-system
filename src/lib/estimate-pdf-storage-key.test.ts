import assert from "node:assert/strict";
import test from "node:test";

import { buildEstimatePdfStorageKey } from "./estimate-pdf-storage-key";

test("estimate PDF storage keys are unique and preserve the document path", () => {
  const params = { estimateDocumentId: 5, pdfFileId: 7 };
  const first = buildEstimatePdfStorageKey(params);
  const second = buildEstimatePdfStorageKey(params);

  assert.notEqual(first, second);
  assert.notEqual(first, "estimates/5/7.pdf");
  assert.match(first, /^estimates\/5\/7-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/);
  assert.match(second, /^estimates\/5\/7-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/);
});
