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
- No production migration, database mutation, deployment, push, real Stripe request, refund, or customer communication was performed.
