# Task208E — payment refunds, allocation release, and reconciliation

Production: pending. This worktree contains one Task208E implementation commit only; the migration has not been applied, and no live Stripe call or customer communication was made.

## Ledger and accounting

- A succeeded `Payment` stays `SUCCEEDED`. `PaymentRefund` holds each partial refund independently. `PENDING` and `SUCCEEDED` refunds consume refund capacity; only `SUCCEEDED` reduces an invoice payment's paid contribution. `FAILED` and `CANCELED` free capacity. A Payment may have at most one `PENDING` refund at a time, enforced both under the Payment lock and by a partial unique DB index, so an unresolved provider result must be reconciled before another refund can start.
- `PaymentAllocation` remains intact. `PaymentAllocationRelease` records positive partial releases; effective allocation is original amount less successful release rows. Prepayment refund capacity subtracts both effective allocations and reserved/succeeded refunds. Invoice balance uses effective prepayment allocations and net invoice payments.
- Every capacity-changing operation re-reads under a `Payment` row lock. Invoice operations take the `Invoice` lock before `Payment` locks. Invoice void locks all contributing Payments in ID order, blocks pending payments/refunds and any unrefunded succeeded invoice payment, appends releases for every remaining effective allocation, marks the invoice void, and releases Repairs atomically. It never initiates a refund.
- Manual bank refund recording is admin-only and creates a succeeded refund after revalidation. It records money already returned outside the app; it does not send money.

## Stripe and pending cancellation

- Stripe refund creation first commits a durable `PENDING` refund with a random idempotency key. It then uses the succeeded PaymentAttempt's PaymentIntent. Provider ID/status is persisted after the call. Any thrown provider error, including an apparent auth or invalid-request rejection, keeps the row pending and returns `reconciliationNeeded: true`: a concurrent same-key call may have been accepted. A returned refund object with an external refund ID and `failed`/`canceled` status may become terminal and release capacity. Admin reconciliation retrieves by external refund ID, or repeats `create` with the **same** stored key, amount, PaymentIntent, and metadata. A no-ID unknown result older than 23 hours is held for manual provider reconciliation because Stripe may prune idempotency keys after 24 hours.
- Pending prepayment cancellation checks every known Checkout Session. Open unpaid Sessions are expired at Stripe and the expired/unpaid response must be confirmed. Paid/complete, missing Session ID with an attempt, transport uncertainty, or a changed Payment/attempt state blocks cancellation. The cancellation reason, admin ID, and time are stored on Payment.
- Invoice Checkout and webhook settlement use effective allocations and succeeded refunds. Pending refunds block new invoice payments; settlement rejects a stale residual. Invoice Checkout now reserves/reuses at most one pending Stripe attempt under the Payment lock. If Session creation or Session-ID persistence is uncertain, retry replays the exact same Checkout create parameters with the same stored idempotency key; an unknown no-ID attempt older than 23 hours is held for manual provider reconciliation instead of creating a possible duplicate Session.
- Voided/canceled invoices keep historical stored PDFs intact. Admin UI no longer offers regenerate/resend actions, the LINE route rejects void/canceled invoices server-side, and PDF generation rechecks invoice status under an Invoice row lock before publishing a newly rendered PDF as current.

## Security and migration

- `20261009_add_payment_refund_release` adds the refund enum, two server-only tables, positive amount checks, FKs, indexes, and Payment cancellation audit columns. It enables RLS on the new tables, creates no policies, explicitly revokes table and sequence privileges from `anon`, `authenticated`, and `service_role`, and adds no Data API grants. Existing Payment table security is unchanged.
- The repository's committed schema history is `prisma/migrations`, with no committed `supabase/` directory. Per the Task instruction, this migration follows the Prisma directory convention instead of the Supabase skill's usual `supabase migration new` workflow. No migration was applied to a local or production database.
- New refund/cancel/reconcile mutation routes look up an Admin by the authenticated session email, enforce strict request fields and positive integer yen where applicable, and never accept browser-reported balance or provider transaction identifiers.
- `/api/invoices` GET/POST now requires an authenticated Admin. Refund/release histories loaded for internal payment-status calculation are mapped back to the pre-existing minimal response shape instead of being serialized to the browser.

