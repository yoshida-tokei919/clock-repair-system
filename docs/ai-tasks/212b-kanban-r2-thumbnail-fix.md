# Task212B — Kanban R2 thumbnail fix

- Cause: `/repairs/board` passed a private R2 `RepairPhoto.storageKey` to an image `src`, which the browser cannot fetch as a URL.
- Scope: Select the photo ID with its storage key. Render R2 photos through the existing authenticated `/api/repair-photos/{photoId}` read route; retain direct legacy http(s), data, and blob URLs. No storage, upload, or auth changes.
- Verification: `npx tsc --noEmit` and `git diff --check` passed. No existing Kanban/photo test covers this server page, and the inline URL choice is too small to justify a new test harness.
- Production: pending user approval. No push or deploy in this Task.
