# LINE Manager history coverage audit — 2026-10-24

Production: pending.

## Read-only evidence

An orchestrator read probe of existing authenticated LINE Manager history checked three chats with `limit=10` and `before=backward` for up to five passes. The chats returned 18 events / 15 message IDs, 7 / 4, and 21 / 14 respectively. Each pass returned the same message ID set for its chat even while the backward cursor changed. No additional IDs appeared. The probe made no send or import. This does not establish working historical pagination.

## Local Task result

Confirmation validates an exact prior observed outbound row under the shared advisory lock and retains its `verifiedAt` and evidence digest for audit. A matching history replay with both that observation and the confirmed canonical source is counted as existing only after identity, destination snapshot, body, timestamp, and digest checks. Conflicting evidence still aborts. The confirmed `InquiryMessage` remains the authoritative business send; Customer Hub suppresses the matching observed row in its display, so two persisted records produce one visible message.

The optional `--verify-pagination` diagnostic reads at most two pages per chat with the returned backward cursor and reports count/status only. Repeated pages or zero new event evidence stop with `nonprogress`. It is mutually exclusive with `--apply`. The apply path remains limited to the recent first page and reports `historyComplete: false`.

## Gate

Unsupported history pagination remains the blocker to historical coverage. Do not claim complete coverage, schedule the worker, or activate the first-page worker in production. Independent review and explicit production approval remain pending; no production DB, migration, deployment, LINE send, or real import is part of this Task.

## Local verification / independent review checkpoint

- TypeScript focused tests: 28/28 PASS; Python unit tests: 10/10 PASS; Prisma Client generation followed by TypeScript `--noEmit` check: PASS; `git diff --check`: PASS.
- Separate Codex independent review found one blocker in pagination progress detection: changing chat-read events must not count as newly fetched historical messages. The implementer corrected the check to count only immutable message IDs, added a regression test, and the same independent reviewer re-reviewed only the affected files and reported no blockers.
- The earlier independent review found no blocker in non-destructive evidence retention and idempotent replay; existing app-confirmed `InquiryMessage` remains authoritative for UI, while the Manager observed evidence remains stored for audit.
- The LINE Manager history cursor did not advance in the three-chat read-only probe. Thus actual pagination is **unverified/nonfunctional on tested chats**, and historical/full synchronization MUST remain disabled. No real import, production migration, key provisioning, recurring worker, LINE send, deploy or push was performed.
