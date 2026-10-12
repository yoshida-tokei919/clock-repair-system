# Task210E - delivery preference to DRAFT Shipment

Production: complete.

## Scope

- A successful B2C public POST on either Task203 `/customer/delivery/[token]` or Task210D `/customer/repairs/[token]` applies the answer to exactly one OUTBOUND/DRAFT Shipment for the server-derived target Repairs.
- The answer and Shipment creation or DRAFT update occur in the same Serializable transaction. GET remains read-only.
- Task203 uses the Repair identified by its public token. Task210D uses its validated frozen `COMPLETED_AT_REQUEST`, `REMAINING`, or `ALL` membership. The two `SHIP_COMPLETED` groups can become separate Shipments.
- With no active outbound Shipment touching the target, the POST creates one. With exactly one active Shipment of the same Customer and exact Repair membership, it updates that Shipment only while DRAFT. Any overlap, extra member, wrong Customer, duplicate active Shipment, or non-DRAFT status fails closed.
- The canonical `shipment.ts` return-address snapshot validation is shared by manual and automatic creation. Missing, invalid, or differing snapshots fail closed. The validated snapshot is copied to the created destination.
- A grouped exact retry retains its immutable Task210D first answer. If an older saved answer lacks a Shipment, the retry creates it after the same validation. A changed answer still returns 409. Task210F revision behavior is not implemented.
- The admin `POST /api/shipments` explicit `confirmed: true` contract remains intact. Manual Shipment creation remains available.

## Idempotency and locking

- Public payloads contain no Repair or Customer IDs. IDs are resolved from the token and, for a group, the Task210D frozen membership.
- Grouped POST retains LineUser -> Customer -> invite -> Repair row lock ordering. Single-Repair POST locks Customer then Repair. Both use Serializable isolation; P2002/P2034 conflicts return 409. The transaction rechecks active outbound Shipment membership before creating or updating.
- Manual Shipment creation locks its validated Repair IDs in ascending order before reading them and rejects any selected Repair already linked to an active outbound Shipment. Historical CANCELLED, actually shipped, and INBOUND Shipments remain eligible. Single-Repair public POST re-reads the Repair after locking and rejects a changed Customer. Grouped context accepts an exact active Shipment only for a saved group or the currently answerable group.
- Exact repeats reuse the one DRAFT Shipment. A transaction failure rolls back both preference and Shipment writes. A network result uncertainty can be resolved by repeating the same POST without creating another Shipment.

## Boundaries and validation

- No Shipment.status, Repair.status, StorageLocation, PhysicalTag, LINE, tracking, or label issue state change.
- No schema, migration, or environment change.
- Focused tests (`shipment`, Task203, Task210D): 42/42 PASS.
- Host-side relevant tests including Task203 route regressions: 47/47 PASS.
- `npx prisma validate`: PASS; no schema or migration diff.
- `npx tsc --noEmit --incremental false`: PASS.
- `npx next build`: PASS on host (Next.js 15.5.27; compile/lint/type checks passed; static generation 59/59). The earlier Codex sandbox `spawn EPERM` was environment-specific.
- `git diff --check`: PASS.

## Independent review

- Reviewer: Katari, separate from the Codex implementation session.
- Initial review found and corrected: manual/public Shipment concurrency lacked a shared Repair lock boundary; single-Repair POST validated a pre-lock snapshot; grouped context accepted a future unanswered group Shipment too broadly.
- Follow-up review found and corrected one remaining race: manual create acquired Repair locks but still created a second Shipment after observing an active outbound Shipment. Manual create now fails closed after the locked fresh read for any active outbound overlap.
- Historical CANCELLED, actually shipped, and INBOUND Shipment cases remain non-blocking.
- Final read-only review found no remaining blocking issue within Task210E scope.

## Production

- User approval: 2026-10-12.
- Application commit: `a9da82325d681a5894bb14a98812583ea2c0f0b7` (`feat: auto-create delivery preference shipments`).
- No schema, migration, RLS, GRANT, environment-variable, or production DB migration change was required.
- Railway application deployment: `336026fd-06a9-407c-8398-bfb13ba1f7f9`, source `main@a9da823`, region `sin`, status `SUCCESS`.
- Railway build passed Prisma Client generation, Next.js 15.5.27 compile, lint/type validation, and static generation 59/59. Runtime reached `Ready` in 558ms.
- Non-destructive production smoke: `/` 200, `/login` 200, unauthenticated `/repairs` 307, invalid Task203 delivery API token 404, invalid Task210D intake-delivery API token 404, and unauthenticated `POST /api/shipments` 401. Railway HTTP logs showed no upstream errors for the smoke requests.
- No real customer token, delivery-preference answer, Shipment/ShipmentRepair mutation, LINE send, outbox creation, Stripe action, or customer-data mutation was used for smoke testing.
- Production tag: `production-task210e-20261012` (created after the final docs-only deployment succeeds).
