import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("invoice Checkout recovery persists and reuses one locked attempt with identical Stripe return URLs", () => {
  const checkout = source("src/app/api/customer/invoices/[token]/checkout/route.ts");
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20261009_add_payment_refund_release/migration.sql");
  assert.match(checkout, /function ensurePendingStripeAttempt/);
  assert.match(checkout, /SELECT "id" FROM "Payment" WHERE "id" = \$\{paymentId\} FOR UPDATE/);
  assert.match(checkout, /payment\.attempts\.length > 1/);
  assert.match(checkout, /idempotencyKey: randomUUID\(\)/);
  assert.match(checkout, /idempotencyKey: attempt\.idempotencyKey/);
  assert.match(checkout, /checkoutOrigin: origin/);
  assert.match(checkout, /success_url: `\$\{attempt\.checkoutOrigin\}/);
  assert.match(checkout, /cancel_url: `\$\{attempt\.checkoutOrigin\}/);
  assert.match(checkout, /23 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(checkout, /getRequestOrigin/);
  assert.match(schema, /checkoutOrigin\s+String\?/);
  assert.match(migration, /ADD COLUMN "checkoutOrigin" TEXT/);
});

test("invoice LINE delivery uses only the approved Manager outbox", () => {
  const line = source("src/app/api/invoices/[id]/line/route.ts");
  const routing = source("src/lib/invoice-delivery-routing.ts");
  const schema = source("prisma/schema.prisma");
  const migration = source("prisma/migrations/20261009_add_payment_refund_release/migration.sql");
  assert.match(line, /queueInvoiceLineDelivery\(prisma/);
  assert.match(routing, /createApprovedLineManagerSendOutbox/);
  assert.doesNotMatch(line + routing, /api\.line\.me|LINE_CHANNEL_ACCESS_TOKEN|sentAt: new Date\(/);
  assert.match(schema, /lineSendRetryKey String\? @unique/);
  assert.match(migration, /Invoice_line_send_reservation_check/);
  assert.match(migration, /"lineSendRetryKey" IS NOT NULL AND "sentAt" IS NOT NULL AND "lineSendStartedAt" IS NULL/);
});

test("invoice PDF finalization rechecks status under an Invoice row lock", () => {
  const route = source("src/app/api/invoices/[id]/pdf/generate/route.ts");
  const pdf = source("src/lib/invoice-pdf-publication.ts");
  assert.match(route, /publishInvoicePdf\(prisma/);
  assert.match(route, /publication === "uncertain"/);
  const lock = pdf.indexOf('SELECT "status", "lineSendStartedAt" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE');
  const guard = pdf.indexOf('!["issued", "paid"].includes(lockedInvoice.status)');
  const lineGuard = pdf.indexOf('if (lockedInvoice.lineSendStartedAt)', guard);
  const publish = pdf.indexOf('SET "currentPdfFileId" = ${pdfFileId}');
  assert.ok(lock >= 0);
  assert.ok(guard > lock);
  assert.ok(lineGuard > guard);
  assert.ok(publish > lineGuard);
  const voidSource = source("src/lib/invoice-void.ts");
  assert.match(voidSource, /SELECT "id", "lineSendStartedAt" FROM "Invoice"/);
  assert.match(voidSource, /if \(rows\[0\]\.lineSendStartedAt\)/);
});

test("invoice list computes refunds and releases internally without serializing those histories", () => {
  const route = source("src/app/api/invoices/route.ts");
  assert.match(route, /const responseInvoice =/);
  assert.match(route, /paymentAllocations: invoice\.paymentAllocations\.map/);
  assert.match(route, /payment: \{ status: allocation\.payment\.status \}/);
  assert.doesNotMatch(route, /return \{ \.\.\.invoice, paymentStatus \}/);
});

test("invoice list and creation require Task209A Admin authorization before business access", () => {
  const route = source("src/app/api/invoices/route.ts");
  assert.match(route, /requireAdminApi/);
  const getGuard = route.indexOf("export async function GET()");
  const firstRead = route.indexOf("prisma.invoice.findMany", getGuard);
  assert.ok(route.indexOf("requireAdminApi()", getGuard) < firstRead);
  const postGuard = route.indexOf("export async function POST");
  const bodyRead = route.indexOf("req.json()", postGuard);
  assert.ok(route.indexOf("requireAdminApi()", postGuard) < bodyRead);
});

test("manual refund UI persists one operation key across an ambiguous retry", () => {
  const controls = source("src/components/invoices/InvoiceRefundControls.tsx");
  const route = source("src/app/api/payments/[id]/refunds/route.ts");
  assert.match(controls, /sessionStorage\.getItem\(storageKey\(payment\.id\)\)/);
  assert.match(controls, /sessionStorage\.setItem\(storageKey\(payment\.id\), JSON\.stringify\(operation\)\)/);
  assert.match(controls, /manualOperationKey: operation!\.manualOperationKey/);
  assert.match(route, /amount,manualOperationKey,mode,reason/);
});
