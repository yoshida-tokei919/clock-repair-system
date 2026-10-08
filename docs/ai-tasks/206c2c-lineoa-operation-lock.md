# Task206C2C — LINE Manager sender and mapping operation lock

Production: pending

## Repository change

- The continuous sender holds `sender-service.lock` for its lifetime, so a second sender fails closed. It waits at most five seconds for shared `lineoa-operation.lock` while restoring lineoa storage and at the start of each complete reconciliation/send cycle. On contention, it emits only `status=lineoa operation busy; retry next cycle`, sleeps the normal poll interval, and retries; `--once` exits nonzero. No LINELib bootstrap, cycle, or Manager POST occurs without the operation lock. The operation lock is released before the 30-second poll sleep. Existing `--allow-send`, fence, one-POST-per-cycle, and reconciliation rules remain unchanged.
- Mapping uses the same operation lock across `LINELibAdapter.from_storage`, Manager chat/history reads, and optional internal verify. It waits at most three seconds; a busy lock yields zero-count `lineoa_operation_busy` with exit 1. It never sends LINE or creates an outbox. Exact identity evidence remains `InquiryMessage.externalMessageId ==` Manager inbound `message.id`.
- C2A and C2B wrappers allow the new sanitized status. The C2B Windows named mutex continues to serialize mapping runs and alert state independently of the lineoa operation lock.
- No schema, migration, RLS, GRANT, API, n8n workflow, Scheduled Task, or live service change is included.

## Activation plan (later, with separate authorization)

The deployed launcher was inspected read-only at `C:\Users\yoshi\line-manager-sender-service\start-line-manager-sender.ps1`. It runs `runtime\line_manager_sender_worker.py` with a 30-second poll and forwards `-AllowSend` to `--allow-send`; that runtime worker still holds the old `worker.lock` for its lifetime. The repository source change alone does not upgrade that process or copy.

1. Confirm the actual Scheduled Task action and deployed runtime version before changing either. In the effective environment of **both** the Scheduled Task sender process and the n8n mapping process, resolve `LOCALAPPDATA` to an absolute path and append `clock-repair-system\line-manager-sender\lineoa-operation.lock`. The expected shape is `%LOCALAPPDATA%\clock-repair-system\line-manager-sender\lineoa-operation.lock` (an absolute Windows path after expansion). Compare the two normalized absolute paths before activation; if either `LOCALAPPDATA` is missing or the paths differ, fail closed and do not activate mapping. Record only the path comparison result, without auth storage, tokens, or other secrets.
2. Stop the old sender process before switching its runtime files, so the old `worker.lock` holder cannot operate lineoa without the new shared lock. Update the runtime copy and restart the sender under the existing `-AllowSend` policy. Confirm exactly one sender holds `sender-service.lock` and that it releases `lineoa-operation.lock` between cycles. Do not run old and new sender versions together.
3. Only after the updated sender is confirmed active, activate the C2B n8n mapping workflow. Perform a non-sending smoke for idle mapping, busy-lock sanitized outcome, exact-ID verification behavior with approved test evidence, and normal sender health. Do not treat a mapping result obtained while the old runtime is active as concurrency-safe.
4. Record runtime version, activation time, and production validation in a later deployment checkpoint. This repository-only Task remains pending until that work is done.
