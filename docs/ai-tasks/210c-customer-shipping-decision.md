# Task210C — customer shipping decision

Production: pending. Production migration, deploy, production DB mutation, real LINE send, push and tag require a later explicit approval.

## Scope and behavior

- One B2C `RepairIntakeInvite` and Customer is the decision boundary. A mixed group has at least two Repairs, at least one `作業完了` Repair, and at least one incomplete Repair.
- Admin explicitly creates one request intent from a Repair LINE panel. The server resolves the intake, Customer, original Inquiry and verified LineManagerChat; validates every public token and the one-to-one InquiryWatch promotion; rejects active outbound Shipments; and queues one `APPROVED LineManagerSendOutbox` with key `intake-shipping-decision-request:{inviteId}`. No direct LINE send occurs.
- `RepairIntakeShippingDecision` has one row per invite. `RepairIntakeShippingDecisionRepair` freezes the exact member Repair IDs and `completedAtRequest` classification through foreign keys. A composite FK requires each snapshot Repair to retain the same intake ID; `Repair.id` remains the primary key. No ID list is trusted from the browser or kept as JSON.
- A new request requires the current mixed group and verified LINE mapping. An existing request remains valid after an unfinished Repair becomes complete: its snapshot does not expand, duplicate Admin POST returns the same request, and customer GET/POST use the frozen classification. Existing requests do not require a currently verified LINE mapping for a customer answer.
- The existing `/customer/repairs/[token]` B2C Repair-token page identifies every snapshot Repair by inquiry number and marks which Repairs were complete when requested. EstimateDocument-token, B2B and unrelated Repair pages do not get that control.
- Customer POST resolves the opaque Repair public token server-side, verifies exact intake/Customer membership, intact snapshot, uncancelled outbox and no active outbound Shipment, then writes one choice. Same-choice repeat is idempotent; a different choice or structural conflict returns 409. Task210C does not change Shipment or Repair status.
- The prior per-Repair completion LINE request and Repair delivery-preference page are gated while a multi-Repair intake is currently mixed, or once a Task210C request exists. An all-complete multi-Repair intake without a Task210C request retains the Task203 flow until Task210D.

## Storage and security

- Migration: `20261012_z_add_intake_shipping_decision`.
- Migration adds `Repair(id, repairIntakeInviteId)` uniqueness as the composite FK target, without changing the `Repair.id` primary key.
- Both new tables are server-only, RLS enabled with no policies. `PUBLIC`, `anon`, `authenticated` and `service_role` table privileges are explicitly revoked; there is no Data API GRANT and no sequence.
- The request and response paths use serializable transactions. The request locks LineUser, Customer, invite and member Repairs; rechecks eligibility before creating the snapshot and outbox. Client IDs and choice scope are never trusted.
- The public URL contains only an existing Repair public token. Unexpected route errors use generic logging so URL and token values do not enter logs.

## Independent review

- Codex implemented Task210C. Katari performed the independent schema / migration / security / boundary review.
- Initial review found three blocking issues: completion status drift incorrectly invalidated the request-time snapshot, the customer UI did not identify the frozen completed subset, and the Task203 compatibility guard suppressed every multi-Repair intake rather than only a mixed intake or an intake with an existing Task210C decision.
- Codex corrected those findings. The follow-up review also strengthened snapshot membership with a composite foreign key from `(repairId, repairIntakeInviteId)` to `Repair(id, repairIntakeInviteId)`.
- Follow-up review found no remaining blocking issue within Task210C. No production DB or migration operation was performed during review.

## Validation

- Focused Task210C and adjacent regression: 34/34 PASS.
- `npx prisma validate`: PASS.
- `npx prisma generate`: PASS after stopping the local `next dev` process that held the Prisma query-engine DLL.
- `npx tsc --noEmit --incremental false`: PASS.
- `npx next build`: PASS — Next.js 15.5.27, compile / lint / type check PASS, static pages 59/59.
- `git diff --check`: PASS.
- No schema migration was applied to local or production DB during validation.
- No real customer token, LINE send, Shipment mutation, Stripe action, or production data mutation was performed.

## Remaining production gate

- This Task contains a schema/migration change and therefore remains high risk until production approval.
- Before applying the production migration: confirm clean source/target state, take the required production DB backup, review the exact migration SQL again, and obtain explicit user approval.
- Production remains at the recorded Task210B source until that later approved migration/deploy.
