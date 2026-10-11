# Task201G ? Yu-Pri Cloud operational hardening

Status: production application/rollout gate deployed; Windows Worker registered in non-issuing mode; approved production E2E completed successfully. Live-service compatibility corrections are validated locally and pending a new production approval.

## Boundary

This task changes only the local dedicated Edge login/session helper, Yu-Pri Cloud worker timing/reconciliation behavior, Scheduled Task rollout gate, related tests, and this record. No schema, migration, RLS, GRANT, LINE, auth, payment, or application business API contract is changed by the live-service correction.

## Official entry and remembered auto-login

- JP Business ToolBox official public entry is `https://www.post.japanpost.jp/bizpost/service/businesstoolbox/`. The official Login CTA targets `https://btoolbox.post.japanpost.jp/`.
- The dedicated Edge profile is `%LOCALAPPDATA%\clock-repair-system\yupuri-cloud\edge-profile`, with CDP on `127.0.0.1:18822`. After auto-login is enabled once, a full close/reopen of this dedicated profile followed by official public entry ? Login can reach the authenticated ToolBox portal without credential entry.
- Login recovery never types credentials, selects saved-password UI, sends native keys, or uses the old `auto-login-attempted` marker. A real login form remains a manual-recovery stop condition.
- The current public page contains more than one visible official `????` CTA with the same exact ToolBox href. The helper now accepts one or more visible exact official Login CTAs only when each candidate keeps the raw exact href and `target="_blank"`, and clicks exactly one. Unrelated hrefs do not qualify.
- A new `target=_blank` page is observed briefly with `Page.url() === ""` before the official SAML URL appears. Only this empty initial state, `about:blank`, or the strict official `btoolbox.post.japanpost.jp` host is accepted during handoff. External URLs and other browser pages still fail closed.
- The authenticated ToolBox home remains allowlisted to the exact portal URL. Current live DOM exposes one visible exact `?????` anchor with `href="javascript:void(0);"`; this anchor plus absence of login controls proves the home. The service-detail proof remains the exact `#srvUtlUrl` Cloud SSO target plus visible `#srvUtl` on the exact service-detail URL. Arbitrary portal pages cannot prove authentication.
- Cloud SSO may finish its redirect after the initial navigation resolves. Invoice proof therefore first waits for the authenticated `???` tab to become visible, then strictly verifies the final Cloud invoices URL and authenticated UI. It does not relax the final URL allowlist.

## Service hours and topology

- JP Business ToolBox official availability is **06:00?24:00 JST**. The separate automation operational window remains **06:00 inclusive to 23:55 exclusive JST** to leave a five-minute safety buffer.
- Browser side effects have fresh service-window guards. Click/check/file actions use bounded Playwright actionability checks and recheck the window immediately before dispatch. PDF HTTP retrieval and printing also recheck the window.
- Worker operation requires exactly one browser context and one worker page. Only the attributable PDF popup may temporarily add one page; unrelated or extra tabs/contexts fail closed.
- The Scheduled Task remains registered against canonical `C:\Users\yoshi\clock-repair-system` with **no `-AllowIssue`**. Automatic real issuance is therefore still disabled even though one approved manual E2E used `-Once -AllowIssue`.

## Live Cloud URL and propagation behavior

- Production invoices origin remains exactly `https://btoolboxprintservice.jp/invoices/`.
- The live service canonicalizes workflow pages to trailing-slash URLs such as `/invoices/upload/`. Upload/export waits now accept only the exact production host and exact `/invoices/upload` or `/invoices/upload/`, and exact `/invoices/export` or `/invoices/export/`. Query strings, fragments, credentials, explicit ports, HTTP, lookalike hosts, and wrong workflow paths remain rejected.
- Live Cloud processing is asynchronous: after upload, the row may take several seconds to become visible; after issuance, the tracking number may also take several seconds to appear. The worker now performs bounded **read-only** reconciliation waits only. `upload()` and `issue()` are still invoked at most once; transport failures or unresolved state still stop for review.
- `PlaywrightCloudBrowser.waitForPropagation()` checks single-page topology and the service window before and after a 3-second wait. Core reconciliation performs at most two such waits after upload or issue. No side effect is repeated by the wait loop.

## Rollout safeguards

- Installer registration remains restricted to clean canonical `C:\Users\yoshi\clock-repair-system` `main` matching local `origin/main` and live remote `main`.
- `-ReviewedCommit` identifies a reviewed Task201G baseline. Later unrelated commits are allowed only when all protected Yu-Pri runtime files remain unchanged; protected runtime drift fails closed.
- Protected runtime includes `start-yupuri-cloud-worker.ps1`, `open-yupuri-cloud-login.ps1`, `await-yupuri-cloud-login.ts`, `yupuri-cloud-live-session.ts`, `yupuri-cloud-actions.ts`, `yupuri-cloud-listing.ts`, `yupuri-cloud-worker-core.ts`, and `yupuri-cloud-worker.ts`.
- Because this live-service correction changes protected runtime files, the existing reviewed baseline must **not** be used to silently re-register an issuing worker. Any future registration from this correction requires the reviewed correction commit to be supplied explicitly after production approval.
- Python `__pycache__/` and `*.py[cod]` remain ignored as generated runtime cache; other dirty-tree state still blocks rollout.

