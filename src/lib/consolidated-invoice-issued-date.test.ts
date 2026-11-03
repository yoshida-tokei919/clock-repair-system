import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatIssuedDate, parseIssuedDate, resolveIssuedDate } from "./document-issued-date";

test("bundle issue date defaults to the current Japanese calendar date", () => {
  assert.equal(formatIssuedDate(resolveIssuedDate(undefined, new Date("2026-11-03T14:59:00Z"))), "2026-11-03");
  assert.equal(formatIssuedDate(resolveIssuedDate(undefined, new Date("2026-11-03T15:00:00Z"))), "2026-11-04");
});

test("bundle issue date accepts only real YYYY-MM-DD dates", () => {
  assert.equal(formatIssuedDate(parseIssuedDate("2028-02-29")), "2028-02-29");
  for (const value of ["2026-02-29", "2026-13-01", "2026-1-01", "2026-01-1", "2026-01-01T00:00:00Z", null]) {
    assert.throws(() => parseIssuedDate(value));
  }
});

test("issue-state migration preserves the existing PDF date without mutating audit rows", () => {
  const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20261103_add_consolidated_invoice_issue_state/migration.sql"), "utf8");
  const auditSql = readFileSync(resolve(process.cwd(), "prisma/migrations/20261013_z_add_consolidated_invoice/migration.sql"), "utf8");
  assert.match(auditSql, /CREATE TRIGGER "ConsolidatedInvoice_immutable"[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(sql, /INSERT INTO public\."ConsolidatedInvoiceIssueState"[\s\S]*SELECT "id", "createdAt" FROM public\."ConsolidatedInvoice"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE/);
  assert.doesNotMatch(sql, /(?:UPDATE|ALTER TABLE|DELETE FROM|TRUNCATE)\s+public\."ConsolidatedInvoice"(?:\s|;)/i);
  assert.doesNotMatch(sql, /DISABLE TRIGGER|reject_consolidated_invoice_mutation/i);
});

test("date edit updates only issue state after publication and state locks", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/invoices/consolidated/[id]/issued-date/route.ts"), "utf8");
  assert.ok(route.indexOf('FROM "ConsolidatedInvoice"') < route.indexOf('FROM "ConsolidatedInvoiceIssueState"'));
  assert.ok(route.indexOf('FROM "ConsolidatedInvoiceIssueState"') < route.indexOf('consolidatedInvoicePublication.findUnique'));
  assert.match(route, /if \(publication\) throw/);
  assert.match(route, /consolidatedInvoiceIssueState\.update/);
  assert.doesNotMatch(route, /tx\.consolidatedInvoice\.update/);
});

test("PDF publication rechecks the locked issue-state date", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/invoices/consolidated/[id]/pdf/generate/route.ts"), "utf8");
  assert.match(route, /FROM "ConsolidatedInvoiceIssueState"[\s\S]*FOR UPDATE/);
  assert.match(route, /stateRows\[0\]\.issuedDate\.getTime\(\) !== bundle\.issueState!\.issuedDate\.getTime\(\)/);
});
