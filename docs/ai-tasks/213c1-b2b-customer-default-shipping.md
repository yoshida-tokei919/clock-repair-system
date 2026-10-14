# Task213C1 — B2B Customer default shipping charge

Production: pending

- Each business Customer (store), rather than B2BCompany, can save an optional carrier/service, size, and tax-included final customer charge. Supported pairs match Task213B: `JAPAN_POST/YU_PACK` and `YAMATO/TA_Q_BIN`. Zero charge is valid. All four values null means unconfigured; partial or invalid values are rejected by application validation and database constraints.
- The customer edit page exposes the fields for business customers. The delivery-note issue dialog initializes its shipping fields from the single selected business Customer. An admin still confirms or changes the charge at issuance. The Task213B server validation and invoice fail-closed rules remain authoritative.
- Existing Customers remain null. Existing DeliveryNotes and invoice snapshots are not backfilled or changed. This task does not add a rate table, calculate shipping, or change Shipment, consolidated invoice, prepayment, or Stripe behavior.
- Migration: `prisma/migrations/20261015_z_add_customer_default_shipping/migration.sql`. This adds nullable columns and business-only, complete-pair, and value constraints to the existing Customer table. It creates no table and changes no Data API GRANT or RLS policy. Its name sorts after the Task213B migration. Independent review is complete; production application requires backup and explicit approval.

## Local verification

- `npx prisma validate` passed. Regular `npx prisma generate` stopped with environment `spawn EPERM`; production build must run normal generation before deploy.
- `npx tsc --noEmit` passed. `git diff --check` passed.
- Focused tests: 18 passed across customer defaults, Task213B delivery shipping, invoice repair snapshots, B2B invoice preview, and consolidated invoice. The Node test runner and `tsx` stopped with environment `spawn EPERM`; compiling the tests to temporary CommonJS and running each compiled file directly succeeded. Temporary output was removed.
- Migration SQL was reviewed manually: four nullable Customer columns, no backfill or new table, transaction, business-only and complete-value checks, supported carrier/service pairs, positive size, and nonnegative fee. It was not applied. Independent review completed after one blocking finding was fixed and re-reviewed with no remaining blockers; production verification is pending.
- Review blocker fix: the Repair PATCH Customer update now clears all four defaults atomically when changing the type to `individual`; its `business` branch leaves existing defaults untouched. Targeted `npx tsc --noEmit --incremental false --pretty false`, three customer-default tests, and `git diff --check` passed. This large PATCH handler has no narrow executable test seam; the type-transition update was checked directly in the route diff. No database or production operation was run.
