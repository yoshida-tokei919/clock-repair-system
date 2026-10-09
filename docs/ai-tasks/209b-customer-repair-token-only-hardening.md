# Task209B — Customer Repair token-only hardening

## Scope and threat

The anonymous customer Repair mutation routes previously resolved a numeric URL segment as a sequential `Repair.id` before checking `Repair.publicToken`. A caller who did not know a Repair's public token could therefore address it by ID.

This task covers POST approval, rejection, messages, return address, and photo posting opt-out under `/api/customer/repairs/[id]/`. The URL shape and existing business rules remain unchanged. Prepayment checkout and customer photo routes already use their own token validation and are outside this change.

## Implementation

`findRepairIdByPublicToken` resolves only an exact, nonempty `Repair.publicToken` through its unique index. It does not interpret a numeric segment as `Repair.id` or create a token. All five mutation routes use the resolver and return 404 before mutation when the token is absent.

## Validation

- Executable resolver regression covers numeric ID mismatch, valid token, blank input, and a literal numeric public token.
- Executable route regressions cover all five POST handlers and assert a numeric ID path returns 404 before any mutation call.
- Focused tests: 6/6 pass (`npx tsx --test src/lib/customer-repair-token-only.test.ts`).
- `npx tsc --noEmit --incremental false`, `git diff --check`, and `npm run build` pass.

No schema, migration, RLS, GRANT, environment, or production DB change is included.

## Production

Production: pending. No push or deploy in this implementation handoff.
