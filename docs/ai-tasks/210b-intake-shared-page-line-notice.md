# Task210B — intake shared-page LINE notice

Production: complete.

## Scope

- B2C Inquiry-bound intake completion creates one `APPROVED` `LineManagerSendOutbox` per `RepairIntakeInvite`, keyed by `intake-shared-page-notice:{inviteId}`.
- The notice contains one shared-page URL built from the existing public token of the lowest-ID Repair in the intake/customer group. `sourceRepairId` stays null because the notice covers the group.
- Intake without a verified Manager mapping still completes. The existing mapping verification endpoint reconciles eligible used invites in the same transaction as mapping creation, under the shared LineUser lock.
- Eligibility checks the used, non-revoked Inquiry-bound invite, exact Inquiry/LineUser identity, linked B2C Customer, all Repairs under the same intake and Customer, complete Repair public tokens created at the exact invite `usedAt` millisecond, and a one-to-one promoted InquiryWatch set. Incomplete and pre-Task210A historical groups are skipped.
- The existing Windows sender and reconciliation own actual delivery and `CONFIRMED`; this Task does not call LINE or Push directly.
- Legacy EstimateDocument-token behavior and Task210A sharing behavior are unchanged.

## Validation

- Focused tests: notice 5/5 PASS, mapping 4/4 PASS, repair-intake 29/29 PASS, outbox 17/17 PASS, customer-share URL 2/2 PASS, Task210A grouped-share 6/6 PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `git diff --check`: PASS.
- `npx next build`: PASS outside the Codex sandbox. The earlier Codex-sandbox attempt was blocked by `spawn EPERM` before assertions/build compilation could complete.
- No schema, migration, RLS, GRANT, or env change.

## Production

- Application commit: `b696e46f1e4cc0bd8826dc467dc8458ff19e1347` (`feat: queue B2C intake shared page notice`).
- GitHub `main` was fast-forwarded from `ed5f6c9` to the application commit; no unrelated code change was mixed into Task210B.
- Schema / migration / RLS / GRANT / env change: none. Production DB backup was therefore not required.
- Railway application deployment: `aa9954d4-f861-44b1-89c0-efa0b53478ac` - SUCCESS, source `main@b696e46`, region `sin`.
- Railway build: Prisma Client generation PASS, Next.js compile / lint / type check PASS, static pages 59/59.
- Runtime: Next.js 15.5.27, Ready in 326ms.
- Production smoke: `/`=200, `/login`=200, `/repairs` unauthenticated=307, invalid `/customer/repairs/task210b-smoke-invalid-token`=404, unauthenticated `POST /api/internal/line-manager-mapping/verify`=401.
- Railway HTTP logs for the smoke window had no 5xx responses and `upstreamErrors` was empty.
- No real customer token was used. No LINE send, outbox creation, customer-data mutation, Stripe action, or other production data mutation was performed during smoke.
- Production tag: production-task210b-20261012.
