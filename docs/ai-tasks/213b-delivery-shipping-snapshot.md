# Task213B — Delivery-note shipping snapshot and invoice reflection

Production: pending

## Scope and financial semantics

- A new delivery note requires an explicit shipping decision at issuance: Japan Post/Yu-Pack, Yamato/TA-Q-BIN, or no shipping. Carrier shipping requires a positive size and an explicitly entered nonnegative customer charge; zero remains valid for shop-paid shipping. No shipping records a zero charge with null carrier, service, and size.
- `DeliveryNote.shippingFee` is the final customer charge in JPY, already tax-included. `shippingCalculatedFee` stays null until Task213C. The delivery PDF continues to add shipping after the repair subtotal tax. Repair tax and delivery-note `totalAmount`/`taxAmount` remain repair-only.
- Invoice creation sums each distinct DeliveryNote shipping charge once. `Invoice.shippingFeeAmount` is a separate issued amount and `grossTotalAmount = totalAmount + taxAmount + shippingFeeAmount`. Each `InvoiceRepairSnapshot.deliveryShippingFee` stores the note charge as issued, including repeated values for repairs sharing one note. Consistency checks deduplicate by note and reject conflicting values.
- A linked DeliveryNote with null shipping charge blocks invoice preview and issuance until admin confirmation. Repairs without a DeliveryNote retain zero-shipping behavior where issuance is otherwise permitted. The PDF shows shipping separately when nonzero; B2B note-group rows continue to show repair pre-tax subtotal.
- The B2B monthly preview counts shipping once per selected DeliveryNote after repair tax. Selected notes with unconfirmed shipping show an admin warning and block issuance. A single delivery issue action accepts repairs from one customer only, so one charge decision cannot be copied to other customers.
- Consolidated invoice sources snapshot each source invoice's shipping amount. Their database gross invariant includes that amount; the bundle still sums the source gross totals.
- Post-issue admin shipping changes take a DeliveryNote row lock and fail closed if any linked Invoice or InvoiceRepairSnapshot exists, including history after voiding. No Shipment record is changed.

## Migration and rollout

Migration: `prisma/migrations/20261015_add_delivery_shipping_snapshot/migration.sql`.

- Existing DeliveryNote shipping fees remain `NULL`; Estimate.shipping is deliberately not used for backfill. Existing invoices, repair snapshots, and consolidated invoice sources receive zero defaults. Nonnegative fee and positive size constraints are included. In one transaction, the existing `ConsolidatedInvoiceSource_gross_matches_parts` constraint is replaced with `gross = total + tax + shipping`; legacy rows remain valid with zero shipping.
- The migration adds columns to existing server-owned tables and creates no table. No new Data API role GRANT is required. RLS and GRANT are unchanged.
- Task213C owns the outbound fare master, B2B customer defaults, and B2C address-based calculation. This task does not calculate rates or implement a Yamato adapter.
- Before production: take a backup, apply the reviewed migration, deploy the committed application, then smoke-test invoice and delivery flows. None of these production steps are part of this local implementation.

## Local verification

- Prisma schema validation and `npx tsc --noEmit --incremental false --pretty false` passed. Prisma client generation updated TypeScript declarations but could not replace the locked Windows engine DLL (`EPERM`), including outside the process sandbox. Production build must complete its normal Prisma generation before deployment.
- Local Node tests required process-sandbox escalation because the default runner hit `spawn EPERM`. The six focused shipping/snapshot tests and 55 directly impacted consolidation, PDF publication, payment, prepayment, and void tests then passed.
- `git diff --check` passed. Migration was reviewed as additive SQL; it was not applied to production.

Independent-review corrections: the consolidated-source constraint and snapshot, B2B monthly preview, and single-customer delivery issue guard were amended locally. Focused tests: 15 passed; Prisma schema validation and TypeScript passed. Prisma generation remains blocked by the locked Windows engine DLL (`EPERM`). The migration remains un-applied; no table, GRANT, or RLS change was added.
