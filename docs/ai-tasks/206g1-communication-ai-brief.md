# Task206G1 — Communication AI brief integration

Production: pending. This Task restores existing Inquiry AI summaries to the newer Customer Communication Hub / Repair communication surfaces and adds a server-internal, immutable AI brief history for Customer / Repair summaries and reply drafts. No production migration, deployment, real LINE send, or production DB mutation has been performed.

## User-visible behavior

- Customer Communication Hub shows the 20 most recent saved `Inquiry.conversationSummary` values per Inquiry with explicit Inquiry/status/time provenance. An earlier-history note appears when more exist. It does not present an older Inquiry summary as a current Customer-wide summary.
- Repair LINE shows the saved AI summary only as the **origin Inquiry-wide summary**, explicitly separated from the newer Repair-specific AI brief. It does not claim the old Inquiry summary is a current Repair summary.
- A latest `CommunicationAiBrief`, when present, can display summary, unresolved items, customer requirements, decisions, and an AI reply draft on Customer / Repair communication surfaces.
- A reply draft is never sent automatically. When current, it can only be copied into the existing manual LINE reply field. The existing outbox / sender / reconciliation / `CONFIRMED` path remains the sending authority.
- If the communication source context has changed since generation, the brief is displayed as stale and the reply draft cannot be copied into the reply field until regenerated.

## AI generation boundary

- Next.js does not call OpenAI directly in this Task.
- Katari / OpenClaw / another trusted local agent can call the authenticated internal context endpoint, generate the brief outside the app, then save it through the authenticated internal brief endpoint.
- Both endpoints use the existing `N8N_INTERNAL_TOKEN` bearer boundary. The token value must never be put in prompts, logs, browser payloads, command arguments, or documentation.
- Context responses include saved communication text and safe metadata only. They do not expose Manager bot/chat IDs, LINE send IDs, external LINE message IDs, raw storage object keys, signed R2 URLs, or secrets.

## Staleness and history

- `CommunicationAiBrief` is append-only from the application path: saving a new AI result creates a new history row rather than overwriting an earlier result.
- Each row stores a SHA-256 `inputFingerprint` derived from the target's safe visible communication projection and server-only history/destination revisions. New messages, relevant routing/classification changes, pending reply changes, or legacy summary/provenance changes cause a different fingerprint.
- Save rejects a newly submitted result when its fingerprint no longer matches current context (`409 stale`). It also rechecks context after persistence and reports `stale: true` if a message or routing change races the save. Exact idempotent retry is deduplicated by a server-derived content hash.
- Reads compare the saved fingerprint with current context and mark older rows `stale`; stale reply drafts are not actionable.
- Human-confirmed message classification / Repair associations are read into the context but are never modified by this Task.

## Independent review findings and fixes

- **A — unrouted inbound LINE:** A Repair fingerprint now includes a customer-wide latest saved LINE message ID watermark. A new message from that Customer changes freshness before it is classified or linked to the Repair. This can conservatively stale sibling Repair briefs. The watermark query checks both message and Inquiry Customer linkage and sends no LINE external ID to AI.
- **B — page-open freshness:** Customer and Repair draft buttons now fetch current state from authenticated Admin routes immediately before copying text. Customer reuses read-only `GET /api/customers/[id]/communications/line`; Repair reuses `GET /api/repairs/[id]/line`. The button requires the same brief ID and draft text, a current fingerprint, and reply eligibility. A stale or unavailable check blocks the copy and asks for regeneration or retry. The browser never calls the internal bearer route.
- **C — routing/classification:** Customer fingerprints now include safe classification and post-intake routing metadata, including Repair association IDs. A separate digest includes routing for messages older than the 500-message display limit. Message body is not needed for routing-only invalidation. Cross-Customer Repair links are excluded from the classification projection.
- **D — multiple LINE destinations:** The Customer AI context exposes the count of sendable destinations and `replyDraftAllowed`, without raw destination IDs. Save rejects a Customer `replyDraft` unless exactly one destination is sendable; other brief fields remain saveable. Reads hide an existing draft if eligibility is lost, and the UI blocks draft application. A change in the sole destination also changes the fingerprint through a server-only destination revision.

