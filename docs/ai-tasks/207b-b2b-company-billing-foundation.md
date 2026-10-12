# Task207B — B2B company and billing destination foundation

Production: pending. Task207B is committed separately from Task207A and Task207C; no production migration, push, or deployment is part of this Task.

## Scope and contract

- `B2BCompany` is an explicit company group. Its `name` is an admin label, not a matching key for `Customer.name` or `Customer.companyName`.
- `B2BCompanyMembership` links each business store Customer to at most one company. Multiple store Customers may belong to one company.
- `B2BCompany.billingCustomerId` identifies one member store/HQ Customer as the billing destination. A composite foreign key to membership prevents a cross-company billing destination. A database trigger rejects B2C membership and rejects changing a member Customer to B2C.
- Admins configure these values on the existing Customer edit page. A new company starts with the current store as its billing destination. The destination must be changed before that member can leave.
- Admins can dissolve a company with exactly one member when that member is the current billing destination. The transaction clears the billing destination, removes the sole membership, and deletes the empty company under the company row lock. The Customer then uses standalone billing again. Multi-store companies cannot use this shortcut.
- `resolveEffectiveBillingCustomer(db, sourceCustomerId)` returns `{ sourceCustomerId, companyId, billingCustomerId }`. For a Customer without membership, `companyId` is `null` and `billingCustomerId === sourceCustomerId`. For a configured group, it validates that the designated destination remains a business member of that company and fails closed for missing or inconsistent configuration.
- Task207C should use this resolver to determine the billing identity for existing invoices. It must keep the source store on `Repair.customerId`, `DeliveryNote.customerId`, `Invoice.customerId`, and `Shipment.customerId` according to their existing meanings; any aggregate invoice layer is Task207C work. Shipment destination fields remain their existing shipping source of truth.
- Task207C should call the resolver within its aggregation transaction and define when the billing customer ID is fixed for the aggregate, since an admin can later change company membership or destination.

## Migration and Data API

Migration: `20261013_add_b2b_company_billing_foundation`.

The two new tables are used only through authenticated Next.js routes and Prisma/direct PostgreSQL. They are server-only: RLS enabled, no RLS policies, and explicit `REVOKE ALL` for `PUBLIC`, `anon`, `authenticated`, and `service_role` on both tables and the new serial sequence. No Data API GRANT is needed. Existing records are not backfilled or matched by company name. The migration creates no invoice or shipping changes.

## Local validation

- `npx prisma validate`: passed.
- `npx tsx --test src/lib/b2b-company.test.ts`: passed (membership, billing destination, standalone fallback, B2C, cross-company and incomplete configuration).
- Follow-up focused test passed for valid one-store dissolution and rejection of zero/multiple members, another member, and changed billing destination. Direct-impact independent re-review found no blocking issue.
- `npx tsc --noEmit`: passed.
- Migration SQL inspected for foreign keys, B2C guards, RLS, and GRANT behavior.
- `npm run build`: blocked at `prisma generate` by Windows `EPERM` unlinking the existing Prisma query engine DLL. `npx next build` separately reached Next.js and was blocked by environment `spawn EPERM`; neither is an application assertion failure.
- `git diff --check`: passed.
- Independent read-only review found no blocking issue in the schema, migration, API, resolver, or UI.

Production rollout remains pending with Task207C per the approved sequence. A production backup and explicit approval are required before applying this migration.
