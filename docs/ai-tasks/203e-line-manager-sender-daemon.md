# Task203E — LINE Manager sender daemon

## Scope and state

Task203A created APPROVED completion-notice outboxes without sending LINE. Task203E adds a local sender service, a global unresolved-post guard, bounded pre-send retries, and Windows Scheduled Task scripts. It changes no schema, migration, RLS, GRANT, UI, Shipment, n8n workflow, or LINE Messaging API path.

Production: pending. This worktree has not been committed, pushed, deployed, or installed as a Scheduled Task. No real LINE POST was run. The known production `repair-completion-notice:1` outbox (#4) is `APPROVED` with zero attempts; this task makes no production DB mutation.

## Safety contract

- The worker calls reconciliation before each possible send claim. Any claimed reconciliation with missing local evidence, unavailable or ambiguous Manager history, or rejected confirmation ends that cycle without another send. If no reconciliation candidate is claimable because a lease is active, the server's global guard still blocks send claims and fences while any `POST_UNCONFIRMED` exists.
- Both the direct safe-claim helper and the fence take the same PostgreSQL transaction advisory lock and check for **any** `POST_UNCONFIRMED` row before changing state. A preexisting claim cannot bypass the guard by fencing later. `POST_UNCONFIRMED` is never a send candidate.
- `PRE_SEND_FAILED` uses persisted `sendAttemptCount` and `lastAttemptAt`. Attempt counts 1–4 wait 30, 60, 120, and 300 seconds respectively before retry. The fifth attempt is terminal for automatic send claiming. An expired `CLAIMED` lease can be reclaimed only below five attempts. This requires no new column or migration.
- The original sender still persists pre-send evidence before fence and a post-invocation marker before the one Manager POST. A restart retains that evidence for reconciliation. Actual OUTBOUND `InquiryMessage` creation remains exclusively in server confirmation.
- The CLI defaults to reconciliation-only. `--allow-send` is required to call `process_send_once(..., allow_send=True)`. Its single-instance OS file lock prevents two processes for the same Windows user from running concurrently. The lock file contains no secret.
- The only API origin is the existing production origin. Storage is the fixed `%LOCALAPPDATA%\clock-repair-system\linelib-poc\lineoa-storage.json`; the worker uses existing private lineoa 7.7.18 textV2 sender with the persisted DB `sendId`. No Messaging API Push, cookie/token/ID/body output, or auth storage in the repository.

## Windows operation

`scripts/start-line-manager-sender.ps1` runs the worker from `C:\Users\yoshi\clock-repair-system` with Python 3. It reads `N8N_INTERNAL_TOKEN` from the Windows **User** environment into the child process, never from a command argument. Logs go to `%USERPROFILE%\line-manager-sender-service\logs` as separate timestamped stdout/stderr files. The launcher defaults to non-sending; `-AllowSend` must be explicit.

`scripts/install-line-manager-sender-task.ps1` is a preview without `-Enable`. After a separately authorized deployment into the canonical repository and operator decision, `-Enable` registers or updates `ClockRepair-LineManagerSender` for the current user's interactive logon and enables it. Its action passes `-AllowSend`; the settings use `MultipleInstances=IgnoreNew`, `StartWhenAvailable`, one-minute restart interval, ten restarts, unlimited execution time, and allow continued operation on battery. It does not alter an n8n task. Interactive logon is required for the user's lineoa auth profile and User environment. Installation and enablement were not performed here.

## Validation

- Existing and new Python sender/worker unit tests: 34 passed; fake adapters only, no network or LINE POST. Pre-send exceptions are reduced to a fixed error before reaching the internal API.
- Outbox and internal sender Node tests: 25 passed.
- TypeScript `tsc --noEmit`: passed.
- PowerShell parser: zero errors. Windows ScheduledTasks settings/principal/trigger object construction succeeded without registration.
- Next.js production build: passed, including compile, lint/type validity, and static pages 56/56.
- `git diff --check`: passed.

Production activation needs a separate deploy and explicit approval to enable/start the Scheduled Task with `-AllowSend`. Outbox #4 is eligible as the first real send once sending is enabled, so that approval must account for a possible immediate LINE send. If the operator does not want #4 sent, cancel it before activation. Once #4 is fenced for POST, it must only be reconciled and never resent. It is not claimed or mutated by this local validation.
