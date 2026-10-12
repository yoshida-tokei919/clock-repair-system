# Task210D — shipment-level delivery preference

Production: pending.

## Scope

- B2C Repairs from one completed `RepairIntakeInvite` use delivery preference groups on `/customer/repairs/[token]` when the intake has multiple Repairs. The page identifies the current exact target by inquiry number.
- `SHIP_COMPLETED` first targets the frozen Task210C snapshot members with `completedAtRequest=true`. After that answer is saved, the remaining frozen members form a second independent group. Its first answer becomes available once every remaining Repair is currently `作業完了`.
- `WAIT_ALL` targets the complete frozen Task210C snapshot. The form is unavailable until every member is currently `作業完了`.
- An all-complete multi-Repair intake without a Task210C decision targets all invite Repairs and can answer from the existing shared page. Its existing completion notice URL now points there. No new LINE notice is created.
- Single-Repair B2C keeps Task203 `/customer/delivery/[token]`. B2B and EstimateDocument-token pages do not gain the grouped answer.
- The first grouped answer is immutable. Exact repeat is idempotent; a changed answer returns 409. Revision and READY locking belong to Task210F.
- No Shipment or ShipmentRepair create, update, or link occurs here. Task210E owns Shipment creation and application.

## Storage and security

- `RepairIntakeDeliveryPreference` stores one answer per outbound group, allowing two distinct `SHIP_COMPLETED` answers in one invite without fabricating a Task210C decision. `RepairIntakeDeliveryPreferenceRepair` freezes the server-derived membership; no JSON ID list or client-supplied IDs are used.
- Composite FKs connect each target to its invite and Customer. A Repair can belong to only one group, and each invite can have at most one record per group kind. The service verifies the full intake and promotion mapping, customer/type, public token timestamp, cancellation and active outbound Shipment conflicts. An exact active Shipment for a saved group is valid; overlapping, mixed, or mismatched shipments fail closed.
- Public POST uses a Serializable transaction and row locks in LineUser → Customer → invite → Repair order. Token scope comes from an opaque existing `Repair.publicToken` only. Unexpected public-route errors are logged without the URL, token, or error object.
- Migration: `prisma/migrations/20261012_z_add_intake_delivery_preference/migration.sql`. Both new public tables enable RLS, have no policies, and explicitly revoke all table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`. They are server-only with no Data API GRANT or sequence.
- Task203 parsing, Yupuri time-slot vocabulary, and Asia/Tokyo past-date check are reused. Task203 is suppressed only when strict Task210D group eligibility applies; historical unsupported multi-intakes retain Task203. A later Task210C request is blocked if a grouped answer already exists. A known grouped delivery 409 hides only its control on the Task210A status page.

## Validation

- Focused Task210D / Task210C / Task203 regressions: 34/34 PASS outside the Codex sandbox. This includes the `SHIP_COMPLETED` second group, same-group retry idempotency, stale/future `groupKind` rejection, pending Task210C decision suppression, WAIT_ALL gating, legacy fallback, active Shipment conflict, all four delivery modes, and zero Shipment writes.
- `npx prisma validate`: PASS.
- `npx prisma generate`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `npx next build`: PASS (Next.js 15.5.27, 59/59 static pages generated).
- `git diff --check`: PASS. Codex sandbox test startup hit `spawn EPERM`; the same focused suite passed in the normal environment.
- Independent Katari review: blocker found in the initial one-preference-per-invite design and fixed to support separate `COMPLETED_AT_REQUEST` / `REMAINING` groups. A second blocker where a network retry could advance into the next group was fixed by server-validated `groupKind` binding. Migration/RLS/REVOKE matches the existing Task210C/Task203 server-only pattern.

## Remaining boundary

- Shipment creation and applying this preference to DRAFT Shipments remain Task210E. Re-answer and later issue state handling remain Task210F.
- Migration has not been applied. No production data, main merge, push, deployment, or tag was changed.
