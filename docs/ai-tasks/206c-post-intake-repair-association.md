# Task206C — post-intake Repair association foundation

Production: complete — 2026-10-07

## Scope

- Saved `InquiryMessage` remains the immutable LINE source. No message or file is copied.
- `InquiryMessageClassification`, its InquiryWatch links, and derived `InquiryMessageRepairLink` retain their pre-intake semantics and are neither migrated nor changed.
- A separate routing associates a saved message directly with zero to 20 Repairs belonging to its currently linked Customer. General content and unresolved content are independent flags, so both may coexist with multiple Repair links.
- The routing works across Inquiries, including a new Inquiry after an older one closes, and does not require `InquiryWatchPromotion`. It applies to B2C and B2B Customers alike.
- No Customer Hub or Repair UI, LINE sending/outbox, Gmail, document, or billing behavior changes.

## Schema and migration

- `InquiryMessagePostIntakeRouting` has one row per message, `customerId`, `AI | MANUAL` source, optional AI confidence/evidence, both content flags, confirmation time, and timestamps.
- `InquiryMessagePostIntakeRepairLink` stores direct Repair IDs. Composite foreign keys on `(routingId, customerId)` and `(repairId, customerId)` enforce that every linked Repair belongs to the routing Customer. Only the needed composite unique keys are added to routing and Repair.
- A database check requires MANUAL rows to have `confirmedAt` and no AI confidence/evidence; AI rows have no `confirmedAt`. A trigger prevents MANUAL → AI updates and uses an explicit empty `search_path`.
- No backfill from the pre-intake link table.
- Both new tables have RLS enabled with no policies. The migration explicitly revokes all table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`, and all privileges on the new sequence from those roles. No Data API `GRANT` is made. Access is through the server Prisma connection only.

## Server contract

- A small server library reads and writes routing. Write operations use the existing per-LineUser advisory lock, then re-read the saved message and verify its `LineUser.linkedCustomerId`, the Inquiry's LineUser and linked Customer, and every selected Repair's `customerId` inside the transaction.
- Input requires unique positive Repair IDs (maximum 20) and at least one Repair or a true general/unassigned flag. Cross-customer Repairs fail closed. The composite foreign keys also protect against database races.
- MANUAL updates replace prior AI or MANUAL targets, clear AI confidence/evidence, and set `confirmedAt`. Browser input cannot include source, confidence, evidence, or confirmation fields.
- The separate server-only AI entry point returns `manual_preserved` without any mutation if MANUAL routing already exists. The database trigger protects against accidental source demotion.
- Authenticated Admin GET/PATCH: `/api/customers/[id]/communications/line/[messageId]/routing`. GET returns only message ID, source, confidence, flags, confirmation/update times, and Repair IDs. Existing routing tied to an earlier Customer link returns a conflict, without exposing its Repair IDs.
- Responses use 401 for missing admin authentication, 400 for malformed input, 404 for missing or unowned message, and 409 for ownership or Repair state conflicts.
- Link insertion translates only Prisma `P2003` foreign-key failures into an ownership/state conflict. Write transaction `P2034` is also a conflict. Other Prisma failures remain unexpected errors with a generic 500 response.

## Local validation

- `npx prisma validate`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- Focused Task206C library tests: 9/9 PASS, including `P2003` link-insertion conflict mapping and unrelated Prisma error classification. Sandboxed Node/esbuild worker startup failed with Windows `spawn EPERM`; the final unsandboxed run completed the assertions.
- `git diff --check`: PASS.
- Local Next build was attempted but stopped by Windows worker `spawn EPERM`; the failure was environment-level rather than an assertion failure. Production Railway build later passed.
- Independent review found that a Repair customer change between the ownership read and link `createMany` made the composite foreign key reject the write, but the API returned 500 instead of the promised 409. Corrected by translating `P2003` only at link insertion and mapping write transaction `P2034` to 409; a focused regression test covers both the conflict and an unrelated Prisma error remaining 500. Final independent re-review: no blocking High / Medium / Low findings.

## Production record

- Application commit: `483f6cc567bfd39558badd75661784dbd922c62d` — `feat: add post-intake repair routing`.
- Pre-production read-only logical backup: `C:\Users\yoshi\clock-repair-backups\task206c-20261007-130416`.
  - `public-data-and-xsd.xml`: 425329 bytes, SHA256 `FB5CA82A61BB1483C77CB68B3F56497F7905E18955D0FDDDF6F3EF13B97DD785`.
  - `schema-metadata.json`: 364488 bytes, SHA256 `7ED72498B174A48BFD0D5EA459FC3A2FC18BAAFEF834AED13C28CBB0AC9FAA72`.
  - Snapshot covered 77 public base tables. It is a read-only logical XML/XSD + schema/security metadata snapshot, not `pg_dump`.
- Supabase project: `vpyjonjfpkpbvvjufbiu`.
- Applied migration: `20261007040448 add_post_intake_repair_routing`.
- Production DB read-back:
  - both new tables exist and start with 0 rows;
  - RLS enabled on both, policy count 0;
  - expected five indexes present, including `Repair_id_customerId_key`;
  - composite customer-safe FKs, routing FKs, and source CHECK match the reviewed migration;
  - manual-overwrite trigger function is not `SECURITY DEFINER` and has `search_path=""`;
  - `PUBLIC`, `anon`, `authenticated`, and `service_role` have zero table privileges on the new tables and zero sequence privileges on the new sequence;
  - no Data API `GRANT` was added.
- Supabase Security Advisor after migration: `rls_enabled_no_policy` INFO count 18. The two new INFO entries are intentional because these tables are server-only and have no Data API privileges.
- Railway deployment: `f6b303f7-1b8e-42ae-9907-1e8aa4c001a3` — SUCCESS, source commit `483f6cc567bfd39558badd75661784dbd922c62d`, region `sin`.
- Production build: Next.js 15.5.27, compile/type validation PASS, static pages 57/57.
- Production runtime: Ready in 589ms.
- Production smoke:
  - `/` = 200;
  - `/login` = 200;
  - `/customers/1/communications` unauthenticated = 307;
  - `GET /api/customers/1/communications/line/1/routing` unauthenticated = 401;
  - Railway HTTP logs show no `upstreamErrors` for the smoke requests;
  - existing n8n `/api/internal/line-inbox/process` and Slack claim calls continued returning 200 after deploy.
- No real customer LINE send was performed as part of Task206C production verification.
