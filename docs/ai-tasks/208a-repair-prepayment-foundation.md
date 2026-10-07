# Task208A — Repair prepayment data foundation

## Scope

- Reuse `Payment` with `PaymentKind`: existing/default `INVOICE` and future `REPAIR_PREPAYMENT`.
- Add nullable `repairId` and free-text `purpose`; retain existing `customerId`, amount, provider, method, status, dates, and attempts.
- Leave invoice `PaymentAllocation`, Checkout, webhook settlement, and invoice balance logic unchanged.

## Database invariants

- `INVOICE` has no Repair link or prepayment purpose. The `INVOICE` database default preserves existing rows and writers.
- `REPAIR_PREPAYMENT` requires a Repair and a nonblank purpose (including whitespace-only rejection); existing positive amount and paid-date checks still apply.
- Composite FK `(repairId, customerId)` → `Repair(id, customerId)` prevents a prepayment from naming another customer's Repair. `Repair(id, customerId)` is already unique. Repair customer reassignment is restricted while a linked prepayment record exists, preserving the historical customer binding.
- `(repairId, kind, status)` supports Repair payment lookup. A migration-only partial unique index permits at most one `PENDING` Repair prepayment per Repair, across all purposes. After `SUCCEEDED`, `FAILED`, or `CANCELED`, another can be created. Future Checkout creation must also handle this uniqueness conflict and retry/idempotency safely.

## Migration and security

`20261007_z_add_repair_prepayment_foundation` is additive: one enum, three Payment columns, one check, one FK, and two indexes. Existing Payment rows need no backfill. No new public table is created; existing Payment RLS/GRANT configuration is unchanged. The partial index is SQL-only because Prisma schema does not represent its predicate; future migrations must preserve it.

## Out of scope

Prepayment creation APIs, Stripe Checkout/webhook branching, admin/customer UI, final invoice allocation, refunds or refund status, production migration/deploy, and customer communication. `PaymentStatus` is unchanged. A prepayment cannot be charged by the application in this task. A future allocation task must guard `PaymentKind`; this foundation does not prevent a direct `PaymentAllocation` write for a prepayment.

## Validation

- `prisma validate`: PASS; Prisma 5.7 accepts the optional composite Repair relation.
- `prisma format`: PASS on a temporary schema copy. The repository schema retains its existing formatting to keep this diff minimal.
- Prisma Client generation: PASS directly and as part of `npm run build`.
- `tsc --noEmit`: PASS.
- Focused invoice payment and Stripe webhook tests: 29/29 PASS using `npx tsx --test`.
- `npm run lint`: the existing `next lint` command entered an interactive ESLint configuration prompt and exited without linting.
- `npm run build`: PASS on retry, including Prisma generation, Next compilation, type checking, and 57/57 static pages. The first run hit a missing generated `.next/build-manifest.json` during page collection.
- `git diff --check`: PASS.

## Production rollout — 2026-10-07

- Application commit: `b73553feeaba6c5a82c1da073c6f46c22cfc9d32` (`feat: add repair prepayment payment foundation`).
- Pre-migration logical backup: `C:\Users\yoshi\clock-repair-backups\task208a-20261007T143046Z` (`roles.sql` / `schema.sql` / `data.sql` / SHA256 `manifest.txt`).
- Supabase migration: `20261007143422 add_repair_prepayment_foundation`.
- Production verification: `Payment` remained 0 rows; `kind` default is `INVOICE`; `PaymentKind` values, CHECK constraint, composite Repair/customer FK with `ON UPDATE/DELETE RESTRICT`, lookup index, and one-pending-prepayment partial unique index all match the reviewed migration.
- Data API access remains unchanged: `anon` / `authenticated` / `service_role` have no table grants on `Payment`; no new table or GRANT was introduced.
- Supabase Security Advisor reported no Task208A-specific new security finding. Existing server-only `rls_enabled_no_policy` INFO findings remain unrelated. Performance Advisor reports the new composite FK as not having an exact covering `(repairId, customerId)` index; the Task index is led by `repairId`, `Payment` is currently empty, and no additional DDL was added in this rollout.
- Railway application deployment: `c9f8f1c1-5702-4ae7-9a06-e38464ba1b66` — `SUCCESS`, region `sin`.
- Railway build: Prisma generation / Next compile / type checking / static pages 57/57 PASS. Runtime `Ready in 325ms`.
- Production smoke: `/` = 200, `/login` = 200, `/repairs` unauthenticated = 307; observed HTTP `upstreamErrors` empty.
- No live Stripe call, real card payment, customer payment link send, or refund was performed.

Production: complete