## Final-review findings fixed after commit 67daebd

- BLOCKING: Invoice Checkout could keep an unknown Session creation/persistence result as `PENDING` but had no executable replay path, leaving the payment stuck. Fixed with Payment-row-locked attempt reservation/reuse, exact idempotent replay, and a 23-hour safety cutoff.
- BLOCKING: void/canceled invoice LINE resend was hidden in UI but not rejected by the server route. Fixed with server-side invoice-status validation before any LINE provider call.
- BLOCKING: PDF generation checked invoice status only before rendering; a concurrent void could complete before PDF publication. Fixed by locking/rechecking Invoice status in the final publication transaction.
- BLOCKING: `/api/invoices` had no route-level Admin authorization, and Task208E's expanded read model could also serialize refund/release histories. Fixed by Admin authorization for GET/POST and explicit minimal response mapping.
- PRE-EXISTING / OUT OF TASK208E: other older APIs such as `/api/invoices/preview` and `/api/partners` still lack route-level Admin authorization. They were not changed by Task208E and require a separate security-hardening Task; do not silently expand this Task across unrelated endpoints.
- BLOCKING: concurrent same-key LINE calls could receive a non-accepted 4xx and an accepted response; the 4xx cleanup deleted their shared reservation before the accepted call could finalize. A non-accepted LINE response now leaves the durable reservation unresolved, returns an uncertain result, and retains the browser's operation key. Retries reuse the same `X-Line-Retry-Key`; accepted 409 responses and completed same-key replays finalize or confirm the original operation. A pending key cannot be replaced by a new send, and after 23 hours it requires manual verification. Only confirmed success clears the browser key, allowing an intentional later send with a new key. A truly rejected send may therefore remain pending until retry or manual verification.
- BLOCKING: the final PDF publication transaction could commit and still throw an uncertain driver error; the outer catch then deleted the live PDF object and voided its row. After a publication exception, a fresh transaction locks and reads the Invoice and new PDF row. A matching current pointer and storage metadata returns the normal success response. Only an unchanged draft with no current pointer is voided, followed by upload deletion. Inconsistent or unavailable read-back returns an explicit uncertain/manual-verification response and preserves the artifact. The draft-to-current update and cleanup update both guard the row state.
- BLOCKING: an older completed LINE operation key could be overwritten by a later intentional send and then treated as new after LINE's retry-key retention. Invoice now has a server-owned `lineSendRevision` (default 0). The admin invoice page passes only that revision to `InvoicePdfActions`, which persists it alongside the operation key before POST. Under the Invoice row lock, a new key requires the exact current revision; finalizing it increments the revision once. Current pending/completed same-key replay remains idempotent regardless of the submitted revision. After A succeeds and B succeeds from freshly loaded state, a late A retry carries its old revision and receives 409 before any provider call, including after the retry-key window. A stale tab receives an explicit reload error; it never automatically resends. The revision column is in the existing unapplied migration and adds no Data API grant.
- BLOCKING: concurrent same-key Stripe refund calls could yield one thrown rejection and one accepted result. The thrown path marked the shared ledger row `FAILED`, freeing capacity before the accepted result was saved. Thrown provider errors now leave the row `PENDING` without updating a concurrently completed result; reconciliation reuses the stored key. Only a returned, identified provider refund object can set `FAILED` or `CANCELED`.

## Validation after the fixes above

- `prisma validate`: PASS with placeholder local URL variables.
- TypeScript `tsc --noEmit`: PASS.
- Focused payment / prepayment / invoice / Stripe / Task208E safety regression set: 113/113 PASS.
- `git diff --check`: PASS.
- `npm run build`: PASS; Next.js compile/type validation PASS and static pages 57/57.
- Production DB read-only preflight on 2026-10-09 remains: `Payment`, `PaymentAllocation`, and `PaymentAttempt` are all 0 rows; no Task208E migration has been applied.

