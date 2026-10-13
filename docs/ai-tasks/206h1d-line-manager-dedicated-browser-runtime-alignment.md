# Task206H1D — LINE Manager dedicated browser runtime alignment

Production: future / not started

## Background

On 2026-10-13 the active n8n `LINE Manager Mapping Processor` hourly health check (`7 * * * *`) began returning `manager_live_read_unavailable`. The mapping path is fail-closed and sent only sanitized Slack alerts; no LINE send, mapping verification, or production DB mutation occurred.

Read-only diagnosis confirmed that the fixed `lineoa-storage.json` still exists, but storage-only `LINELib` initialization raises `InteractiveLoginRequired`. The user's normal Microsoft Edge session is currently authenticated to LINE Official Account Manager, while no process is using the dedicated worker profile `%LOCALAPPDATA%\clock-repair-system\linelib-poc\chrome-profile`.

The existing Task206H1A-C recovery utility intentionally uses the isolated dedicated profile and currently launches Playwright with `channel="chrome"`. On the current Windows environment, Google Chrome executable was not found in the expected locations; the actively used browser is Microsoft Edge. Therefore the normal interactive Edge login does not refresh the isolated worker storage.

## Goal

Restore a durable, isolated LINE Manager authentication recovery path that matches the browser runtime actually available on the worker PC, without weakening the existing fail-closed auth boundary.

## Required constraints

- Keep the dedicated isolated browser profile and fixed cookie-only `lineoa-storage.json`; do not copy cookies from the user's normal browser profile.
- Do not expose cookies, access tokens, account identifiers, auth URLs with sensitive query data, or credentials to logs, Slack, prompts, Git, or command arguments.
- Preserve the Task206H1A-C trusted-host/path, challenge detection, bounded continuation-click, validated temporary-storage, and atomic replacement rules.
- Browser-runtime selection must be explicit and allowlisted. Do not silently fall back to an arbitrary installed browser.
- Recovery testing must be non-sending. Do not claim an outbox or POST a LINE message merely to validate authentication.
- Any visible credential / OTP / QR / CAPTCHA / passkey challenge requiring user action remains an explicit manual-auth boundary.
- Auth/session handling is a security boundary; implementation and independent review should be separated before production activation.

## Investigation / implementation scope

1. Confirm the installed browser/runtime inventory used by the production Windows worker and Playwright.
2. Decide the minimal supported runtime strategy, expected candidate being a controlled Edge channel or equivalent explicit browser configuration while retaining the existing dedicated profile path.
3. Update only the auth bootstrap / launcher integration required for that runtime alignment; avoid unrelated sender or mapping changes.
4. Add focused regression coverage for runtime selection, missing-browser fail-closed behavior, dedicated-profile isolation, challenge handling, and storage validation.
5. Perform a non-sending live smoke:
   - dedicated profile can reach the approved LINE login flow;
   - user completes manual auth only if required;
   - validated storage refresh succeeds;
   - storage-only `LINELib` restore succeeds with a nonempty bot list;
   - read-only mapping health returns `healthy_no_candidates` or another expected non-error state with actual Manager chats scanned.
6. Verify the hourly n8n mapping health path returns healthy and its prior unhealthy alert suppression state clears naturally on healthy recovery.

## Acceptance criteria

- Normal user browser profile remains untouched and is not used as the source of worker auth cookies.
- Dedicated profile/storage can be refreshed on the actual production browser environment.
- `InteractiveLoginRequired` no longer blocks the read-only Manager health path after successful dedicated login.
- No LINE send is performed during implementation/recovery verification.
- No schema, migration, production DB, or Railway application change is required unless a later investigation proves otherwise.
- Independent security review has no blocking finding before production activation.
