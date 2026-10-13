# Task207E — B2B invoice delivery routing

## Scope and delivery contract

- Each B2B Invoice is a LINE normal-talk target only when exactly one `LineUser` is linked to its Customer, that user has a verified `LineManagerChat`, and an existing Inquiry for that same user can anchor the outbox. The latest OPEN Inquiry is preferred; otherwise the latest Inquiry is used. Missing, unverified, ambiguous, or mismatched identity routes to POSTAL.
- POSTAL means a visible print target for Task207F. Task207E does not print, mail, or mark postal invoices delivered.
- A human action on the invoice PDF page creates an `APPROVED` `LineManagerSendOutbox` using the fixed key `b2b-invoice-line:<invoiceId>`. It uses the current saved PDF prerequisite, the existing public invoice token/share URL, and the established invoice message. Browser retries cannot create a second outbox intent.
- The Windows sender and lineoa are the only normal-talk send path. `APPROVED` is queued, not sent. Only Manager history reconciliation can set `CONFIRMED` and create the OUTBOUND `InquiryMessage`. The invoice UI reports these states separately.
- Legacy `Invoice.sentAt` / `InvoicePdfFile.sentAt` are not updated when queueing. An invoice with a legacy sent or unresolved direct Push state is blocked from a new send intent.
- No invoice path calls Messaging API Push or needs `LINE_CHANNEL_ACCESS_TOKEN`. Legacy invoice direct Push implementation and browser operation helper were removed. B2C flows outside invoice delivery were not changed.
- Existing Invoice and Outbox tables are reused; no schema or migration.
- Invoice void and first PDF publication lock the Invoice, then lock its deterministic Outbox row with `SELECT ... FOR UPDATE` on `b2b-invoice-line:<invoiceId>`. `APPROVED`, `CLAIMED`, `PRE_SEND_FAILED`, and `POST_UNCONFIRMED` block either mutation while delivery is unresolved; unknown statuses also fail closed. `CONFIRMED` and `CANCELLED` permit mutation. The legacy `lineSendStartedAt` fence remains. A blocked PDF publication follows the existing rollback/read-back and draft cleanup path, preserving the previous current PDF.

## Validation

- Focused route, idempotency, APPROVED semantics, no-Push static, Outbox, invoice PDF publication, invoice void, and mutation-fence status/locking tests: 46 passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed for tracked changes.
- No real LINE send or production call.

## Production

Pending. No push, deployment, production DB operation, or migration in Task207E.
