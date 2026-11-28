# B2C delivery number correction plan (not executed)

## Scope and observed code

- Proposed correction: `DeliveryNote.id = 16`, `CD-001` → `CD-892`; the next C-prefix delivery should be `CD-893`.
- `generateBulkDocument` in `src/actions/document-actions.ts` finds the highest-ID `DeliveryNote` whose `slipNumber` starts with the customer prefix, parses all digits from that number, adds one, creates the note, then writes `Customer.seqDelivery`. The counter is not the source of the next number. These operations are not one transaction.
- `DeliveryNote.slipNumber` is unique. `InvoiceRepairSnapshot.deliverySlipNumber` and `ConsolidatedInvoiceDeliveryNote.slipNumber` are copied values that may need the same correction. The latter has a scalar `deliveryNoteId`, not a relation to `DeliveryNote`.
- No production DB was accessed for this plan. The current values, ownership, references, and PDF publication state remain unverified.

## Preconditions for a separately approved production operation

1. Pause delivery-note issuance and take a verified production backup. Record the production application commit and deployment ID.
2. Read `DeliveryNote.id = 16`, its `customerId`, `slipNumber`, `issuedDate`, and linked repairs; read that customer's `type`, `prefix`, and `seqDelivery`. Require an individual customer, prefix `C`, and current slip exactly `CD-001`.
3. Inspect **all** `DeliveryNote` numbers starting with `C`, ordered by ID, and separately search exact `CD-892` and `CD-893`. Require `CD-892` to be unused and ID 16 to be the latest matching note. If any later C-prefix note exists, stop and recalculate the full sequence impact; correcting ID 16 alone cannot guarantee the next number.
4. Read every `InvoiceRepairSnapshot` with `deliveryNoteId = 16` and every `ConsolidatedInvoiceDeliveryNote` with `deliveryNoteId = 16`. Check any matching old slip with a null ID individually before treating it as related. Inspect linked invoices, current/historical PDF files, customer-visible publications, and already sent or printed copies. If a frozen or sent artifact contains `CD-001`, decide its reissue/communication treatment before changing the DB.
5. Confirm no other customer uses prefix `C` in a way that changes the latest-note lookup. Confirm there is no concurrent document creation during the correction and the following test issuance.

## Guarded transaction (future approval only)

1. In one transaction, lock the target `DeliveryNote`, its `Customer`, and the related snapshot rows; repeat every precondition that could have changed. Require exact old values and expected row counts. Abort on any mismatch.
2. Update only `DeliveryNote.id = 16` from `CD-001` to `CD-892`, linked `InvoiceRepairSnapshot.deliverySlipNumber` values from `CD-001` to `CD-892`, and linked `ConsolidatedInvoiceDeliveryNote.slipNumber` values from `CD-001` to `CD-892`. Do not rewrite a snapshot whose identity or old value does not match.
3. Set only that customer's `seqDelivery` to `892`, with a guard on its preflight value. Do not alter `currentSeq`, other customers, financial amounts, dates, or schema.
4. Commit only if the target and related snapshot counts match the preflight inventory. Re-read the note, snapshots, uniqueness, and counter immediately afterward.
5. With issuance still controlled, verify the next eligible C-prefix creation would select ID 16 and calculate `CD-893`. After a separately authorized real issuance, verify its saved slip and `seqDelivery = 893`. Do not create a dummy production delivery note merely to test numbering.

## Stop conditions and rollback

- Stop for any duplicate, later C-prefix note, unexpected snapshot value/count, changed customer, concurrent issuance, or already distributed artifact without an agreed reissue decision.
- Keep the prechange inventory and backup. If the transaction fails, roll it back as a unit. If a discrepancy is found after commit, stop issuance and use a separately reviewed reverse correction or backup recovery plan; do not silently overwrite newer documents.

Production: pending. This file authorizes no DB query, write, deployment, commit, or push.
