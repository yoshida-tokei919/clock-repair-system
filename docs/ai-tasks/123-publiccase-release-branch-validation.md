# Task 123: PublicCase release branch validation

## Release isolation

`release/publiccase-production` is based on `origin/main`. It reconstructs only
PublicCase serving, the PublicCase schema/migration, safe FMP import/promotion,
and WEB_APP authoring. The source ranges were `ce6f95c`, `19497f9`, and
`1ba89f4`; mixed work-master, RepairLineItem, PartsMaster, dev-preview, B2B,
and generated review-helper changes are intentionally excluded.

WEB_APP draft creation uses the existing `EstimateItem` records rather than the
later `RepairLineItem` schema, so the release has no dependency on that later
work-master range.

## Pinned FMP input

- path: `docs/data/fmp/generated/public-case-candidates.json` (release input;
  retained outside this commit because it is a pre-existing ignored artifact)
- cases: 2914
- work items: 3705
- part items: 1468
- warnings: 1349
- SHA-256: `F2C991DE3B61678E407570DEC30365C125CD5599DBD805433A1A7EDCA2188408`

## Validation note

The migration was executed against a disposable PostgreSQL container. On an
empty database it creates all PublicCase tables and indexes, then correctly
fails at the `PublicCase_repairId_fkey` because the existing `Repair` table is
absent. A full production-like baseline restore was unavailable locally, so
the FK success and Prisma migrate status remain required before production.
