# Task208D — B2C invoice prepayment allocation

## Local implementation

- `PaymentAllocation` now has a `(paymentId, invoiceId)` unique key. The migration only drops the former paymentId unique index and creates the composite unique index. It changes no RLS, GRANT, REVOKE, trigger, or function.
- Current B2C invoice creation only offers and accepts succeeded prepayments whose `repairId` belongs to the selected invoice Repairs. The model can hold a split Payment balance, but this flow does not allocate it to an unrelated Repair's invoice.
- The B2C bulk invoice flow previews each customer group's repair gross, received prepayments, available prepayments, proposed allocation, and invoice amount after allocation. Admin can adjust each suggested amount before explicit confirmation. Issue, Repair claim, and allocations share one transaction per invoice; Payments are locked by ascending ID and revalidated. Application transaction and Payment row locks are the capacity guard for this workflow.
- Invoice Payment creation uses the outstanding balance. Stripe Checkout uses that Payment amount, and webhook settlement checks the exact residual against other successful allocations under the Invoice lock. Prepayment Checkout and webhook settlement remain separate.
- Admin/customer summaries distinguish the amount billed after prepayment from the current unpaid balance; newly generated B2C PDFs show the same gross, applied prepayment, and amount billed. Existing stored PDFs remain immutable. Voiding still rejects any invoice with an allocation. Refund and allocation reversal are for Task208E.

## Validation and rollout boundary

- Independent final validation reported Prisma validate PASS, `npx tsc --noEmit` PASS, and `git diff --check` PASS.
- Focused tests PASS 74/74 across `prepayment-allocation`, `invoice-payment`, `stripe-webhook-payment`, `repair-prepayment`, `repair-prepayment-checkout`, and `repair-prepayment-display`.
- `npm run build` PASS, including Next.js static pages 57/57.
- Independent review identified an overly broad migration and cross-Repair eligibility; both were corrected before final validation. No blocking finding remains.
- Production rollout was completed after explicit user approval. No real Stripe request, refund, or customer communication was performed during rollout.

## Production completion — 2026-10-08

- Pre-migration logical backup: `C:\Users\yoshi\clock-repair-system-backups\task208d-20261008-233043` (`roles.sql`, `schema.sql`, `data.sql`).
- Supabase production migration: `20261008143248 add_split_prepayment_allocations` on project `vpyjonjfpkpbvvjufbiu`.
- Post-migration verification: `Payment`, `PaymentAllocation`, and `PaymentAttempt` remained at 0 rows; `PaymentAllocation_paymentId_invoiceId_key` exists as the expected composite unique index; the former `PaymentAllocation_paymentId_key` is absent.
- Supabase Security Advisor remained at the same pre-existing INFO findings; Task208D introduced no new blocking finding.
- Application implementation commit: `e0680c07767813a23573bbe27ff521628574ddea` (`feat: apply prepayments to invoice balances`).
- Railway production deployment: `f147dba5-6909-41f0-b7b4-c846269300c5`, SUCCESS in region `sin`, for commit `e0680c0`.
- Production smoke: `/` 200, `/login` 200, unauthenticated `/repairs` 307 to sign-in, invalid `/customer/invoices/<token>` 404. No live Stripe checkout/payment was invoked.
