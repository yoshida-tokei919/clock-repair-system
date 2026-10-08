# Task208C — Repair prepayment (前受金) UI

Production: pending

## Scope

- Repair detail loads only its `REPAIR_PREPAYMENT` (前受金) rows, newest first, and shows received total, pending amount, status, purpose, amount, and dates. B2C Admins can create a prepayment request through the existing Task208B POST API after confirming amount and purpose. An existing pending request hides the creation form. B2B creation is unavailable.
- The B2C customer Repair share page loads only pending and succeeded prepayments (前受金). Pending rows start the existing Task208B Checkout endpoint with the page token and Payment ID. The return query shows a provisional message; payment status comes from the server after webhook settlement.
- No invoice balance is calculated on the Repair share page. Only confirmed received prepayments are described as received at final settlement; a pending request is not described as already received.

## Boundaries

No schema, migration, RLS, GRANT, Stripe settlement, webhook, invoice allocation or balance, LINE, refund, or production change. No real Stripe request, prepayment creation, customer send, push, or deploy was performed. Pending requests cannot be edited or canceled from this UI.

## Validation

- `npx tsx --test src/lib/repair-prepayment.test.ts src/lib/repair-prepayment-checkout.test.ts src/lib/repair-prepayment-display.test.ts src/lib/invoice-payment.test.ts src/lib/stripe-webhook-payment.test.ts`: 61/61 PASS.
- `npx tsc --noEmit`: PASS after offline `npm ci` and Prisma Client generation.
- `npm run build`: PASS, including Prisma generation, Next compilation, type checking, and 57/57 static pages.
- `git diff --check`: PASS.

No live Checkout or webhook result was tested; UI state follows the existing Task208B APIs and persisted Payment rows.
