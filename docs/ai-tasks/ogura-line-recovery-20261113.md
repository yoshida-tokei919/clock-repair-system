# Ogura LINE inbound recovery, isolated implementation

Production: pending. This task adds one fixed internal endpoint and a local, one-time CLI for two previously verified inbound events. No production read, write, commit, push, or deploy was performed during implementation.

## Scope and evidence

- Target: verified `LineManagerChat` 12, `LineUser` 102 linked to `Customer` 16, and `Inquiry` 13 with status `CLOSED`.
- Image: SHA-256 of its LINE message ID `3a8b8911bb3ede6876230b623fafef9c4308a563812871687aeddf47c95c4c22`, Manager timestamp 1794319649332. The original is available from the official LINE content endpoint; the recovery preflights an image response of at most 20 MiB.
- Text: SHA-256 of its LINE message ID `19bf5fd7cee506208dedef4c001fd7ab8f1b0adcda0453692bbbf0d527736fc2`, Manager timestamp 1794319904836, 448 Unicode code points, SHA-256 of UTF-8 body `b5c88ead067d3fe2c9cf4af7664d10ad5780a540efc75671529faade61bfeeb6`.
- No raw message IDs, message body, token, or content is kept in the repository. The local CLI reads the fixed Manager chat under `lineoa_operation`, constructs the bounded request in memory, and prints counts and status only.

## Workflow

The CLI defaults to `--dry-run`, which invokes authenticated `check`. `--apply` is explicit and must only be used after independent review and production authorization. The route uses `N8N_INTERNAL_TOKEN` authentication; the CLI uses the existing fixed production origin and dedicated LINELib storage. Neither path sends LINE messages or changes Slack.

The CLI's shared internal HTTP client has a 15-second timeout. If `--apply` reports `unavailable` after a timeout, the server may still be processing. Before any retry, perform a fresh **read-only** `--dry-run` and read-only DB status verification of both `InquiryMessage` rows and the `InquiryFile` link and `STORED` state. Treat the prior apply outcome as unknown until those checks agree; never infer success or failure from the timeout alone.

The server validates exact digests, event types, timestamps, text length, mapping destination and immutable evidence, linked Customer, and closed Inquiry. `check` does not write. `apply` preflights the official LINE image before any database write, then takes the LineUser inquiry advisory lock, rechecks the identities and unique external IDs, and inserts only absent canonical `INBOUND` `InquiryMessage` rows into Inquiry 13. Existing rows must match all canonical fields. It then uses `handleLineInquiryImage` for R2 storage and verifies a `STORED` file linked to the image message. Conflicting existing file association fails closed. Image storage failure reports `partial_retryable`; rerunning can complete without duplicate messages.

No `LineWebhookInbox` is synthesized. No Inquiry or LineUser fields, classifications, outbox, Slack state, or send path are changed. This recovery does not claim webhook provenance.

## Verification and rollout boundary

Focused TypeScript and Python fake tests and TypeScript type checking are local only. Independent high-risk review remains required before deployment or live use. Production DB contents, official LINE availability, R2 upload, and the actual authenticated Manager read remain unverified by this implementation task.
