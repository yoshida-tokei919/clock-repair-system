# Task196A — PhysicalTag schema foundation

Status: production complete
Date: 2026-09-30

## Production record

- Application commit: `90e5807d46861937e2896b084a725fd45d89ed49`
- Commit subject: `feat: add physical tag schema foundation`
- Production tag: `production-task196a-20260930`
- Deploy source: GitHub `main`, exact feature commit `90e5807d46861937e2896b084a725fd45d89ed49`
- Railway deployment: `e686c011-c30f-4ef3-a3bd-51d498eff33d`
- Railway status: `SUCCESS`; region: `sin`
- Runtime: Next.js Ready in 260ms.
- Supabase project ref: `vpyjonjfpkpbvvjufbiu`
- Supabase migration: `20260929204922 add_physical_tag_foundation` — applied successfully.

## Pre-migration backup

- Pre-migration `public` base tables: 70.
- Backup folder: `C:\Users\yoshi\clock-repair-backups\task196a-20260930-054459`
- This is a read-only SQL fallback logical XML backup plus schema metadata, **not** a `pg_dump`.
- Files include `public-data-and-xsd.xml`, `schema-metadata.json`, `manifest.txt`, and `README.txt`.
- Previous full SQL dump baseline: `C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752`

## Production schema and DB verification

- `PhysicalTag` and `PhysicalTagAssignment` exist; both were empty immediately after migration.
- `PhysicalTagStatus` values are `ACTIVE` and `RETIRED`.
- Uniqueness exists for `shortCode`, `nfcUid`, and `qrToken`.
- Partial unique indexes with `releasedAt IS NULL` enforce at most one active assignment per tag and one active tag per Repair.
- Checks enforce `releasedAt >= assignedAt` and status / `retiredAt` consistency.
- Assignment foreign keys use `ON DELETE RESTRICT / ON UPDATE CASCADE`.
- RLS is enabled on both new tables, with no policies.
- No Data API `GRANT`: `anon`, `authenticated`, and `service_role` have no CRUD table privileges and no sequence `USAGE` on either new table.
- Security Advisor reports new `INFO` entries of `rls_enabled_no_policy` for the two tables. These are expected for the server-only design; no blocking issue.

## Verification and independent review

- Codex implementation → Katari independent review; blocking issue: none.
- `prisma validate`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `git diff --check`: PASS.
- Migration static safety checks: PASS.
- Production smoke: `/` = 200; `/login` = 200; unauthenticated `/api/work-time-sessions/active` = 401; unauthenticated `/api/work-calendar?month=2026-09` = 401.

## Task boundary

Task196A added the schema foundation only. It performed no backfill, existing-row updates, or seed. It did not change intake, WorkTimeSession behavior, resolve API, assign/release API, NFC/QR scan logic, UI, or printing.

Task196B is the next candidate and awaits user approval. It begins with implementation-prep / current-state confirmation and must follow its Task boundary. Its scope is an authenticated common resolver contract for QR token / shortCode and an NFC UID path; NFC UID normalization depends on a real reader PoC, which is not complete. Task196C/D and Task197 have not started.
