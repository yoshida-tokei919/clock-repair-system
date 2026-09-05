# Task 128: production baseline schema B reconciliation

## Scope and safety boundary

- Production was queried only through read-only catalog SQL against Supabase project `vpyjonjfpkpbvvjufbiu`.
- No production data mutation, DDL, `migrate resolve`, `migrate deploy`, `db push`, deployment, merge, or commit was performed.
- `AGENTS.md`, `docs/ai/03_CURRENT_TASK.md`, and `docs/ai/04_IMPLEMENTATION_RULES.md` are not present in this checkout; Task 126, the current Prisma schema, and the migration directories were inspected. No separate Task 127 result file is present in the checkout.

## Production catalog snapshot (schema B)

Captured 2026-09-04 (Asia/Tokyo) using `information_schema` and `pg_catalog` only.

- PublicCase enums:
  - `PublicCaseSourceType`: `FMP`, `WEB_APP`
  - `PublicCasePublishStatus`: `HIDDEN`, `READY`, `PUBLISHED`, `ARCHIVED`
  - `PublicCaseReviewStatus`: `DRAFT`, `NEEDS_REVIEW`, `APPROVED`, `REJECTED`
  - `PublicCaseWarningSeverity`: `CRITICAL`, `REVIEW`, `INFO`
- Present PublicCase tables: `PublicCase`, `PublicCaseWorkItem`, `PublicCasePartItem`, `PublicCaseImage`, `PublicCaseWarning`.
- Their columns, nullable/default state, primary keys, foreign keys, unique constraint, and indexes match the SQL in `0_production_legacy_baseline/migration.sql`. In particular: every id is `integer NOT NULL` with its owned sequence; timestamps are `timestamp(3) without time zone`; JSON fields are `jsonb`; the five FK delete actions are `SET NULL` for `PublicCase.repairId` and `PublicCasePartItem.relatedWorkItemId`, and `CASCADE` for the remaining PublicCase parent relations.
- `PublicCase` has unique (`sourceType`, `sourceRepairId`), and the single-column indexes declared in the baseline; child tables have the corresponding FK/search indexes.
- `EstimateItem` has exactly its pre-snapshot ten columns: `id`, `estimateId`, `itemName`, `quantity`, `unitPrice`, `type`, `orderStatus`, `orderedAt`, `partsMasterId`, `createdAt`. The seven new columns below do not exist: `sourceAreaSnapshot`, `categoryNameSnapshot`, `targetPartNameSnapshot`, `actionNameSnapshot`, `detailLabelSnapshot`, `b2cDisplayNameSnapshot`, `gradeNameSnapshot`.

### Reconciliation fingerprint

The fingerprint covers public base-table names, every column (order/type/nullability/default), all public constraints, public indexes, and public enums:

| target | object count | MD5 |
| --- | ---: | --- |
| production B catalog | 745 | `5e5bcb94309c761ce8bbec658ab70ab3` |
| local source schema used to render baseline | 745 | `5e5bcb94309c761ce8bbec658ab70ab3` |

The local source is therefore a catalog-identical reproduction of production B for the objects the baseline owns. The baseline is a normalized schema-only `pg_dump` rendering: it deliberately omits `CREATE SCHEMA public` because PostgreSQL already creates `public` in a fresh database, contains no data or sequence-value restoration, and restores `search_path` to `public` at the end so Prisma can record the migration in its history table.

## Disposable DB verification procedure

1. Create a new empty local PostgreSQL database; do not use production or a persistent shared database.
2. Apply `prisma/migrations/0_production_legacy_baseline/migration.sql`.
3. Run the same catalog-fingerprint query. It must be `745 / 5e5bcb94309c761ce8bbec658ab70ab3`.
4. Apply `20260904_add_estimate_item_public_case_snapshots/migration.sql`.
5. Diff the before/after catalogs. The only permitted additions are the seven nullable `text` columns on `public."EstimateItem"`; no enum, table, constraint, FK, unique, or index may change.
6. With the active migration directory containing only the baseline and snapshot migrations, run `prisma migrate status` against the disposable DB. Before deployment it should report both migrations pending; after deployment it should report the database schema is up to date.

### Executed result

- `clock_repair_task128_catalog`: baseline applied successfully; 35 public tables, zero of the seven new `EstimateItem` columns, and fingerprint `745 / 5e5bcb94309c761ce8bbec658ab70ab3`.
- On that database, applying the snapshot SQL added exactly seven columns, in this order: `sourceAreaSnapshot`, `categoryNameSnapshot`, `targetPartNameSnapshot`, `actionNameSnapshot`, `detailLabelSnapshot`, `b2cDisplayNameSnapshot`, `gradeNameSnapshot`. Each is `text`, nullable, and has no default. No other statement exists in the snapshot migration.
- A normalized before/after catalog comparison (excluding Prisma's own `_prisma_migrations` objects and excluding those seven columns from the after side) compared 745 objects on each side and returned no differences. Therefore the schema delta is exactly those seven columns.
- `clock_repair_task128_status3`: Prisma `migrate status` first reported exactly the two active migrations pending; `prisma migrate deploy` then applied both successfully; the final `migrate status` reported `Database schema is up to date!`; the snapshot-column count was seven.

The baseline migration is UTF-8 without BOM. This matters because a BOM is rejected as SQL by Prisma/PostgreSQL.

## Production operation after approval

1. Re-run the read-only identity/catalog/fingerprint check and confirm no drift from B.
2. Back up production and obtain an approved migration-write window and a direct migration-owner URL.
3. Run `prisma migrate resolve --applied 0_production_legacy_baseline --schema prisma/schema.prisma` **once** on production.
4. Run `prisma migrate status` and confirm only `20260904_add_estimate_item_public_case_snapshots` is pending.
5. Run `prisma migrate deploy --schema prisma/schema.prisma`.
6. Re-run the catalog query and verify only the nullable seven `EstimateItem` columns were added.
