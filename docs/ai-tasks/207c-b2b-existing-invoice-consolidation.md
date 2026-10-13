# Task207C — Existing B2B invoice consolidation

Production: pending. Task207C is committed locally only; migration, push, deploy, and production smoke remain pending the separately approved rollout.

## Contract

- `ConsolidatedInvoice` is an explicit, immutable historical billing bundle for one B2B company and its designated billing `Customer`. `companyId` is a scalar historical ID, without a foreign key, so a later one-store company dissolve cannot be blocked by the bundle. It snapshots the recipient name, company name, postal/address components, phone, email, and gross total.
- `ConsolidatedInvoiceSource` stores one immutable link per existing `Invoice`, with a database unique constraint on `invoiceId`. It snapshots invoice number, originating store identity, issue date, pre-tax total, tax, and canonical `Invoice.grossTotalAmount`.
- `ConsolidatedInvoiceDeliveryNote` snapshots the delivery-note ID/number, date, repair count and, only when `hasConsistentInvoiceSnapshots` proves the source subtotals match the invoice pre-tax total, a **pre-tax subtotal**. It never claims a tax-inclusive delivery-note total. Missing or inconsistent invoice snapshots leave the amount null. Each group is scoped to its source invoice and store.
- Bundle `grossTotalAmount` is the integer sum of selected source `Invoice.grossTotalAmount` values at creation. Live Repair and Estimate data do not contribute to this total.
- Original `Invoice`, `DeliveryNote`, `Repair`, `Shipment`, and their `customerId` values remain unchanged. Existing invoice issue, void, payment, PDF, and sending routes are unchanged.

## Creation and safety

- Admin selects two or more eligible existing invoices from the invoice page. This explicit selection excludes all others, allowing separate billing of a store or an invoice.
- The Admin API authenticates GET and POST. The POST transaction locks the company and each source invoice in ID order, then invokes Task207B `resolveEffectiveBillingCustomer` **inside** the transaction for every source. All must resolve to the requested same non-null company and designated billing customer. The submitted company and destination IDs detect stale UI selections.
- Issued or paid invoices alone are accepted; void/canceled invoices and already included sources fail. Serializable isolation and the unique `ConsolidatedInvoiceSource.invoiceId` constraint prevent concurrent duplicate inclusion. No cancel/release lifecycle is provided in this task.
- Database CHECK constraints enforce nonnegative amounts, source gross = pre-tax total + tax, positive delivery-note repair counts, and nonnegative optional delivery-note subtotals. Triggers reject UPDATE, DELETE, and TRUNCATE on all three audit tables. Deferred parent and source INSERT constraint triggers require at least two sources and an exact source gross sum at commit, including for direct SQL writers.
- The bundle represents the creation-time record. A later change to an original invoice's status does not rewrite the bundle snapshots; operational handling of later source voids requires a separate lifecycle task.

## Data API and migration

- Migration: `20261013_z_add_consolidated_invoice`.
- All three new tables are accessed only by server-side Next.js/Prisma. Data API access is unnecessary. RLS is enabled with no policy; `PUBLIC`, `anon`, `authenticated`, and `service_role` table/sequence privileges are explicitly revoked, with no `GRANT`.
- Production migration has **not** been applied. A production backup is required before applying it during rollout.

## Validation

- `prisma validate`: pass.
- `prisma generate`: Windows DLL unlink `EPERM`; `prisma generate --no-engine`: pass for local type validation.
- `tsc --noEmit`: pass.
- Five focused tests passed using in-process TypeScript transpilation. They cover same-company totals, cross-company, standalone/B2C, changed destination, stale/void selection, duplicate inclusion, and delivery-note grouping. The normal Node test runner and esbuild startup separately encountered environment `spawn EPERM`, not an assertion failure.
- `git diff --check`: pass.
- `next build`: blocked at environment `spawn EPERM` during compilation.

## Follow-up

The current snapshots allocate tax at the invoice level, so the delivery-note breakdown displays a pre-tax subtotal only when provable. Exact tax-inclusive delivery-note amounts require a separate financial allocation contract. A consolidated PDF, printing/mailing, payment matching, and any cancel/void lifecycle are intentionally deferred.
