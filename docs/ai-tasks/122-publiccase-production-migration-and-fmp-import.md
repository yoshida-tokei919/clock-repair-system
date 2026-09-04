# Task 122: PublicCase production migration and safe FMP operations

## Scope completed

This task creates release artifacts only. No remote database connection, migration application, deployment, branch operation, or FMP remote import was performed.

## New artifacts

| Purpose | File |
| --- | --- |
| PublicCase-only Prisma migration | `prisma/migrations/20260904_add_public_case/migration.sql` |
| FMP append-only production importer | `scripts/import-fmp-public-cases-production.ts` |
| Explicit FMP promotion tool | `scripts/promote-fmp-public-cases.ts` |

The migration creates only the four PublicCase enums and the five PublicCase tables, their schema-declared indexes/unique constraint, and their `Repair` / PublicCase child relations. It contains no alter/drop operation on existing production tables.

## Operational contracts

### Import

`scripts/import-fmp-public-cases-production.ts` defaults to dry-run and has no `--replace`, update, delete, or upsert path. It validates input `sourceType=FMP` and non-empty, unique `sourceRepairId`, reads existing FMP IDs, skips existing `(sourceType=FMP, sourceRepairId)` pairs, and inserts only missing records. Each case plus children is written in a transaction; a conflict aborts rather than being converted into an update.

Every inserted case starts as `NEEDS_REVIEW`, `HIDDEN` for both channels, and `showPriceB2c=false`; every imported child item also has `showPriceB2c=false`.

Normal invocation is dry-run:

```powershell
npx tsx scripts/import-fmp-public-cases-production.ts --input=PATH_TO_REVIEWED_CANDIDATES.json
```

Writing additionally requires all three independent conditions below. This command is documentation only; do not run it until a separately authorized production task.

```powershell
$env:FMP_PRODUCTION_IMPORT_CONFIRM = "FMP_APPEND_ONLY_IMPORT"
npx tsx scripts/import-fmp-public-cases-production.ts --input=PATH_TO_REVIEWED_CANDIDATES.json --execute --production-confirm=FMP_APPEND_ONLY_IMPORT
```

The script refuses writes to a local URL, so a local dry-run cannot accidentally become a write. Dry-run reports input, planned creates, existing skips, duplicate-input count, and warning/error counts.

### Promotion

`scripts/promote-fmp-public-cases.ts` defaults to dry-run. It requires an explicit `--ids=` and/or `--source-repair-ids=` allow-list, queries only `sourceType=FMP`, refuses `--all` and `--replace`, and reports missing allow-list entries. `WEB_APP` rows are outside its query and update filter.

It refuses to promote any matched record with `showPriceB2c=true`. On an authorized execution it updates only the supplied, resolved FMP allow-list to `reviewStatus=APPROVED`, `b2cPublishStatus=PUBLISHED`, and sets `b2cPublishedAt`.

```powershell
npx tsx scripts/promote-fmp-public-cases.ts --source-repair-ids=FMP-REPAIR-001,FMP-REPAIR-002
```

Writing further requires `--execute`, `--production-confirm=FMP_PUBLIC_CASE_PROMOTION`, `FMP_PUBLIC_CASE_PROMOTION_CONFIRM=FMP_PUBLIC_CASE_PROMOTION`, and a non-local configured database URL.

## PublicCase release range

`origin/main..HEAD` contains substantial unrelated work-master and parts work. Do not merge the branch wholesale. `ce6f95c` introduced the FMP/PublicCase serving foundation, but it also includes historical documents and data artifacts; `19497f9` adds the operational editor/promotion UI and depends on intervening RepairLineItem work.

Build a dedicated release branch from `origin/main` and include a reviewed implementation equivalent to the following, rather than blindly cherry-picking either large commit.

### Required B2C serving range

- `prisma/schema.prisma` — only the PublicCase declarations needed by the migration
- `prisma/migrations/20260904_add_public_case/migration.sql`
- `src/lib/public-cases.ts`
- `src/app/page.tsx`
- `src/app/cases/gallery/page.tsx`
- `src/app/cases/gallery/[id]/page.tsx`
- `scripts/import-fmp-public-cases-production.ts`
- `scripts/promote-fmp-public-cases.ts`

### Required FMP candidate-production range

- `scripts/generate-fmp-public-case-candidates.ts`
- direct reviewed inputs used by that generator and the resulting reviewed candidate JSON, handled as a pinned release artifact (not an unreviewed regenerated file)
- the direct warning/brand-kana review helpers only if the final candidate artifact must be regenerated: `scripts/analyze-fmp-public-case-warnings.ts`, `scripts/generate-brand-kana-candidates.ts`, `scripts/prepare-brand-kana-review-list.ts`, `scripts/finalize-brand-kana-approved-list.ts`

### Optional operational WEB_APP authoring range

This range is required only if production operators need to create/edit `WEB_APP` PublicCases in the same release:

- `src/app/(app)/public-cases/[id]/page.tsx`
- `src/app/api/public-cases/[id]/route.ts`
- `src/app/api/repairs/[id]/public-case/route.ts`
- `src/components/public-cases/PublicCaseEditor.tsx`
- `src/app/(app)/repairs/[id]/page.tsx`
- the reviewed RepairLineItem/schema commits required by the repair-to-public-case route.

Do not include dev preview pages, unrelated work-master/parts files, or generated FMP artifacts merely because they coexist in the work-branch commits.

## Next task

Create and review the dependency-complete release branch from `origin/main`; regenerate and pin the reviewed FMP artifact (hash and expected counts); validate the migration in a production-like disposable database; then separately authorize production migration/deployment and only later the append-only import and allow-listed promotion.
