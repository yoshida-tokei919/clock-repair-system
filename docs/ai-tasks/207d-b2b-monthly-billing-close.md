# Task207D — B2B monthly billing close

## Scope

- B2B invoices created from `/invoices` persist the selected `YYYY-MM` billing month. The server accepts only selected, uninvoiced repairs for that customer whose delivery notes were issued during that month in Asia/Tokyo.
- B2B payment due date is calculated from the billing month as the last calendar day of the following month. The client cannot override it.
- The repair-list bulk invoice path derives a B2B billing month from delivery notes and requires all selected repairs for each customer to share it.
- `/invoices` shows the automatic due date and keeps its existing preview and selection flow. B2C due date behavior stays unchanged.
- Existing Invoice fields are reused; no schema or migration changes.

## Validation

- `npx tsx --test src/lib/b2b-billing-month.test.ts src/lib/invoice-numbering.test.ts src/lib/invoice-repair-snapshots.test.ts`: 10 passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed for tracked changes.
- `next lint` could not run because this repository prompts for an initial ESLint configuration.

## Production

Complete on 2026-10-13.

- Application commit: `d14b521`.
- Railway production deployment: `13ab5c66-fbbc-4604-9c7a-2303e8de6326` — SUCCESS (`sin`).
- Production build: Prisma Client generation, Next.js compile / lint / type validation, static generation 59/59 — PASS.
- Production smoke: `/`=200, `/login`=200, unauthenticated `/invoices`=307 to login, `/api/invoices/preview?...`=401 — PASS.
- No schema, migration, environment-variable, or production DB change; no production backup required.
- Production tag: `production-task207d-20261013`.
