# Task208B — Repair prepayment backend and Stripe Checkout

Production: pending

## Scope

- Reuse the Task208A `Payment(kind=REPAIR_PREPAYMENT, repairId, purpose)` foundation. No schema, migration, RLS, or GRANT change.
- Authenticated Admin `POST /api/repairs/[id]/prepayments` accepts only `amount` and `purpose`. The server locks the Repair, reloads its customer, checks B2C and a customer access token, and creates one pending Stripe/CARD JPY payment without an allocation. The same pending request is reused; a different pending request returns 409. Database uniqueness and Prisma concurrency errors fail closed.
- Admin creation accepts integer amounts from 50 through 99,999,999 JPY. [Stripe's currency limits](https://docs.stripe.com/currencies) list a 50 JPY minimum charge and an eight-digit maximum for JCB, Diners Club, and Discover cards processed by Japanese Stripe accounts. This card-only flow uses the common valid range, so an unusable Payment is rejected before storage.
- Customer `POST /api/customer/repairs/[token]/prepayments/[paymentId]/checkout` accepts either that Repair's token or its EstimateDocument token. The server verifies Payment/Repair/customer binding, the same 50–99,999,999 JPY card amount range used at admin creation, purpose, method, provider, status, currency, and zero allocations. The browser supplies no charge parameters.
- Checkout Session creation uses Stripe card payment mode. Metadata binds `paymentKind`, `repairId`, `customerId`, `paymentId`, and `paymentAttemptId`. A fixed `NEXT_PUBLIC_APP_URL` or `NEXTAUTH_URL` origin supplies success/cancel URLs. Neither public token nor secret is placed in metadata.
- A Payment row lock reserves/reuses a pending PaymentAttempt. Open, unpaid Sessions with URLs are reused; any retrieved paid Session or complete Session blocks another Checkout without canceling the attempt. Expired, unpaid attempts are canceled while Payment remains pending. An attempt without a stored Session ID retries with its original idempotency key and the same DB-derived charge parameters. A newly returned Session ID is saved for webhook recovery before any paid/complete-state check; paid or complete Sessions return 409 without exposing a Checkout URL. Unknown results at least 23 hours old require manual reconciliation because Stripe may prune idempotency keys after 24 hours ([Stripe reference](https://docs.stripe.com/api/idempotent_requests)). Stripe API or persistence uncertainty retains pending state for retry. Checkout never marks a Payment paid.
- Success and cancel URLs use `EstimateDocument.publicToken` when present, falling back to `Repair.publicToken`. Both authorized token callers therefore produce identical Stripe creation parameters for one PaymentAttempt and return to the grouped estimate page when it exists.
- The existing signed raw-body webhook route delegates to a kind-aware settlement helper. Paid prepayments require exact metadata, Repair/customer binding, CARD/Stripe/JPY, amount and PaymentIntent consistency, and no allocations. Settlement and idempotent replay occur under a Payment row lock in one transaction. Legacy invoice metadata without `paymentKind` remains accepted.

## Validation

- Prisma validate: PASS with nonconnecting placeholder URL environment variables; no database access.
- TypeScript `npx tsc --noEmit`: PASS.
- Focused prepayment, invoice payment, and webhook tests: 58/58 PASS with mocked Stripe and Prisma. This includes the four admin amount boundaries, Checkout rejection of out-of-range stored Payments before Stripe calls, canonical return URLs for both token callers and the fallback, and paid-state fail-safe cases for retrieved and newly created Sessions.
- `git diff --check`: PASS.
- `npm run build`: PASS; 57/57 static pages and both new API routes included.
- No real Stripe request or customer send was performed.

## Boundaries

Task208C UI, final invoice application, refunds, LINE send, natural-language orchestration, production DB work, deploy, and push remain outside this task. The code is left uncommitted for independent review. A stable configured application origin is required before Checkout is available; without one the route returns 503. No live Stripe payment has been verified.
