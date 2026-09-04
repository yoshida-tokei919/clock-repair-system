# Task 121: production PublicCase cutover investigation

## Scope and result

This document records preparation only.  No production deployment, remote database connection, remote write, FMP import, migration, or dummy-case deletion was performed.

The production reference used for the code comparison is `origin/main`; the work branch is `wip-publiccase-workmaster-20260606` at `19497f9`.

## 1. Code gap from production

`origin/main` still has the five hard-coded `repairCases` entries in `src/app/cases/gallery/page.tsx`.  The PublicCase implementation is not in that branch.

The relevant implementation is split as follows:

| Capability | Main code range |
| --- | --- |
| PublicCase Prisma models, FMP candidate/import tooling, B2C gallery, B2C detail, home recent-cases, B2B pages | `ce6f95c` (plus its PublicCase-only files) |
| B2C query/brand filtering and source-aware local fallback | `ce6f95c`, `src/lib/public-cases.ts` |
| Repair to PublicCase draft, PublicCase editor, photos, B2C approval/publish API and page wiring | `19497f9` |
| Repair-line-item support used by the Repair-to-PublicCase implementation | the intervening RepairLineItem/structured-work commits; do not cherry-pick `19497f9` alone without dependency review |

For the public cutover, the required public serving files are:

- `src/app/page.tsx`
- `src/app/cases/gallery/page.tsx`
- `src/app/cases/gallery/[id]/page.tsx`
- `src/lib/public-cases.ts`
- `prisma/schema.prisma`, generated Prisma client, and a new committed migration for the PublicCase models

For operational authoring in production, additionally include:

- `src/app/(app)/public-cases/[id]/page.tsx`
- `src/app/api/public-cases/[id]/route.ts`
- `src/app/api/repairs/[id]/public-case/route.ts`
- `src/components/public-cases/PublicCaseEditor.tsx`
- `src/app/(app)/repairs/[id]/page.tsx`
- the specific RepairLineItem/schema dependencies of the route.

The work branch is 229 files ahead of `origin/main`; it also contains unrelated work-master and parts-search work.  A bulk merge is not the safe release unit.  Create a dedicated release branch or a reviewed, dependency-complete commit series instead.

### Migration prerequisite

`prisma/schema.prisma` declares `PublicCase`, `PublicCaseWorkItem`, `PublicCasePartItem`, `PublicCaseImage`, and `PublicCaseWarning`, but `prisma/migrations/` contains no migration that creates them.  A production cutover cannot rely on application deploy alone: the migration must be created, reviewed, and applied before code that queries these tables is deployed.

## 2. Production DB read-only status

No remote query was run.  The available `.env` and `.env.local` both point at `localhost:54322/clock_repair_local`; there is no Railway configuration file or production database URL in this checkout.  Connecting by guessing a Railway or Supabase target would not be safe.

At the approved production-access point, run a read-only count query (or equivalent Prisma `count` calls) after verifying the endpoint and role:

```sql
SELECT "sourceType", count(*)
FROM "PublicCase"
GROUP BY "sourceType";

SELECT count(*) FROM "PublicCaseWorkItem";
SELECT count(*) FROM "PublicCasePartItem";
SELECT count(*) FROM "PublicCaseImage";

SELECT pc."sourceType",
       count(DISTINCT pc.id) AS cases,
       count(DISTINCT wi.id) AS work_items,
       count(DISTINCT pi.id) AS part_items,
       count(DISTINCT im.id) AS images
FROM "PublicCase" pc
LEFT JOIN "PublicCaseWorkItem" wi ON wi."publicCaseId" = pc.id
LEFT JOIN "PublicCasePartItem" pi ON pi."publicCaseId" = pc.id
LEFT JOIN "PublicCaseImage" im ON im."publicCaseId" = pc.id
GROUP BY pc."sourceType";
```

Also record the child counts grouped through `PublicCase.sourceType` for both `FMP` and `WEB_APP`.  Do this only after the migration exists; before then, a missing-table result is expected.

## 3. FMP production import recommendation

Keep `scripts/import-fmp-public-cases.ts` local-only.  Its local URL guard is a valuable protection and must not be relaxed.

