# Task 108-10F: Ensure Structured Work Field Round-Trip

## Purpose

Confirm and preserve the structured work fields after saving a normal repair, reopening it, saving again without changes, and reopening again.

Structured fields covered:

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabelSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`

## Changed Files

- `src/app/(app)/repairs/[id]/page.tsx`
- `src/components/repairs/RepairEntryForm.tsx`

## Investigation

The save path was already sending the structured work fields from `RepairEntryForm` into `body.estimate.items[]`.
`estimateItemsLikeToRepairLineItemInputs()` and `replaceRepairLineItems()` were already able to persist those fields into `RepairLineItem`.

The gap was the reopen path. The repair detail page populated `initialData.estimate.items[]` from `EstimateItem`, but `EstimateItem` intentionally does not store the structured work fields. Those values live on `RepairLineItem`, so reopening a repair could hydrate `lineItems` without the structured fields and a no-change save could send them back as `null`.

## Initial Data Shape

`EstimateItem` does not have a `sortOrder` column in `prisma/schema.prisma`, so no schema or migration change was made.

`src/app/(app)/repairs/[id]/page.tsx` now includes `repairLineItems` ordered by `id`, and orders `estimate.items` by `id`.

Before passing `initialData` into `RepairEntryForm`, the page overlays structured fields from LABOR `RepairLineItem` rows onto LABOR `estimate.items[]` entries by LABOR ordinal. It does not overlay by raw mixed row index, so PART rows cannot consume or shift structured work fields.

For part rows, the page explicitly provides `null` for all structured work fields.

## Form Hydration

`RepairEntryForm` now restores these fields when creating `lineItems` from `initialData.estimate.items`.

Labor rows keep:

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabelSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`

Part rows explicitly hydrate those same fields as `null`.

## Save Payload

The existing save payload behavior was kept:

- LABOR rows send the structured work fields.
- PART rows send `null` for the structured work fields.

This keeps `targetPartNameId` separate from `partsMasterId`:

- `targetPartNameId` is the labor row's work target part name.
- `partsMasterId` is the actual selected/replaced inventory part for part rows.

## Unchanged Areas

No changes were made to:

- schema, migrations, seeds, or DB structure
- `EstimateItem` schema or persistence
- `EstimateItem` `sortOrder` because that field does not exist
- pricing rule search conditions
- `PricingRule.suggestedWorkName` sync behavior
- `RepairWorkName` seed data
- `RepairWorkDetailMaster`
- `relatedWorkLineItemId`
- PART row `partsMasterId` / `PartsMaster` selection flow
- normal repair detail display
- estimate, invoice, PDF, LINE, shared page, or PublicCase displays

## API Routes

`src/app/api/repairs/route.ts` and `src/app/api/repairs/[id]/route.ts` were inspected.

No route changes were needed. Both routes already convert `body.estimate.items[]` through the repair line item adapter and write to `RepairLineItem`. The missing piece was the detail-page `initialData` hydration used by the edit form.

## Verification

Executed:

```powershell
npx prisma validate: OK
npx prisma generate: OK
npx tsc --noEmit --pretty false --incremental false: OK
```

Note: the first sandboxed Prisma runs failed with `ECONNREFUSED 127.0.0.1:9` while checking the engine binary. They passed after rerunning with approved network access.

Manual check target:

1. Add a labor row.
2. Select work category, target part, action, and detail.
3. Save.
4. Reopen the repair.
5. Save again without changing anything.
6. Reopen again and confirm the structured work fields are still present in the form state or API/network data.

## UI Confirmation

Target screen:

- repair detail / edit page
- labor row add flow
- structured work input controls for work category, target part, action, and detail

Observed on local dev server `http://localhost:3011/repairs/new` with Playwright:

- The new repair form opened successfully after setting a local NextAuth verification cookie.
- With the add-row type set to `技術料`, the `詳細な作業分類を入力する` button was visible.
- Opening it displayed `作業カテゴリ`, `対象部品`, `処置`, and `detail` input controls.
- The three structured selects were visible, enabled, and measured about `159px x 28px`.
- The detail input was visible, enabled, and measured about `159px x 28px`.
- Switching the add-row type to `交換部品` hid the structured work button and labels.

Not executed:

- A save/reopen/save manual DB round-trip was not performed from the browser because the UI session was created only for local verification. The persistence path was verified by code inspection and TypeScript/Prisma checks.

## Next Task Idea

Add a focused automated regression test for detail-page hydration from `RepairLineItem` into `initialData.estimate.items[]`.
