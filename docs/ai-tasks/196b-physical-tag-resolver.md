# Task196B — PhysicalTag resolver

Status: production complete
Date: 2026-10-01

## Production record

- Application commit: `33cae4f5a380dada62250e936735cef2e291080a`
- Commit subject: `feat: add physical tag resolver`
- Production tag: `production-task196b-20261001`
- Deploy source: GitHub `main`, exact feature commit `33cae4f5a380dada62250e936735cef2e291080a`
- Railway deployment: `9079ed6f-d1e4-4339-bdcb-1d163f7975a3`
- Railway status: `SUCCESS`; region: `sin`
- Runtime: Next.js Ready in 388ms.
- No schema, migration, seed, env, RLS, GRANT, or production DB mutation in Task196B.

## Implemented resolver contract

Task196B added an authenticated internal resolver at `POST /api/physical-tags/resolve`.

Accepted identifier types:

- `NFC_UID`
- `QR_TOKEN`
- `SHORT_CODE`

Logical results:

- `NOT_FOUND`
- `RETIRED`
- `UNASSIGNED`
- `RESOLVED`

`RESOLVED` exposes only the minimal internal fields needed by later scan work:

- `physicalTagId`
- `shortCode`
- `assignmentId`
- `assignedAt`
- `repairId`
- `inquiryNumber`
- `customerId`
- `repairStatus`

Customer name, phone, address, and other customer PII are not selected or returned.

## Authentication and lookup behavior

- Existing admin session via `getServerSession(authOptions)` is required.
- Unauthenticated requests return 401 before request-body parsing or PhysicalTag / Repair lookup.
- `qrToken` and `nfcUid` remain lookup identifiers, not authentication secrets.
- Valid identifiers return logical resolver status with HTTP 200.
- Malformed identifiers return 400.
- Unexpected resolver failure returns a generic 500 without logging raw UID/token values.
- Active assignment means `releasedAt IS NULL`; Task196A partial unique indexes enforce at most one active assignment per PhysicalTag and one active logical tag per Repair.

## NFC normalization boundary and PoC status

Confirmed with iPhone + NFC Tools before Task196B production:

- Tag: NXP NTAG215 / NFC Forum Type 2 / ISO 14443-3A.
- Observed UID: `04:33:3F:45:3B:02:89` (7 bytes).
- NDEF URL write succeeded.
- iPhone background NFC successfully opened `https://yoshidawatchrepair.com/`.

Task196B conservatively normalizes a textual hexadecimal UID by:

- trimming outer whitespace,
- allowing colon / hyphen / single-space separators only at complete-byte boundaries,
- removing those separators,
- uppercasing hexadecimal characters,
- preserving byte order exactly.

For the confirmed sample, `04:33:3F:45:3B:02:89` resolves to `04333F453B0289`.

The R65 USB HID reader has not yet been physically tested. Task196B therefore does **not** reverse byte order, convert decimal to hexadecimal, assume a fixed reader prefix/suffix, assume a fixed UID length, or claim the R65 output format is confirmed.

## Verification and independent review

Local automated verification after the final fix:

- focused Node tests: 7/7 PASS.
- `npx --no-install tsc --noEmit --incremental false`: PASS.
- `git diff --check`: PASS.

Independent review was performed by Codex after Katari implemented the task.

Initial review found:

1. BLOCKING: malformed separator placement such as `0:4`, `04:`, and `04::33` could normalize into valid-looking hex.
2. SHOULD_FIX: the test did not pin the complete Prisma `select` against accidental future PII expansion.
3. NOTE: the route test did not explicitly prove that `request.json()` is untouched before authentication.

All three were addressed. The final independent re-review reported no findings and no remaining blocking issue.

## Production verification

- GitHub compare from `9860530e98c4172389b6b251962aebffe3b187f1` to `33cae4f5a380dada62250e936735cef2e291080a`: exactly one feature commit.
- Changed application files: 4 new files, 399 insertions.
- Railway build compiled successfully and completed with `SUCCESS`.
- Production smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated valid JSON `POST /api/physical-tags/resolve` = 401
  - unauthenticated malformed JSON `POST /api/physical-tags/resolve` = 401
- The malformed-JSON 401 confirms production auth runs before request-body parsing.

## Task boundary

Task196B added resolver and validation logic only. It did not create PhysicalTags, assign/release/replace tags, retire tags, write NDEF data, generate QR labels, implement a scan receiver / ScanSession, change UI, or perform production DB writes.

Task196C is the next candidate and awaits user approval. Its scope is the PhysicalTag assign / release / replace lifecycle. Task196D and Task197 remain unstarted. R65 reader-specific HID format confirmation remains an outstanding physical-reader PoC item.
