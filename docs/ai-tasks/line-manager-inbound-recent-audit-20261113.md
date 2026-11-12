# LINE Manager recent inbound discrepancy audit — Task 3 stage 1

This is a manual, read-only comparison of the newest Manager history page (at most 100 events) for each verified, linked chat. The CLI holds the shared `lineoa_operation` lock, reads the fixed dedicated lineoa storage, and uses the existing authenticated internal mapping list. It accepts only inbound text/image events with exact chat and immutable message IDs, excluding the newest five minutes. The comparison route checks mapping evidence again and reads bounded canonical messages and image files. Output contains counts only.

`historyComplete` is always `false`. A backward cursor only sets `hasEarlierHistory`; the cursor is never followed because prior testing showed no progress. A successful run establishes only the recent first-page comparison. Missing messages, missing stored images, and mismatches are observations for human review. No recovery, import, alert, scheduler, LINE send, or production change is part of this stage.

Local verification: `python -m unittest scripts/test_line_manager_inbound_audit.py`, `npx tsx --test src/lib/line-manager-inbound-audit.test.ts`, `npx tsc --noEmit --incremental false`, and `git diff --check`.

Production: pending.
