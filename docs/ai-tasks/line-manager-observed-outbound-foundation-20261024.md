# Customer-scoped LINE Manager observed outbound foundation (2026-10-24)

Production: pending. Local schema, migration, and Customer Communication Hub read path only. No production migration, deploy, LINE read/send, importer, or push in this Task.

`LineManagerObservedOutbound` stores text events that a future trusted verifier may establish from Manager history. It is independent of Inquiry and does not confirm an app Outbox or prove that a smartphone was the sender. The table has a verified LineManagerChat and LineUser FK, bot/chat identity snapshots, an immutable provider message ID, source and verification metadata, a unique bot/message pair, and customer history indexes. The composite chat/user FK prevents mismatched identities. There is no Repair or Inquiry association; an uncertain relationship stays unassigned and the Customer Hub still shows the event.

The migration enables RLS and explicitly revokes table access from `PUBLIC`, `anon`, `authenticated`, and `service_role`, plus sequence usage. It adds no Data API GRANT or RLS policy. Only the server's Prisma table-owner connection can access it; future changes to the database role require a separate, least-privilege review. Production migration requires independent security/schema review, backup, and user approval.

The Customer Hub checks current Customer → LineUser linkage and the current verified bot/chat against each stored snapshot. It combines InquiryMessage and observed history by event time, retains existing Inquiry metadata only for InquiryMessage, and displays Manager events as “LINE管理画面履歴から取得”. A linked CONFIRMED Outbox and its InquiryMessage take precedence only when the Outbox's immutable bot snapshot, confirmed provider message ID, and LineUser all match. An InquiryMessage without that immutable bot evidence does not suppress an observation, including after a bot mapping change. This is a read-time duplicate guard, not a cross-table uniqueness guarantee. No unresolved Outbox is confirmed or changed.

InquiryMessage is read in four event-time partitions: inbound receivedAt, outbound sentAt, and each direction's null timestamp falling back to createdAt. Each partition and the observed source has a 501-row bound; the merged display has one exact 500-row cap with stable ordering. This prevents late inserts of old events from displacing newer actual messages. There is no shared cursor or pagination in this Task. The older-history notice is a best-effort indicator. The Customer AI context includes the visible observed source and verification timestamp, but does not independently fingerprint hidden observed rows outside the cap.

The new table remains empty. A later Task must first verify a known live smartphone/Manager message against a read-only history event, establish safe pagination, and receive an independent security design/review for the trusted importer, cross-source concurrency, mapping changes, and Outbox ambiguity. An N8N token alone must never authorize insertion of fabricated observed events.

## Review and local validation checkpoint

- Independent Codex read-only review of schema, migration and UI found two read-model issues: historic bot snapshot for deduplication and event-time bounded pagination. Both were fixed in the implementer session and reviewed by the orchestrating assistant on the changed scope only.
- The dedupe now requires the actual CONFIRMED Outbox bot snapshot; a current chat mapping is not historical send evidence. All four inquiry event-time partitions and observed events contribute to one 500-row cap.
- Prisma schema validation: PASS (dummy local validation URLs; no database network connection).
- Prisma Client generation: PASS outside Codex sandbox; generated local dependencies were restored byte-for-byte to their previous versions after checking.
- TypeScript tsc --noEmit --incremental false: PASS. Focused Node tests: 29/29 PASS. git diff --check: PASS.
- Production migration remains BLOCKED pending explicit user approval, backup, and runtime database-role permission check. No live sync writer exists; actual smartphone outbound remains unsynced until a separate Task.
