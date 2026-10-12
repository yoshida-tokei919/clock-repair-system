# Task210A — intake shared-page grouping

Production: complete.

## Goal

B2Cの1回の送付受付で作成された複数Repairを、1つの継続共有ページから確認できるようにする。同じCustomerという理由だけで別受付を自動統合しない。

## Boundary

- Group key: existing `Repair.repairIntakeInviteId` plus `customerId`.
- No schema / migration / RLS / GRANT change.
- No LINE send. Intake completion LINE notice is Task210B.
- Existing EstimateDocument-token grouping remains unchanged.
- B2B Repair-token pages remain single-Repair unless already grouped by an EstimateDocument token.

## Implementation

- `submitRepairIntake()` now assigns every newly created B2C Repair an opaque 24-byte base64url `publicToken` and `publicTokenCreatedAt` in the same transaction.
- `resolveCustomerRepairShareScope()` resolves an exact Repair public token and, only for B2C Repairs with an intake boundary, returns Repairs matching both the same `repairIntakeInviteId` and `customerId`.
- Legacy intake groups with any sibling missing its own public token fail closed to the anchor Repair. This prevents sibling actions from accidentally reusing the anchor token.
- The customer Repair page loads the resolved intake group only for Repair-token access. EstimateDocument-token behavior is unchanged.
- On Repair-token pages, photos, estimate PDFs, approval / return-address controls, photo-posting opt-out, and Repair prepayment actions use each Repair's own public token. On existing EstimateDocument-token pages, a tokenless Repair can still start prepayment checkout with that document token, subject to the checkout's server-side Repair/document validation.

## Safety properties

- Exact `Repair.publicToken` lookup only; numeric Repair IDs are not accepted as public-token fallback.
- Same Customer + different intake is excluded.
- Same intake ID + different Customer is excluded by the query boundary.
- The final page read re-applies the resolved `customerId + repairIntakeInviteId` boundary for grouped access, closing a read-time linkage-change race.
- No new public token is minted on a customer GET request.
- No mutation is performed by shared-page grouping reads.
- Task210A does not create or send any LINE outbox.
- Existing `Repair.repairIntakeInviteId` index is reused; no new schema/index is needed.

## Validation

- Rebased cleanly onto `origin/main` commit `60a016f` (B2C roadmap update).
- Focused `customer-repair-share` + `repair-intake` + customer Repair token-only regression: 41/41 PASS after the post-rebase safety tightening.
- Focused prepayment regression after the compatibility fix: 16/16 PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `git diff --check`: PASS.
- `npx next build`: PASS — Next.js 15.5.27, compile / lint / type check PASS, static pages 59/59.

## Review

Katari implemented the initial Task210A change while Codex usage was unavailable. After rebase, Katari tightened the final grouped page read to re-apply the resolved Customer + intake boundary. A Codex read-only review found one Medium backward-compatibility regression: a legacy EstimateDocument-token page could no longer start prepayment checkout for a Repair without its own public token. Codex implemented only that finding, preserving Repair-token isolation while restoring the server-validated EstimateDocument-token checkout path. Katari then reviewed the Codex fix and direct authorization impact with no remaining blocking finding.

## Production

- Application commit: `d002a1d1d340373fe62d09574248e6d05378d00d` (`feat: group B2C intake repair share page`).
- GitHub `main` was fast-forwarded from `60a016f` to the application commit; no unrelated code change was mixed into Task210A.
- Schema / migration / RLS / GRANT / env change: none. Production DB backup was therefore not required.
- Railway application deployment: `d7950a03-a1c7-41dc-9190-2cdce277b0f9` — SUCCESS, source `main@d002a1d`, region `sin`.
- Railway build: Prisma Client generation PASS, Next.js compile / lint / type check PASS, static pages 59/59.
- Runtime: Next.js 15.5.27, Ready in 471ms.
- Production smoke: `/`=200, `/login`=200, `/repairs` unauthenticated=307, invalid `/customer/repairs/task210a-smoke-invalid-token`=404.
- Railway HTTP logs for the smoke window had no 5xx and `upstreamErrors` was empty.
- No real customer token was used. No Stripe checkout, LINE send, or customer data mutation was performed during smoke.
- Production tag: `production-task210a-20261012`.
