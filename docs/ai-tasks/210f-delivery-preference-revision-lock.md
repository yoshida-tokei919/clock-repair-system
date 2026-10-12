# Task210F — delivery preference revision / issue lock

Production: complete.

## Scope

- The shared B2C page shows every relevant Task210D group, including the saved `COMPLETED_AT_REQUEST` group after the flow advances to `REMAINING`. Each group shows its frozen inquiry numbers, saved answer, and its own editable or unavailable state.
- A changed grouped customer answer updates its saved `RepairIntakeDeliveryPreference` and the same exact active OUTBOUND/DRAFT Shipment in one Serializable transaction. Only a changed answer advances `respondedAt`. An exact retry remains idempotent and retains Task210E recovery of a missing DRAFT Shipment.
- A changed saved answer requires its own exact active DRAFT Shipment. Missing, overlapping, mismatched, or ambiguous active Shipments fail closed. READY and later active outbound states display the saved answer, disable editing, direct the customer to LINE, and reject a changed POST with 409.
- The existing Task203 single-Repair DRAFT revision and READY lock, and admin DRAFT-only Shipment PATCH, remain in force. Admin Shipment edits do not change customer-response records or `respondedAt`. A later customer revision while DRAFT can update Shipment delivery fields again.

## Boundaries

- No schema, migration, RLS/GRANT, environment, LINE, tracking, label issue or reissue, Shipment status transition, Repair status, StorageLocation, or PhysicalTag change.
- The public POST body accepts only `groupKind` and delivery preference fields. Group membership, Customer, and Repair IDs come from server validation and the existing frozen records.
- The existing DRAFT to READY transition on Yu-Pri Cloud issue request is the lock boundary. LABEL_ISSUED correction or reissue is a separate follow-up if needed.

## Validation

- Focused Task210D/E, Task203, and Shipment tests: 47/47 PASS, covering revision, group isolation and visibility, READY/LABEL_ISSUED lock, exact retry recovery, single-Repair regression, and admin DRAFT-only update.
- `npx tsc --noEmit --incremental false` and `git diff --check`: PASS.
- `npx next build`: PASS in the normal host environment (Next.js 15.5.27; compile, lint/type validation, and static generation 59/59). The earlier Codex sandbox `spawn EPERM` was environment-specific.
- Independent Katari review found no blocking issue. A follow-up regression strengthened two-group isolation by verifying that revising one `SHIP_COMPLETED` group leaves the other group's exact Shipment unchanged.

## Production completion — 2026-10-13 JST

- Application commit: `6666fdefbe97c883b77f41631967a6e413786e48` (`feat: allow delivery preference revisions`).
- Schema / migration / RLS / GRANT / environment diff: none. No production DB backup or migration was required.
- Railway production deployment: `28848983-df78-48ed-ac51-80ec860bffd6`, source `main@6666fdefbe97c883b77f41631967a6e413786e48`, region `sin`, status `SUCCESS`.
- Railway build: Prisma Client generation succeeded; Next.js 15.5.27 compiled successfully; lint/type validation completed; static generation `59/59` completed.
- Railway runtime: Next.js 15.5.27 started successfully and reported `Ready in 516ms`.
- Non-destructive production smoke: `/` = 200, `/login` = 200, unauthenticated `/repairs` = 307 to sign-in, invalid `/customer/repairs/task210f-smoke-invalid-token` = 404, invalid `/customer/delivery/task210f-smoke-invalid-token` = 404, invalid `/api/customer/intake-delivery/task210f-smoke-invalid-token` = 404, unauthenticated `/api/shipments/1` = 401.
- Railway HTTP logs matched the smoke responses with empty `upstreamErrors`. Existing LINE sender/reconciliation and n8n internal polling endpoints continued returning 200 during the same window.
- No real customer delivery answer, Shipment create/update, LINE send, Yu-Pri Cloud issue, label issuance, tracking mutation, Stripe action, or other customer-data mutation was performed during production smoke.
