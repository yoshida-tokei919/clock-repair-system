# Task206H1A — LINE Manager auth auto-recovery

## Scope and state

Task206H1 production source is `590c2a4`. During the approved H1 owner-account E2E, H1 created one APPROVED outbox and an exact duplicate approve converged to that same row. Before any Manager POST, the Windows sender failed to initialize `LINELibAdapter.from_storage`; the outbox remained `sendAttemptCount=0`, and the dedicated Chrome profile was redirected to `account.line.biz`. This task changes the local auth bootstrap and sender start path. It does not send LINE, claim an outbox, mutate production data, or alter the H1 context / approve / status contract.

Production: pending. The local implementation has not been pushed, installed, started, or deployed.

## Recovery boundary

- The launcher invokes `--ensure-valid` before the worker. It first restores the existing fixed `lineoa-storage.json` through lineoa; a valid restore returns without opening Chrome or clicking anything. Missing or invalid storage alone starts recovery. Plain CLI invocation remains the manual bootstrap.
- Recovery opens only `https://chat.line.biz/` with the existing dedicated persistent Chrome profile. It accepts an already authenticated chat URL with zero clicks.
- The first continuation is the exact `LINEアカウント` control on HTTPS `account.line.biz/login`. If needed, the second is the exact `ログイン` control on HTTPS `access.line.me/oauth2/v2.1/authorize`. A link destination must also be on an exact trusted host and path. Each click must change the URL; the next stage is checked before another click. No third click is allowed. The first stage is screenshot-observed; the `access.line.me` second-stage host/path remains live-unverified and any different live stage fails closed.
- An unknown host, unexpected path, absent or ambiguous continuation, third step, visible credential input, OTP, CAPTCHA, rendered QR challenge, or passkey enrollment/challenge UI stops recovery. Hidden irrelevant inputs do not block a permitted continuation. The utility never fills/types/evaluates a page or sends a LINE message. Cookies are read only after the exact final `https://chat.line.biz/` root path.
- Only eligible `line.biz` cookies are exported into the existing cookie-only lineoa storage shape. A sibling temporary storage file is validated through storage-only LINELib restoration with a nonempty bot list. `os.replace` installs it only after validation; failure leaves the existing storage untouched. Temporary storage is removed on failure.
- CLI output is fixed success/failure fields and counts. Cookie values, account identifiers, URL queries, and tokens are not emitted.
- A failed gate ends the launcher before the worker can claim or POST. `-AllowSend` remains the explicit send gate. The worker is unchanged.

## Validation

Combined auth/launcher/existing sender regression is 77/77 PASS in the normal Windows environment. Focused fake-browser/storage coverage includes the existing-storage fast path, zero/one/two clicks, third-step rejection, exact labels, unknown hosts/paths including empty query/fragment delimiters and non-root chat paths, generic visible credential inputs, OTP/CAPTCHA/QR/passkey enrollment or authentication challenges (including challenges shown after the safe passkey-login wording), hidden inputs, final-chat challenge gating, and validated atomic replacement. Launcher tests cover PowerShell parsing, auth-gate failure, and `-AllowSend` preservation. The first-stage label/path is screenshot-observed; the second `access.line.me` stage remains live-unverified and will fail closed if the live flow differs. No live click test, LINE POST, production DB mutation, installation, or deployment was performed.
