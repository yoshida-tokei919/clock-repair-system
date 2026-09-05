# Task 130: production migration prerequisites

## Safety boundary and result

All production access in this task used `SELECT` through the Supabase SQL
connector for project `vpyjonjfpkpbvvjufbiu`. No production DDL, data write,
restore, deployment, `migrate resolve`, `migrate deploy`, or `db push` was
run.

The Task128 catalog fingerprint was reproduced on 2026-09-04 (Asia/Tokyo):

| Check | Result |
| --- | --- |
| object count | `745` |
| MD5 | `5e5bcb94309c761ce8bbec658ab70ab3` |
| Task128 match | yes |

## Exact fingerprint procedure

The exact Task128 query was recovered from the preserved Task128 execution
session. The query is committed as
[`scripts/task130-production-catalog-fingerprint.sql`](../../scripts/task130-production-catalog-fingerprint.sql).
It emits one string for every public table, column, constraint, index, and
enum, sorts those strings, joins them with LF (`chr(10)`), and hashes the
result with PostgreSQL `md5`.

Normalization details that matter:

- table: `table:<tablename>` from `pg_tables`;
- column: table name, ordinal, name, `data_type`, `udt_name`, nullability, and
  default (an absent default is the empty string);
- constraint: `conrelid::regclass::text`, name, and
  `pg_get_constraintdef(oid, true)`;
- index: schema, table, name, and `indexdef` from `pg_indexes`;
- enum: type name, `enumsortorder`, label;
- the aggregate is `string_agg(value, chr(10) ORDER BY value)`.

Run it only with a production **read-only** database connection. For example:

```sh
psql "$PROD_READONLY_DIRECT_URL" -v ON_ERROR_STOP=1 \
  -f scripts/task130-production-catalog-fingerprint.sql
```

The SQL connector execution returned exactly `745` and
`5e5bcb94309c761ce8bbec658ab70ab3`.

## Logical backup procedure for Supabase Free

Supabase documents that Free projects should regularly create off-site logical
exports with `supabase db dump`; the CLI runs `pg_dump` with Supabase-specific
filtering. A migration-window backup must be retained outside the repository
and its checksum recorded with the migration record. Storage objects are not
included by database backups, so they require a separate Storage export if they
are in scope.

Obtain a fresh session-pooler or direct PostgreSQL URL (including the database
password) from the production project **Connect** panel. Do not put it in a
tracked `.env` file. With a current Supabase CLI and Docker available, take
these three files immediately before the approved write window:

```sh
supabase db dump --db-url "$PROD_MIGRATION_DIRECT_URL" -f roles.sql --role-only
supabase db dump --db-url "$PROD_MIGRATION_DIRECT_URL" -f schema.sql
supabase db dump --db-url "$PROD_MIGRATION_DIRECT_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

`pg_dump` can be used instead where a plain PostgreSQL dump is preferred, but
the Supabase CLI is the primary route because it filters Supabase-managed
schemas and is designed for a Supabase restore. Example public-only emergency
copy (not a full Supabase project backup):

```sh
pg_dump --format=custom --file public.backup --schema=public \
  "$PROD_MIGRATION_DIRECT_URL"
```

After each export, record `sha256sum`/`Get-FileHash` output, byte count,
UTC timestamp, project ref, source database name, and the fingerprint above.
Keep the dump and checksum in approved encrypted off-site storage.

## Disposable restore rehearsal

For a dump just created, restore only to a new disposable PostgreSQL instance;
never to production. The standard three-file CLI restore order is:

```sh
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$DISPOSABLE_DATABASE_URL"
```

Then run the following verification query against the disposable database:

```sql
SELECT
  to_regclass('public."EstimateItem"') IS NOT NULL AS estimate_item_exists,
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('PublicCase','PublicCaseWorkItem','PublicCasePartItem',
                        'PublicCaseImage','PublicCaseWarning')) = 5 AS public_case_five_exist,
  (SELECT count(*) FROM public."EstimateItem") AS estimate_item_row_count;
```

Compare `estimate_item_row_count` with a production pre-backup `SELECT count(*)`
recorded in the same runbook. Also check the required legacy-table list and
the Task130 fingerprint (for the pre-migration catalog).

### This task's restore status

No production database connection string/password or linked Supabase CLI state
is available in this checkout. Therefore no production dump was acquired and
no dump could be restored into a disposable database. The local `.env` files
both point only to `localhost`; they are not the production target. This is a
hard precondition, not a reason to attempt a migration.

## Task129 restart decision

Fingerprint precondition: **satisfied**. Backup and restore precondition:
**not satisfied**. Task129 must remain stopped until the owner supplies a
production backup credential/linked CLI session, the three logical dump files
are successfully produced, and their disposable restore passes the checks
above. Re-run the fingerprint immediately before that backup and again before
any approved migration write window.

References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups),
[CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
and [CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump).
