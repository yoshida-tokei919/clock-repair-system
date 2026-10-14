# Task212B — Kanban R2 thumbnail fix

- Cause: `/repairs/board` passed a private R2 `RepairPhoto.storageKey` to an image `src`, which the browser cannot fetch as a URL.
- Scope: Select the photo ID with its storage key. Render R2 photos through the existing authenticated `/api/repair-photos/{photoId}` read route; retain direct legacy http(s), data, and blob URLs. No storage, upload, or auth changes.
- Verification: `npx tsc --noEmit` and `git diff --check` passed. No existing Kanban/photo test covers this server page, and the inline URL choice is too small to justify a new test harness.
- Production: complete. Commit `2b0e245fe3fee5d72d2fde678226e0f1e44e0b98`; Railway deployment `d4151c89-4fe7-4713-ad9e-a0eae9294578` SUCCESS in `sin`. Smoke: `/`=200, unauthenticated `/api/repair-photos/1`=401, unauthenticated `/repairs/board`=307. Authenticated thumbnail rendering remains to be visually confirmed in normal use.
