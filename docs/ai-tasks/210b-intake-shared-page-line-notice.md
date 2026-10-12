# Task210B — intake shared-page LINE notice

Production: pending.

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
- Production remains pending. No push, deploy, migration application, or production action has been performed.