## Production rollout before live E2E correction

- Task201G application correction commit: `97f4751a13aec9a3d5bc616b06ec286fa59f1e06`.
- Rollout-gate follow-up commit: `4a47fb76425f8383a36742da7c6304aa666891b1`.
- Railway deployment for `4a47fb7`: `0a803108-12e9-4cb7-a096-9e8728d48d88` ? `SUCCESS`.
- Production tag: `production-task201g-rollout-gate-20261012`.
- Production smoke: `/` 200, `/login` 200, `/repairs` unauthenticated 307, `/shipments` unauthenticated 307, no relevant Railway `upstreamErrors`.
- `ClockRepair-YuPriCloudWorker` is registered/Ready on canonical repo with `HasAllowIssue=False`; the legacy `ClockRepair-YuPriCloudSession` remains disabled.
- A non-issuing `-Once` dry-run at 06:00 JST reached `GET /api/internal/yupuri-cloud/next` 200 and exited 0 without Cloud login, issue, PDF, print, or Shipment completion.

## Approved production E2E ? 2026-10-12

The user explicitly approved creating test data and issuing/printing one real test label because a true production E2E was required.

- Before the test, production had zero eligible `READY + JAPAN_POST + YU_PACK + unissued` shipments.
- A dedicated TEST Customer (`id=2`) and TEST Shipment (`id=2`, management number `SHP-2`) were created without any Repair association. The destination snapshot used Japan Post headquarters' public business address so no real customer address was used.
- The first live attempts failed closed before issuance and exposed the Login CTA, empty-new-tab, portal-proof, Cloud-redirect, and trailing-slash compatibility issues documented above. Journal/Cloud/DB reconciliation was checked before every recovery; no blind re-upload or second issue click was performed.
- CSV upload was confirmed asynchronously as `SHP-2 = unissued` before issuance recovery.
- After one issue click, the worker stopped `tracking-uncertain`; a later read-only Cloud reconciliation proved `SHP-2 = issued` with one 12-digit tracking number. Recovery from journal stage `issuing` did **not** click Issue again.
- Final worker run completed with exit code 0 and log `shipment=2 stage=completed`.
- Production `Shipment.id=2` is now `LABEL_ISSUED`, has the Cloud tracking number and `labelIssuedAt`, and keeps `actualShippedAt = null`. Label issuance/printing is intentionally not treated as postal acceptance/shipment.
- Railway logs show `GET /api/internal/yupuri-cloud/next` 200 and `POST /api/internal/yupuri-cloud/complete` 200 for the successful recovery, with no upstream error.
- Label PDF exists at `%LOCALAPPDATA%\clock-repair-system\yupuri-cloud\pdf\shipment-2.pdf` (77,737 bytes in this run).
- Local journal for Shipment 2 reached `stage=completed`, with `printAttempted=true` and `printCompleted=true`. `NEC MultiWriter 5750C` was `Normal` before execution and the print command returned successfully. Physical paper output itself remains an external/manual confirmation item.
- TEST Customer/Shipment records and the issued Cloud label are intentionally retained for audit. They were not deleted after the test. Cleanup, if desired, is a separate destructive operation and was not performed.
- Scheduled Task configuration was not changed by the manual E2E; it remains non-issuing (`-AllowIssue` absent).

## Local verification of live-service correction

In the isolated Task201G worktree, after separating all concurrent Task206G1 changes:

- `yupuri-cloud-live-session.test.ts`: **20/20 PASS**.
- `yupuri-cloud-worker-browser.test.ts`: **17/17 PASS**.
- `yupuri-cloud-worker-core.test.ts`: **10/10 PASS**.
- `yupuri-cloud-listing.test.ts`: **5/5 PASS**.
- `yupuri-cloud-print.test.ts`: **1/1 PASS**.
- Total focused Node tests: **53/53 PASS**.
- Dedicated Edge PowerShell process fixture: PASS.
- Installer reviewed-baseline/CRLF/dirty-tree/protected-drift fixture: PASS.
- `npx tsc --noEmit --incremental false`: PASS in the isolated Task201G worktree.
- `git diff --check`: PASS.
- No temporary `.task201g-*` debug runner is retained.
- Codex independent review is unavailable during the current usage-limit window. The correction was implemented and reviewed by Katari under the user's explicit instruction; independent review remains unperformed.

Production for the **new live-service correction**: pending. Do not push/deploy or enable automatic issuance without a new explicit production approval.
