# Task142: production 初期基礎マスタ投入準備

## 境界

production への DML/DDL、seed、migration、`db push`、deploy は実行していない。
検証は Task136 が 2026-09-05 に read-only 取得した `production-current.backup`
を、隔離 PostgreSQL の `clock_recovery_current` に復元した clone のみで行った。

## 照合結果と投入対象

| master | natural key | local/dev | current seed | Task142 target | diff |
| --- | --- | ---: | ---: | ---: | --- |
| RepairWorkCategory | `(repairType, parentId, name)` (`parentId=null`) | 17 | 17 | 17 | none |
| RepairWorkAction | `name` | 24 | 24 | 24 | none |
| PartCategoryMaster | `key` | 17 | 17 | 17 | none |
| PartNameMaster | `key` (category is resolved by `PartCategoryMaster.key`) | 236 | 236 | 236 | none |
| PartGradeMaster | `key` | 3 | 4 | 3 | seed-only `used` is excluded |
| Supplier | `name` | 10 | 10 | 10 | none |

The local/dev three grades are `genuine` (純正), `fit` (FIT), and
`custom_fit` (合わせ). The fourth entry in the generic current seed is
`used` (中古), `sortOrder=40`. It is not in local/dev and conflicts with the
documented original initial candidates (純正 / FIT / 合わせ). It is therefore
not a Task142 production target; adding it requires a separately approved
master-policy decision.

The exact source lists are the existing seed definitions and
`src/lib/part-input-options.ts`; no DB IDs are copied. The target total is
**307** rows: 17 + 24 + 17 + 236 + 3 + 10.

## Importer

[`scripts/import-production-foundation-masters.ts`](../../scripts/import-production-foundation-masters.ts)
uses only natural-key upserts. It resolves `PartNameMaster.categoryId` from
the production-side `PartCategoryMaster` upsert result and never accepts or
writes a fixed source ID. It neither reads nor writes any out-of-scope master.

It defaults to read-only dry-run. A non-local write is rejected unless both
the command confirmation and the environment confirmation equal
`TASK142_FOUNDATION_MASTER_IMPORT`. `--clone` is separately limited to a
localhost URL and requires its own confirmation, so it cannot be reused for a
production write by accident.

## Isolated-clone verification

The current production dump clone had zero rows in all six target tables
before the import. Dry-run therefore planned 307 creates and zero updates.

| run | creates | updates | result |
| --- | ---: | ---: | --- |
| first clone execution | 307 | 0 | success |
| second clone execution | 0 | 307 | success; confirms idempotency |

After the second execution: all six actual counts equal the target counts;
`PartNameMaster` rows without a matching category are 0; duplicate natural-key
groups across all six masters are 0; and there are no unexpected rows because
the clone began with zero target rows and final counts exactly equal the source
counts. PostgreSQL FK constraints also remained valid throughout.

## Deferred production command (do not run without explicit approval)

Use a freshly approved production `DATABASE_URL` from the secret manager, not
the local clone URL. Keep it out of tracked files and shell history.

```powershell
$env:DATABASE_URL = '<approved production connection URL>'
$env:PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM = 'TASK142_FOUNDATION_MASTER_IMPORT'
npx tsx scripts/import-production-foundation-masters.ts --execute --production-confirm=TASK142_FOUNDATION_MASTER_IMPORT
Remove-Item Env:PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM
Remove-Item Env:DATABASE_URL
```

For the dump verified here, that command would add 307 rows and update zero.
Immediately before a future production execution, first run the same command
without `--execute`; its create/update plan is the authoritative current
production breakdown. Do not run `prisma db seed`.
