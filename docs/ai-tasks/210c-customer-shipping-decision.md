# Task210C — customer shipping decision

Production: complete.

## Scope and behavior

- One B2C `RepairIntakeInvite` and Customer is the decision boundary. A mixed group has at least two Repairs, at least one `作業完了` Repair, and at least one incomplete Repair.
- Admin explicitly creates one request intent from a Repair LINE panel. The server resolves the intake, Customer, original Inquiry and verified LineManagerChat; validates every public token and the one-to-one InquiryWatch promotion; rejects active outbound Shipments; and queues one `APPROVED LineManagerSendOutbox` with key `intake-shipping-decision-request:{inviteId}`. No direct LINE send occurs.
- `RepairIntakeShippingDecision` has one row per invite. `RepairIntakeShippingDecisionRepair` freezes the exact member Repair IDs and `completedAtRequest` classification through foreign keys. A composite FK requires each snapshot Repair to retain the same intake ID; `Repair.id` remains the primary key. No ID list is trusted from the browser or kept as JSON.
- A new request requires the current mixed group and verified LINE mapping. An existing request remains valid after an unfinished Repair becomes complete: its snapshot does not expand, duplicate Admin POST returns the same request, and customer GET/POST use the frozen classification. Existing requests do not require a currently verified LINE mapping for a customer answer.
- The existing `/customer/repairs/[token]` B2C Repair-token page identifies every snapshot Repair by inquiry number and marks which Repairs were complete when requested. EstimateDocument-token, B2B and unrelated Repair pages do not get that control.
- Customer POST resolves the opaque Repair public token server-side, verifies exact intake/Customer membership, intact snapshot, uncancelled outbox and no active outbound Shipment, then writes one choice. Same-choice repeat is idempotent; a different choice or structural conflict returns 409. Task210C does not change Shipment or Repair status.
- The prior per-Repair completion LINE request and Repair delivery-preference page are gated while a multi-Repair intake is currently mixed, or once a Task210C request exists. An all-complete multi-Repair intake without a Task210C request retains the Task203 flow until Task210D.

## Storage and security

- Migration source: `prisma/migrations/20261012_z_add_intake_shipping_decision/migration.sql`.
- Migration adds `Repair(id, repairIntakeInviteId)` uniqueness as the composite FK target, without changing the `Repair.id` primary key.
- Both new tables are server-only, RLS enabled with no policies. `PUBLIC`, `anon`, `authenticated` and `service_role` table privileges are explicitly revoked; there is no Data API GRANT and no sequence.
- The request and response paths use serializable transactions. The request locks LineUser, Customer, invite and member Repairs; rechecks eligibility before creating the snapshot and outbox. Client IDs and choice scope are never trusted.
- The public URL contains only an existing Repair public token. Unexpected route errors use generic logging so URL and token values do not enter logs.

## Independent review

- Codex implemented Task210C. Katari performed the independent schema / migration / security / boundary review.
- Initial review found three blocking issues: completion status drift incorrectly invalidated the request-time snapshot, the customer UI did not identify the frozen completed subset, and the Task203 compatibility guard suppressed every multi-Repair intake rather than only a mixed intake or an intake with an existing Task210C decision.
- Codex corrected those findings. The follow-up review also strengthened snapshot membership with a composite foreign key from `(repairId, repairIntakeInviteId)` to `Repair(id, repairIntakeInviteId)`.
- Follow-up review found no remaining blocking issue within Task210C before production approval.

## Validation before production

- Focused Task210C and adjacent regression: 34/34 PASS.
- `npx prisma validate`: PASS.
- `npx prisma generate`: PASS after stopping the local `next dev` process that held the Prisma query-engine DLL.
- `npx tsc --noEmit --incremental false`: PASS.
- `npx next build`: PASS — Next.js 15.5.27, compile / lint / type check PASS, static pages 59/59.
- `git diff --check`: PASS.

## Production

- User explicitly approved the Task210C production migration and deployment on 2026-10-12.
- Application commit: `6b743d23b60e5678ceaa53ca850cc6857d4381f0` (`feat: add B2C intake shipping decision`).
- GitHub `main` was fast-forwarded from `9145e4702604b44ff295087452c8f746f4da414c` to the application commit; no unrelated application change was mixed into Task210C.
- Pre-migration production backup: `C:\Users\yoshi\clock-repair-backups\task210c-20261012-203219`.
  - Read-only `RepeatableRead` logical snapshot using Railway production environment credentials without displaying secret values.
  - 82 public base tables, 1,436 rows, 85 backup files.
  - Manifest contained 84 payload entries and all SHA256 checks passed with 0 mismatches.
- Supabase production migration: `20261012113346 add_intake_shipping_decision` — applied successfully to project `vpyjonjfpkpbvvjufbiu`.
- Post-migration read-back:
  - `RepairIntakeShippingDecision` exists, row count 0 before smoke, RLS enabled.
  - `RepairIntakeShippingDecisionRepair` exists, row count 0 before smoke, RLS enabled.
  - `RepairIntakeShippingChoice` contains `SHIP_COMPLETED` and `WAIT_ALL`.
  - `Repair_id_repairIntakeInviteId_key` and `RepairIntakeDecisionRepair_membership_fkey` exist with the intended composite boundary.
  - `PUBLIC`, `anon`, `authenticated`, and `service_role` have no table privileges on either new table.
- Supabase Security Advisor baseline changed from 21 to 23 INFO entries only because the two new server-only tables intentionally have RLS enabled and no policies. No Data API grant or public policy was added.
- Railway application deployment: `38234190-73c1-4bde-80c1-1a462e8ac76f` — SUCCESS, source `main@6b743d2`, region `sin`.
- Railway build: Prisma Client generation PASS, Next.js compile / lint / type check PASS, static pages 59/59, image export/push PASS.
- Runtime: Next.js 15.5.27, Ready in 323ms.
- Production smoke:
  - `/` = 200.
  - `/login` = 200.
  - `/repairs` unauthenticated = 307 to sign-in.
  - invalid `/customer/repairs/task210c-smoke-invalid-token` = 404.
  - invalid `GET /api/customer/intake-shipping/task210c-smoke-invalid-token` = 404.
  - unauthenticated `GET /api/repairs/1/shipping-decision` = 401.
- Railway HTTP logs for the smoke window showed the expected statuses and empty `upstreamErrors` for all smoke requests. Existing n8n / LINE sender periodic endpoints remained 200 during the same window.
- Post-smoke read-back kept both new Task210C tables at 0 rows. No real customer token was used, and no LINE send/outbox creation, Shipment mutation, Stripe action, or customer-data mutation was performed during smoke.
- Production tag: `production-task210c-20261012`.
