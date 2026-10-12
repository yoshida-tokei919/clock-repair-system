# Task204B - Shipment tracking state sync

Status: local implementation and validation. Production: pending.

## Scope

- Adds authenticated internal `POST /api/internal/japan-post-tracking/sync` using the Task204A Yu-Pri Cloud six-column CSV contract.
- Reuses Task204A preview before any write, then row-locks each Shipment and revalidates direction, Japan Post carrier, tracking number, eligible current status, and transition before mutation.
- Persists only Shipment `status`, `actualShippedAt`, and `deliveredAt`. No Repair status, LINE, shared-page, schema, migration, RLS, or GRANT change.
- Worker gains opt-in `--tracking-sync`; `start-yupuri-cloud-worker.ps1` exposes it as `-AllowTrackingSync`. Existing production scheduled worker does not pass that switch, so deployment alone will not activate automatic tracking sync.

## Transition safety

Allowed progression is monotonic for normal states: LABEL_ISSUED -> AWAITING_ACCEPTANCE / accepted-or-later; AWAITING_ACCEPTANCE -> accepted-or-later; SHIPPED -> transport/out-for-delivery/delivered/exception; IN_TRANSIT -> out-for-delivery/delivered/exception; OUT_FOR_DELIVERY -> delivered/exception. A stale CSV cannot regress those states.

EXCEPTION can recover to IN_TRANSIT, OUT_FOR_DELIVERY, or DELIVERED because hold/transfer/investigation conditions can subsequently resume normal delivery. DELIVERED and CANCELLED are not Task204B polling candidates.

The sync is idempotent. An identical current state and timestamps returns `NO_CHANGE` without an update.

## Timestamp policy

The official interface specification confirms the acceptance-related and delivery-completion fields are 14 bytes, but an actual non-empty Cloud CSV sample has not yet been observed. The implementation therefore uses a strict provisional parser only for `YYYYMMDDHHmmss` interpreted as Japan Standard Time. Invalid calendar values, blanks, other lengths/formats, delivery-before-acceptance, or any unverified value fail closed with no Shipment mutation.

- AWAITING_ACCEPTANCE does not create `actualShippedAt`.
- SHIPPED and later states require a valid acceptance timestamp when `actualShippedAt` is still null.
- DELIVERED requires a valid delivery-completion timestamp when `deliveredAt` is still null.
- Existing persisted timestamps are preserved rather than overwritten.

This format must be confirmed in the approved real-shipment E2E before tracking sync is operationally enabled.

## Worker activation boundary

`--tracking-sync` may run persistently, but it is opt-in. The current production `ClockRepair-YuPriCloudWorker` task remains issuance-only until the user separately approves activation. The same authenticated dedicated Edge/session and Task204A CSV download path are reused.

## Validation

- Task204B focused + Task204A/browser regressions: 33/33 PASS.
- Covers acceptance, pre-acceptance, transport, delivery completion, idempotency, invalid timestamp rejection, stale/regressive state rejection, and EXCEPTION recovery.
- TypeScript `--noEmit --incremental false`: PASS.
- `git diff --check`: PASS before commit.
- Full production build is repeated after the Task204A-E implementation sequence; no schema or Prisma generation change exists in this Task.

## Review exception

The user explicitly authorized Katari to implement and review Task204A through Task204E while Codex quota is limited. Independent Codex review is intentionally omitted for this sequence. Production deployment, persistent `-AllowTrackingSync`, and real delivery mutation remain separate approval points.
