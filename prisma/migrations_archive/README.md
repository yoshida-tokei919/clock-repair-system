# Archived migration history

`prisma/migrations/` is intentionally an active, replayable migration chain:

1. `0_production_legacy_baseline` — a schema-only reproduction of production schema B, including the existing PublicCase objects and excluding the seven new `EstimateItem` snapshot columns.
2. `20260904_add_estimate_item_public_case_snapshots` — the only forward schema change from baseline B.

The directories here are historical implementation records, not active Prisma migrations. In particular, `20260904_add_public_case` is archived because its enum/table/FK/index objects already exist in schema B and are embedded in the baseline. Replaying it after the baseline would duplicate those objects.

Production is not to be changed by this archive operation. The future production reconciliation is: verify the B catalog fingerprint, mark only `0_production_legacy_baseline` as applied, verify status, then deploy only the snapshot migration during an approved write window.
