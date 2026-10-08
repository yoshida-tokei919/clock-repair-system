# Task208C — Repair prepayment (前受金) UI

Production: complete - 2026-10-08

## Scope

- Repair detail loads only its `REPAIR_PREPAYMENT` (前受金) rows, newest first, and shows received total, pending amount, status, purpose, amount, and dates. B2C Admins can create a prepayment request through the existing Task208B POST API after confirming amount and purpose. An existing pending request hides the creation form. B2B creation is unavailable.
- The B2C customer Repair share page loads only pending and succeeded prepayments (前受金). Pending rows start the existing Task208B Checkout endpoint with the page token and Payment ID. The return query shows a provisional message; payment status comes from the server after webhook settlement.
- No invoice balance is calculated on the Repair share page. Only confirmed received prepayments are described as received at final settlement; a pending request is not described as already received.

## Boundaries

No schema, migration, RLS, GRANT, Stripe settlement, webhook, invoice allocation or balance, LINE, or refund change. Pending requests cannot be edited or canceled from this UI. No real Stripe request, prepayment creation, card charge, refund, or customer send was performed during production verification.

## Validation

- `npx tsx --test src/lib/repair-prepayment.test.ts src/lib/repair-prepayment-checkout.test.ts src/lib/repair-prepayment-display.test.ts src/lib/invoice-payment.test.ts src/lib/stripe-webhook-payment.test.ts`: 61/61 PASS.
- `npx tsc --noEmit`: PASS after offline `npm ci` and Prisma Client generation.
- `npm run build`: PASS, including Prisma generation, Next compilation, type checking, and 57/57 static pages.
- `git diff --check`: PASS.
- No live Checkout or webhook result was tested; UI state follows the existing Task208B APIs and persisted Payment rows.

## Production rollout — 2026-10-08

- Application commit: `f80f406f85593e6d260cf71a122aaff4b285f122` (`feat: add repair prepayment UI`).
- Deploy source: GitHub `main` → Railway.
- Railway deployment: `30927e27-be5e-4ec8-8432-bd4feffa689b` — `SUCCESS`, region `sin`.
- Railway build: Prisma Client generation / Next compile / type checking / static pages 57/57 PASS.
- Runtime: Next.js 15.5.27, `Ready in 253ms`.
- Production smoke: `/`=200, `/login`=200, `/repairs` unauthenticated=307, invalid customer Repair share token=404; Railway HTTP logs showed empty `upstreamErrors` for the smoke requests and concurrent internal n8n / LINE worker requests.
- No schema / migration / RLS / GRANT / production DB mutation was required.
- No live prepayment creation, Stripe Checkout Session creation, card charge, refund, or customer send was performed.
- Production tag: `production-task208c-20261008` at the application commit.
