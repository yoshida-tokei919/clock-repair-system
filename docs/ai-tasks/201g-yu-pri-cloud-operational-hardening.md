# Task201G — Yu-Pri Cloud operational hardening

Status: corrective local implementation validated; independent re-review and production rollout pending.

## Boundary and observed conditions

- This task changes only the local Cloud session helper, Windows launch/registration scripts, issuance worker authentication gate, PDF printer import resolution, tests, and this record. No schema, migration, RLS, GRANT, application API/DB mutation, LINE, or Task201F historical edit.
- Dedicated Edge/CDP uses `http://127.0.0.1:18822` and the repo-external `%LOCALAPPDATA%\clock-repair-system\yupuri-cloud\edge-profile`. A rendered invoices tab in any browser context is not fresh authentication proof.
- Unauthenticated `/invoices` navigation can pass through Cloud login/logout and JP Business ToolBox SAML to the portal. Therefore bootstrap uses only the exact `https://auth.btoolboxprintservice.jp/sso` entry. With JP auth alive, this can reach Cloud invoices; with JP auth expired, it reaches JP login.
- The JP login uses the login-ID method: `#lgnIdsLogIds`, optional `#usrIdsLogIds` (kept empty), `#pwdLogIds`, and `#loginLogIds`. Edge's saved credential selection on the login-ID field may itself submit immediately. Multiple failed submissions may lock the account.
- Existing ad-hoc Scheduled Tasks point at the disposable task201f worktree. This task does not change or remove them. Stable production installation later targets `$HOME\clock-repair-system`.
- On Windows, `import("pdf-to-printer")` exposes `default.print`; the previous worker's direct `module.print` call fails at runtime.

## Session and attempt policy

1. Every worker/helper startup opens a new page and makes a credential-free request through the exact SSO entry, even when the attempt marker is absent and an old invoices tab is visible. Only that probe page can establish the session. **Fresh SSO proof required before clearing auto-login-attempted.** A prior marker follows the same probe and cannot trigger credential keys.
2. Observe only the SSO probe page for Cloud invoices, a verified JP login form, or an authenticated ToolBox `/portal/` page. A pre-existing Cloud Page object cannot satisfy this probe or the subsequent credential outcome. An authenticated portal can make one credential-free SSO handoff. Portal evidence is a unique visible `ログアウト` link, or on the observed service detail page the exact hidden SSO URL plus visible service-use control.
3. Only on a verified JP login candidate with no existing attempt marker, acquire the exclusive repo-external `auto-login-attempted.lock` directory. Repeat the exact SSO probe while holding the lock before any credential key, so a concurrent helper's completed authentication is observed freshly. If still at JP login, atomically create the attempt marker with exclusive filesystem creation **before** any login-form click or credential key. Hold the lock through the credential outcome and any marker clear. Clear the optional user ID, then send exactly one `ArrowDown` and one `Enter` to select Edge's saved credential. Code does not read, store, or log either credential field. It does not click the login button or repeat selection after an uncertain result.
4. After a credential attempt reaches Cloud or the ToolBox portal, navigate through the exact SSO entry once more without credential keys. Only fresh Cloud confirmation on that probe page under the lock clears the marker. A prior marker's credential-free Cloud recovery also re-probes under the lock before clearing; if an active or abandoned lock blocks clearing, freshly confirmed Cloud can still be used while the marker stays intact. JP login or uncertainty leaves the marker intact. There is no TTL, abandoned-lock takeover, or automatic credential retry; an abandoned lock requires manual investigation.
5. The allow-issue launcher establishes the dedicated Edge session before invoking the worker. Direct worker startup applies the same shared session policy and requires the production Cloud origin for issuance, including when its internal API targets production. The worker rechecks the Cloud page before each internal `next` request and stops on session loss; it does not retry login in its polling loop.

## Worker and task installation

- Printer import resolution accepts callable direct `print` and callable `default.print`; any other module shape fails before printing. The existing journal marks `printAttempted` before the print call, so uncertain printing remains blocked from blind replay.
- The registration script defaults to the stable `$HOME\clock-repair-system` tree and requires the exact canonical `C:\Users\yoshi\clock-repair-system` path for enabled registration. Rollout must supply `-Enable -ReviewedCommit <40-hex>` using the externally independently reviewed canonical HEAD. The script resolves the value to a commit and requires exact equality with canonical HEAD; HEAD must equal both local `origin/main` and live remote `main`. Any later main change requires a new independent review SHA before registration. The script also checks the reviewed source's `CLOUD_LOGIN_LOCK_PROTOCOL = 2` and Task201G record as defense in depth, the trusted GitHub origin, clean `main`, and tracked worker sources. Preview remains non-mutating and may omit `-ReviewedCommit`; unavailable remote verification fails closed. No task registration occurs before every gate passes. One worker Scheduled Task starts the session helper first for `-AllowIssue`, avoiding independent task startup races.
- This task does not register/modify Windows Scheduled Tasks, push, deploy, access the production DB, attempt live login, or issue/download/print a real label. Cleaning up the old ad-hoc session task and registering against the stable repo are operational follow-ups after independent review and approval.

## Local verification

- Final corrective focused auth, URL, lock race, print import, listing, and issuance assertions: 37/37 PASS via in-process TypeScript transpilation. Native `node --import tsx --test` discovery hit environment `spawn EPERM` before running assertions; this was an execution-environment error, not an assertion failure. Standard host tests remain for the orchestrator.
- Isolated installer fixture rejected missing, malformed, unrelated, and valid non-HEAD ancestor reviewed SHAs before registration. A positive reviewed-HEAD source gate reached only stubbed Scheduled Task commands. No real Scheduled Task was changed. Changed PowerShell scripts parsed successfully.
- `tsc --noEmit --incremental false`, `git diff --check`, and `npm run build` PASS; Next.js 15.5.27 generated 59/59 static pages.
- No live auth or Cloud issuance was used for verification.

Production: pending.