### Latest local validation after the LINE concurrency fix

- Focused LINE operation/send tests: 12/12 PASS, including mixed 4xx/accepted concurrent same-key calls, accepted 409 replay, the 23-hour cutoff, completed replay, and intentional resend.
- Broader Task208E test launch encountered Node `spawn EPERM` before assertions ran, including a serial test-runner attempt. A direct LINE send test run passed 9/9 and a direct refund test run passed 15/15; the rest of the broad suite remains unverified in this environment.
- `npx tsc --noEmit --incremental false` and Prisma validate with placeholder URLs: PASS.
- `git diff --check` and `npm run build`: PASS; Next.js compiled, type-checked, and generated 57/57 static pages.

### Latest local validation after the PDF publication fix

- Focused PDF publication/storage and Task208E safety tests: 12/12 PASS, including committed-but-thrown, proved rollback, inconsistent/unavailable read-back, normal success, void, and pending LINE guards.
- Broader 17-file Task208E test launch stopped before assertions with Node `spawn EPERM`; this is an execution-environment failure, not a test assertion failure. It was not retried with the same workaround.
- `npx tsc --noEmit --incremental false`, Prisma validate with placeholder URLs, `git diff --check`, and `npm run build`: PASS; Next.js generated 57/57 static pages.

### Latest local validation after the refund concurrency fix

- All 17 relevant Task208E test files passed when run individually, 144 tests in total. The final refund suite passed 18/18, including same-key concurrent rejection/acceptance, late rejection after success, returned `failed`/`canceled` objects, unknown-result replay, and the 23-hour no-ID cutoff. Some `tsx` launches hit `spawn EPERM` before assertions; those files passed through a direct TypeScript loader that does not spawn `esbuild`.
- `npx tsc --noEmit --incremental false`, Prisma validate with placeholder URLs, and `git diff --check`: PASS. No `tsconfig.tsbuildinfo` change was left in the worktree.
- `npm run build` was attempted three times. Prisma generation, Next.js compilation, lint, and type checking passed, but page-data collection failed on missing `.next` manifest files (`build-manifest.json`, then `server/middleware-manifest.json`) and finally `SyntaxError: Unexpected end of JSON input`. A full build PASS is therefore **not** claimed for this final fix.

### Latest local validation after the LINE revision fix

- LINE send 11/11 and browser-operation 3/3 PASS, including A -> B -> stale A after 25 hours, stale cross-tab revision, fresh-revision intentional resend, and single increment under concurrent accepted replies.
- Final orchestrator rerun of LINE operation/send, PDF publication, refund, invoice void, and Task208E safety suites: 50/50 PASS.
- Task208E safety 6/6, direct refund 17/17, PDF publication 5/5, and invoice void 7/7 PASS.
- `tsx` could not launch because esbuild child-process spawn returned `EPERM` before assertions. The tests above ran directly with `ts-node/register/transpile-only` instead.
- `npx tsc --noEmit --incremental false`, Prisma validate with placeholder URLs, and `git diff --check`: PASS. The first `npm run build` compiled and type-checked but hit a missing Next.js generated `functions-config-manifest.json` during page collection; a direct rerun completed successfully with 57/57 static pages.

## Rollout boundary and residual risk

- Codex implemented the main Task208E change set and separate implementation sessions handled the final safety fixes. A separate final Codex session reviewed the complete final filesystem read-only on 2026-10-09 and returned **PASS FOR COMMIT** with no blocking findings.
- The user explicitly approved the Task208E production rollout. Production backup, migration application/read-back, main integration/push, Railway deployment, and production smoke checks are the remaining rollout steps. No real refund or customer communication is part of the rollout smoke.
- An unknown Stripe refund or Invoice Checkout create result after the idempotency retention window cannot be replayed safely. Its durable pending state remains reserved until a human verifies the provider outcome; no duplicate provider operation is created automatically.
- Local tests use mocked Stripe and Prisma flows. Production database locking behavior and real Stripe transitions remain unverified until a separately approved rollout.