The safest production method is a separate, production-only, append-only importer.  It must:

1. Require an explicit production target confirmation and a pinned candidate-file SHA-256/count manifest.
2. Start with a read-only preflight that prints target identity, existing FMP/WEB_APP counts, duplicate `sourceRepairId` values, planned creates, and planned skips.
3. Refuse `--replace`, `deleteMany`, and all deletion paths.  Insert only previously absent `(sourceType=FMP, sourceRepairId)` pairs; this uniqueness key already exists in the Prisma model.
4. Default every inserted FMP case to `NEEDS_REVIEW` + `HIDDEN` for both publish channels.  It must not publish during import.
5. Emit an immutable result manifest: input SHA-256, preflight counts, created IDs/source IDs, skipped duplicate IDs, and post-import counts.  Abort on any unexpected duplicate or count mismatch.
6. Have an independently reviewed, explicit promotion step.  Promotion updates only the approved allow-list of imported FMP IDs to `reviewStatus=APPROVED`, `b2cPublishStatus=PUBLISHED`, and `b2cPublishedAt`; it must not touch `WEB_APP` records.

An export/import SQL approach can be safe only if it has the same append-only conflict handling, manifest verification, and target confirmation.  Temporarily disabling the existing local guard is unsafe because it makes the destructive `--replace` code path reachable against production.

The existing local dry-run artifact describes 2,914 candidate cases, 3,705 work items, 1,468 part items, 1,349 warnings, and zero critical warnings.  Treat these as input expectations only, not production results; regenerate and pin the final artifact immediately before import.

## 4. Production publication policy

Production B2C gallery/detail/home use the common predicate:

```text
reviewStatus = APPROVED
b2cPublishStatus = PUBLISHED
showPriceB2c = false
```

This correctly combines approved/published `FMP` and `WEB_APP` cases.  The current unconditional FMP fallback is explicitly local-only (`isLocalDatabaseUrl()`); it does not apply remotely and must remain that way.  Therefore imported FMP rows need the explicit reviewed promotion above before they appear publicly.  WEB_APP rows follow the same approval and publication workflow, with photos managed in `PublicCaseImage`.

## 5. Deployment runbook

### Before deployment

1. Refresh `origin/main` and confirm the actual deployed revision/Railway service target.
2. Build a PublicCase-only release branch; enumerate every included commit and reject unrelated work-master/parts changes.
3. Create and review the missing PublicCase migration; test upgrade and rollback/recovery on a production-like database snapshot.
4. Verify the migration does not alter or delete existing production application tables/data.
5. Obtain production read-only baseline counts for PublicCase and children, grouped by `FMP`/`WEB_APP`.
6. Regenerate the FMP candidates, review warnings, pin SHA-256 and expected counts, and prepare the approved FMP source-ID allow-list.
7. Review the append-only production importer and promotion tool; prove that `--replace` is unavailable there.
8. Test the exact release branch against a staging copy: migration, preflight, append-only import, promotion, gallery/detail/home, and WEB_APP edit/photo/publish.
9. Back up the production database and preserve the old deployed revision for application rollback.  Do not delete dummy code/data as part of this cutover.

### After deployment

1. Verify the deployed revision and migration state before any import.
2. Re-run read-only counts; `WEB_APP` counts must be unchanged.
3. Run only the importer preflight, compare its manifest to the pinned input, then perform append-only import after approval.
4. Verify post-import counts against the importer manifest; inspect a sample of FMP records and their work/part children.
5. Promote only the approved FMP allow-list; verify the promoted count and timestamps.
6. Check `/cases/gallery`, brand/search filtering, several FMP detail URLs, the home recent-cases section, and an approved/published WEB_APP case with photos.
7. Confirm hidden/unreviewed FMP and unapproved/unpublished WEB_APP cases return no public listing/detail.
8. Monitor application errors and database connection errors, retaining manifests and the pre/post count evidence.

## Next task

Implement and test the release artifact, not the deployment itself: create the missing PublicCase migration; isolate the dependency-complete PublicCase release branch; add a separately reviewed append-only production importer plus explicit FMP promotion mechanism; and obtain authorized read-only production baseline counts.  Deployment, remote writes, and FMP import should remain a later, separately approved task.
