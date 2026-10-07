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

The SQL constraints have not been applied to a database in this task; independent review is required before production migration.

Production: pending