The immutable `CommunicationAiBrief` schema and existing unapplied migration are unchanged by these review fixes. Drafts still only copy into the manual reply textarea; outbox creation and real sending remain separate manual operations.

### Second independent review

- **HIGH — old Repair routing changes:** Repair fingerprints now include the same customer-safe routing/classification revision as Customer fingerprints. Association edits beyond the latest 200 displayed Repair messages stale the brief even when the latest Customer message ID is unchanged. The separate latest-message watermark still catches a new unrouted message.
- **MEDIUM — unbounded routing read:** The revision reads only messages with classification or post-intake routing, 200 at a time by ascending message ID. It incrementally hashes canonical scalar and sorted association metadata, checks both message and Inquiry Customer linkage, and excludes cross-Customer Repair links and routing for another Customer. Customer display remains limited to 500 messages.
- **MEDIUM — replaced destination mapping:** A server-only destination digest includes verified mapping identity, evidence, and timestamps for sendable LINE users. Recreating the mapping changes the Customer fingerprint with the same LINE user. Raw mapping identity and Manager destination details remain outside AI context and browser payloads.

The next independent review found the two remaining issues below. Production remains pending.

### Final independent review findings

- **MEDIUM — unbounded legacy summary history:** Customer Hub now fetches at most 21 summary rows: 20 for display and AI context, plus one to signal earlier summaries. A separate server-only SHA-256 revision walks all saved summaries in fixed 200-row Inquiry ID keyset pages. Each page checks the Inquiry's linked LineUser Customer and reads only the latest non-FAILED analysis per Inquiry. The revision includes summary text, Inquiry status/times, and latest analysis identity/status/text/times, so older edits and provenance changes stale the Customer brief without putting hidden summaries in the AI payload. Customer page, internal context, and Admin apply-time GET share this hub behavior.
- **LOW — exact dedupe freshness race:** An exact dedupe hit now re-resolves the context after lookup and returns `stale: true` if the fingerprint changed, matching the post-create and concurrent-unique branches.

These final-review fixes require another independent review. Production remains pending.

### Fresh independent review findings

- **HIGH — pending outbox row IDs:** Customer and Repair AI context now includes only pending reply text, status, and approval time (plus the existing safe Repair association). Internal outbox row identity and state are hashed into server-only fingerprint inputs, so deleting and recreating a pending row with identical visible fields still stales its brief. Neither outbox database IDs nor `sendId` appear in AI context.
- **MEDIUM – Repair destination mapping:** The Repair fingerprint now includes a server-only revision of the verified origin Inquiry LINE mapping and its availability. Replacing or updating the mapping for the same LineUser, or losing and recovering it, changes freshness. Mapping identity, evidence, and timestamps stay out of AI context and browser responses. The authenticated Admin GET still revalidates immediately before a draft is copied into the manual reply field.
- **MEDIUM – routing revision exposure:** Customer and Repair routing revisions now affect only fingerprint inputs; neither revision appears in the returned AI context.

Focused tests cover both outbox projections and identity/state freshness, Repair mapping replacement and loss/recovery, and routing revision isolation. Another final independent review is required. Production: pending.

### Latest independent review: two blocking findings

- **HIGH — replaced verified Repair mapping:** The Repair destination read uses only `LineManagerChat.id`, `evidenceInquiryMessageId`, `verifiedAt`, and `updatedAt` to form a server-only revision included in the Repair fingerprint. It does not retrieve Manager bot/chat IDs. The replacement regression holds the visible chat, send availability, verification time, messages, watermark, and routing fixed while changing mapping identity; the fingerprint changes, and the identity, evidence, and revision are absent from AI context.
- **MEDIUM — routing revision in AI context:** Customer and Repair context snapshots omit `routingRevision`. Each fingerprint retains it as a server-only input. Routing-only changes still alter both fingerprints with identical visible context.

The authenticated Admin GET still revalidates immediately before copying a draft into the manual reply field. Production: pending; a final follow-up independent review is still required.

### Final follow-up finding: older pending replies

