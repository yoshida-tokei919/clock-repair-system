# LINE Manager observed outbound sync, forward only — 2026-10-24

Production: pending.

Old already-sent outbound history is excluded. The existing inbound records and app-confirmed outbound history remain unchanged. This observer reads Manager history and never calls `lineoa` send; the shared `lineoa_operation` lock remains in place. No paid AI API, push, deployment, real import, or scheduled task is part of this Task.

## Activation cutoff

`LINE_MANAGER_SYNC_START_AT` must be chosen explicitly at actual future activation, in exact UTC millisecond form `YYYY-MM-DDTHH:mm:ss.sssZ`. Use the same string on the server and Windows Worker. Neither commit nor deploy time establishes it. A missing, malformed, or future cutoff stops Worker `--apply` and API import. Each HMAC-signed batch carries that exact string; the server rejects an omitted or mismatched value before any DB transaction. Events at or before the cutoff are excluded by the Worker and rejected by the server, including in a mixed signed batch. A changed cutoff is not a supported way to recover history; stop and review first.

## Coverage limit and checkpoint

The Manager `before` cursor did not advance in the real three-chat probe recorded in [the coverage audit](line-manager-history-coverage-audit-20261024.md). The Worker reads only the first page and always reports `historyComplete: false`. Under the shared operation lock, `--apply` scans every verified chat before any import. It stores a version 2 local checkpoint at `%LOCALAPPDATA%\clock-repair-system\line-manager-observed-sync-checkpoint.json`, containing the exact cutoff, last successful scan time, SHA-256 digests of bot/chat and message IDs, and a persistent `initialCoverageUnverified` flag. No message text, raw provider identifier, or token is stored. It atomically replaces the file only after every batch succeeds with zero deferred events. A corrupt file, version or cutoff mismatch fails closed; do not delete or reset the file as routine recovery.

A prior chat with message IDs must retain at least one ID in the current first page. If none overlap, the Worker reports `coverage_gap_possible`, imports nothing for any chat, leaves the checkpoint unchanged, and exits nonzero. A new chat or first run has no anchor and reports `coverage_unverified` with nonzero exit; a full first page whose oldest timestamp is strictly after the cutoff is treated as a possible gap and imports nothing. Deferred batches also exit nonzero without advancing the checkpoint. An overlapping later run may report `synced_with_overlap`, while `startupCoverageUnverified: true` persists to disclose the unverified baseline. An empty page cannot establish an anchor. These checks are best-effort gap indicators, **not proof of complete coverage**: a short page can still be incomplete, and a missing checkpoint can only be treated as an unverified first run. If the file disappears after a successful run, prior continuity cannot be recovered automatically. Authentication or operation-lock failure reports unavailable and never advances the checkpoint.

## Production preparation sequence

1. Review the foundation migration and production backup plan, then obtain explicit approval before applying any migration. This Task applies none.
2. Agree on one activation instant and provision `LINE_MANAGER_SYNC_START_AT` as the same exact UTC string on server and Windows Worker. Provision a separate HMAC signing key securely under explicit approval; do not put secrets in repository or logs.
3. Restore verified Manager access and run a manual dry-run first, without `--apply`. Review sanitized counts, `historyComplete: false`, and any unavailable status.
4. With user approval, review one sanitized sample of a verified recent send and the cutoff boundary. Do not infer full coverage from that sample.
5. Independently review the checkpoint behavior and its best-effort limits before considering `--apply` or a recurring schedule. Review any `coverage_gap_possible` or `coverage_unverified` result as an operational exception; do not claim full coverage. Add Task Scheduler only under separate explicit approval. No scheduled task is installed here.

The existing HMAC and Bearer checks, immutable mapping and outbox validation, and first-page limit remain in force.

## Local independent review and test checkpoint

- Independent read-only reviewer found two launch blockers: nonzero exit status for gaps/unverified/deferred conditions and signed Worker/server activation-time mismatch. Both were corrected; the same independent reviewer rechecked the direct affected code/tests and reported no remaining blockers in those fixes.
- Local Prisma Client generation and TypeScript `--noEmit` check: PASS. Focused TypeScript tests 29/29 PASS, Python tests 15/15 PASS, `git diff --check` PASS. Temporary generated Client was restored to the original files.
- This remains **Production: pending**. The dedicated Manager observer was not installed/scheduled or run against live LINE history; the new table migration was not applied and no production secrets or environment variables were provisioned. Production rollout needs backup, runtime role check, explicit approval for migration/deploy/env/config and first real import. Runtime first-page coverage is best effort only.
