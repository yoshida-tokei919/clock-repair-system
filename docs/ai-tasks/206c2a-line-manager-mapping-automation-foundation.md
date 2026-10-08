# Task206C2A — LINE Manager initial verified mapping automation foundation

Production: complete

## Scope

- Windows-local `scripts/start-line-manager-mapping.ps1 -Apply` is the fixed repo-owned entry point for later n8n Execute Command wiring. It reads `N8N_INTERNAL_TOKEN` from the Windows User environment, invokes the mapping worker against the fixed production origin, and emits only fixed status names and counts. Task206C2B owns n8n workflow wiring.
- The Python worker remains dry-run by default. The wrapper requires `-Apply`, and each worker invocation can verify at most one mapping. The internal verify API retains server-side `createVerifiedLineManagerChat()` revalidation.
- Mapping evidence remains only exact `InquiryMessage.externalMessageId ==` Manager inbound `message.id`. Existing 20-candidate, five-evidence, 25-chat-per-bot, and 100-history-message limits remain. Ambiguity fails closed; already mapped LineUsers remain excluded by the candidate query.
- Even with zero candidates, the worker performs authenticated read-only Manager chat and history calls. No readable chat history, malformed data, or a read exception reports `manager_live_read_unavailable`, not an assumed auth expiry. Verify endpoint HTTP 409 reports the sanitized `mapping_conflict` status and stops without retry, fallback, or overwrite; response bodies are not read. Authentication, service, network, and other internal API failures report `internal_api_unavailable`; missing local configuration reports `configuration_failure`.
- Task206C2C supersedes the original `worker.lock` contract: mapping holds shared `lineoa-operation.lock` across bootstrap, Manager reads, and optional verify, with a three-second acquisition limit. It can run while the sender service is idle between cycles; an active lineoa operation returns sanitized `lineoa_operation_busy`.
- After inbound `InquiryMessage` save, the existing Slack notification kind/outbox adds a brief pending-destination signal when that LineUser lacks a verified `LineManagerChat`. No customer message body is added.

## Safety

- LINE Manager calls are limited to `get_chats(bot_id, 25)` and `get_chat_messages(bot_id, chat_id, limit=100)`. No send, mutation, mark-read, or Manager state change is enabled by this launcher.
- The launcher does not accept a token argument or local origin. It suppresses worker stderr and re-emits only allowlisted status/count output. It restores both process environment variables it sets after invocation, including when dot-sourced. The token, customer content, Manager/LINE identifiers, external message IDs, cookies, and traceback must not enter its output.
- The later n8n command must run under the Windows user that owns the User environment token and fixed lineoa storage. This task does not configure that runtime.
- Next.js/Railway do not operate lineoa. No n8n runtime/workflow, Scheduled Task, sender, schema, migration, production DB, or real LINE send change is part of this task.
- Production activation/deploy requires user approval. The local implementation here is not production activation.

## Validation

- Focused Python mapping tests: 24/24 PASS. Fake Manager/API readers cover zero-candidate live probe, exact evidence, ambiguity, explicit apply, verify HTTP 409 -> sanitized `mapping_conflict`, generic handling for other API failures, environment restoration, and launcher no-send boundary.
- Focused LINE inbox Node tests: 14/14 PASS. The pending Slack text is present only while the saved Inquiry LineUser lacks a verified `LineManagerChat`; customer message body is not added.
- TypeScript `--noEmit --incremental false`: PASS.
- PowerShell parser for `scripts/start-line-manager-mapping.ps1`: 0 errors.
- `git diff --check`: PASS.
- Independent final Codex re-review after fixes: High / Medium / Low findings 0. Exact-ID identity, conflict handling, environment restoration, no-send boundary, sender lock, and Task scope were rechecked.
- No live LINE Manager read, real LINE send, production DB mutation, n8n workflow change, Scheduled Task activation, push, or deploy was performed for this local validation.
## Production activation - 2026-10-08

- Task implementation commit after Task208B rebase: `5990d8f` (`feat: automate initial LINE Manager mapping`).
- Production activation snapshot: `5f6bd6905fe46d9bffd3448a28b8ba7f42bdf3d6`; Railway deployment `bbc10b35-c235-49d7-88be-0baefc262440` completed `SUCCESS`.
- Windows-local mapping runner is live through n8n and continues to use only exact inbound message-ID evidence. Push API is not used.
- Owner-account real inbound self-test: `LineInboxProc001` execution `25045` succeeded and automatically invoked `LineManagerMap001` execution `25046`, also `success`. The mapping result was `healthy_no_candidates`, which is expected because that LineUser was already verified; the existing verified mapping was not deleted or recreated for testing.
- The self-test therefore verifies the production trigger, Manager live-read probe, and already-verified reuse path. A genuinely new LineUser will provide the next natural observation of first-time automatic verification; no unsafe synthetic or destructive remapping was introduced to force that case.
- Final combined LINE regression before activation: sender 9/9, existing sender logic 29/29, mapping 25/25, n8n adapter 19/19, TypeScript and PowerShell syntax PASS; independent review had no remaining High/Medium/Low blocker before activation.