- **MEDIUM — pending replies beyond the visible limit:** Customer and Repair continue to show only the latest 20 pending outboxes. A server-only SHA-256 revision now scans all eligible non-terminal rows in fixed 200-row ascending ID keyset pages and hashes only row identity, text, status, and approval time. Customer rows require the Customer reply namespace, no source Repair, and matching Inquiry/chat LINE users linked to that Customer. Repair rows require the origin Inquiry, target Repair and Customer, and matching Inquiry/chat LINE users linked to that Customer. Older edits, replacements, or removals now stale the brief even when the 20 visible replies are unchanged. Neither the revision nor hidden outbox identity enters AI context or browser responses.
- Focused regressions cover Customer and Repair histories beyond 20, a 200-row page boundary, cross-Customer and sibling exclusions, and the existing identity/state secrecy checks. No schema or migration change was made for this fix. Production: pending; final follow-up independent review is still required.

### Final focused independent review

- The final pending-outbox freshness fix was independently reviewed by Katari after Codex implemented it. No blocking finding remains in the bounded pagination, Customer/Repair ownership scoping, fingerprint wiring, or server-only secrecy boundary.
- The reviewed status set exactly matches the four non-terminal `LineManagerSendOutboxStatus` values. The visible pending-reply projection remains capped at 20 while the server-only revision covers all eligible rows in 200-row ascending-ID pages.
- No OpenAI API, `OPENAI_API_KEY`, metered AI SDK, or paid fallback was introduced. Production remains pending; this review does not authorize migration or deployment.

## Schema and Data API boundary
- New table: `CommunicationAiBrief`.
- Optional `repairId` is paired with `customerId` through the existing composite `Repair(id, customerId)` key, preventing a Repair brief from being persisted under a different Customer.
- The migration enables RLS and creates no policies.
- `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no table or sequence privileges. This table is server-internal and is not exposed through the Supabase Data API.
- The migration is created only in `prisma/migrations/20261012_add_communication_ai_brief/`. It has not been applied anywhere.

## Validation

- Latest-main pre-production rebase check restored the existing Repair outbox/reply `id` fields for server-internal Admin/bridge compatibility while keeping pending outbox row IDs stripped from both the Communication AI snapshot and the Repair browser API payload. The browser sanitizer is covered by the Repair LINE regression. Focused Repair/Communication AI/bridge tests PASS; `npx tsc --noEmit --incremental false` and `git diff --check` PASS.
- Older pending-reply fix: focused Communication AI / Customer Hub / Repair LINE / routing / draft / internal-auth tests 45/45 PASS; `npx prisma validate`, `npx tsc --noEmit --incremental false`, and `git diff --check` PASS. `next build` was not rerun because the earlier local worker startup failed with `spawn EPERM`.
- Latest two-finding fix: focused Communication AI / routing / Customer Hub / Repair LINE / draft tests 38/38 PASS; `npx prisma validate`, `npx tsc --noEmit --incremental false`, and `git diff --check` PASS. `next build` was not rerun because its earlier worker startup failed with `spawn EPERM`.
- Focused Customer Hub / Repair LINE / Communication AI / routing and summary revisions / draft freshness / internal-auth tests: 39/39 PASS after the final-review fixes.
- Fresh-review focused tests, including internal route auth: 42/42 PASS.
- `npx prisma validate`: PASS.
- `npx tsc --noEmit --incremental false`: PASS.
- `git diff --check`: PASS; line-ending warnings are informational.
- Initial implementation `npx next build`: PASS; compiled, lint/type-checked, and generated 59/59 static pages. The post-review `npx next build` attempt stopped at worker startup with `spawn EPERM` in the local execution environment, before compilation completed. This is a build execution failure, not a reported code/type assertion failure; the post-review build remains unverified.
- Normal `prisma generate` is currently blocked locally by a Windows `EPERM` lock on `node_modules/.prisma/client/query_engine-windows.dll.node`. This is an environment/file-lock failure, not a schema validation failure. Do not terminate unrelated local processes merely to clear it without review.

## Review / rollout boundary

This Task includes schema/migration and therefore is high risk. The initial implementation was completed by Katari after Codex hit its usage limit. Independent reviews reported findings A–D, the three second-review findings, and the two final-review findings above. The final Task206G1 fixes have now received independent review with no blocking finding. Commit may proceed, but do not apply the migration, push/deploy, or change production until the user explicitly approves the production step.
