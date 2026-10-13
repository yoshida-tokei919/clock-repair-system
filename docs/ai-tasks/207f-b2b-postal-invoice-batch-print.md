# Task207F — B2B postal invoice batch print

## Scope and safety

- The `/invoices` page lists active B2B invoices (`issued` or `paid`) that Task207E classifies as `POSTAL` and that have a stored current PDF. The admin-only target endpoint recomputes delivery state; the client requests the list again immediately before printing each selected invoice.
- The human selects invoices and starts the batch explicitly. Selection follows displayed invoice number/id order and deduplicates invoice IDs.
- Each invoice uses the existing `/api/invoices/<id>/pdf` response. The browser requires a successful `application/pdf` response and sends the raw blob to `http://127.0.0.1:5750/print` with `Content-Type: application/pdf`. The existing helper fixes the printer to `NEC MultiWriter 5750C`; no printer selection or QL-800 path is added.
- Printing is sequential. The first eligibility, PDF, helper, or uncertain-response failure stops the batch. The UI shows the number accepted by the helper and the number remaining, including the failed item. The operator decides whether to retry after checking the printer queue. Helper submission does not prove paper output.
- No Invoice, PDF, payment, or postal-delivery state is changed by printing. No schema, migration, or production DB operation is required. Task207E LINE routing and send contracts are unchanged.

## Validation

- Focused postal print, Task207E delivery routing, and delivery-note print-helper tests: 19 passed; no real printer call.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Real output from `NEC MultiWriter 5750C` is unverified and requires a separate hardware check.

## Production

Complete on 2026-10-13.

- Application commit: `cea7fcc`.
- Railway production deployment: `13ab5c66-fbbc-4604-9c7a-2303e8de6326` — SUCCESS (`sin`).
- Production build includes `/api/invoices/postal-print-targets`; compile / type validation / static generation 59/59 — PASS.
- Production smoke: unauthenticated `/api/invoices/postal-print-targets`=401 — PASS.
- No schema, migration, environment-variable, or production DB change; no production backup required.
- No real printer call was made during rollout. Actual paper output from `NEC MultiWriter 5750C` remains a hardware follow-up.
- Production tag: `production-task207f-20261013`.
