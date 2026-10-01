# Task196C — PhysicalTag assign / release / replace lifecycle

Status: production complete
Date: 2026-10-01

## Production record

- Application commit: `ca68d75cd52811a24ba830b692464e12af8b64cf`
- Commit subject: `feat: add physical tag lifecycle`
- Production tag: `production-task196c-20261001`
- Deploy source: GitHub `main`, exact feature commit `ca68d75cd52811a24ba830b692464e12af8b64cf`
- Railway deployment: `5a973ee0-f8d5-44d2-bcae-b4a23a0b2ce9`
- Railway status: `SUCCESS`; region: `sin`
- Runtime: Next.js Ready in 264ms.
- No schema, migration, seed, env, RLS, GRANT, or production DB mutation was required for Task196C.

## Implemented lifecycle contract

Task196C added authenticated internal POST routes:

- `POST /api/physical-tags/assign`
- `POST /api/physical-tags/release`
- `POST /api/physical-tags/replace`

### assign

Input:

- `physicalTagId`
- `repairId`
- optional `reason`

Behavior:

- requires authenticated admin session
- resolves current operator from `session.user.email` to unique `Admin.email`
- PhysicalTag must exist and be `ACTIVE`
- PhysicalTag must have no active assignment
- Repair must exist and have no active PhysicalTag assignment
- creates `PhysicalTagAssignment` with `assignedBy` and optional `assignReason`
- partial unique indexes remain the final concurrency guard

### release

Input:

- `repairId`
- optional `reason`

Behavior:

- requires authenticated admin session
- resolves the Repair's current active assignment
- preserves the assignment row as history
- sets `releasedAt`, `releasedBy`, and optional `releaseReason`
- does not retire the PhysicalTag
- does not change Repair status
- released PhysicalTag remains reusable

### replace

Input:

- `repairId`
- `replacementPhysicalTagId`
- required nonblank `reason` of at most 500 characters

Behavior:

- requires authenticated admin session
- replacement tag must exist, be `ACTIVE`, and be unassigned
- replacement tag cannot be the current tag
- one Serializable transaction performs:
  1. release current active assignment
  2. retire old PhysicalTag with `retiredAt` / `retireReason`
  3. assign replacement PhysicalTag to the same Repair
- if replacement creation or any intermediate step fails, the complete transaction rolls back
- no Repair status, Shipment, ScanSession, or UI coupling was added

## Authentication and audit

Task196C did not broaden NextAuth callbacks or add session fields.

The route layer:

1. checks `getServerSession(authOptions)`
2. requires `session.user.email`
3. parses request JSON only after authentication
4. looks up `Admin.id` by unique email
5. passes the operator Admin ID into lifecycle writes

This avoids the legacy hard-coded `Admin ID = 1` pattern and records the actual authenticated operator in `assignedBy` / `releasedBy`.

## Conflict and input handling

- malformed input: 400
- unauthenticated: 401
- missing PhysicalTag / Repair / active assignment: 404 where applicable
- retired tag, already assigned tag, already tagged Repair, same-tag replacement, concurrent lifecycle conflict: 409
- unexpected failure: generic 500

Prisma `P2002` and `P2034` are classified as lifecycle conflicts and returned as 409.

IDs must be positive PostgreSQL Int-range integers.
Optional reasons are trimmed, nonblank when supplied, and limited to 500 characters.
replace requires a reason so the retirement history always records why the old tag was retired.

## Local verification and independent review

Implementation owner: Codex.
Independent reviewer: Katari.

Final verification:

- focused lifecycle + route tests: 8/8 PASS
- `npx --no-install tsc --noEmit --incremental false`: PASS
- staged `git diff --cached --check`: PASS
- independent review: no blocking issue

The normal Node / tsx path hit the known local `spawn EPERM` execution-environment issue when esbuild attempted to create a worker. This was not an assertion failure. The same test files were executed through an in-process TypeScript transpilation path and all 8 assertions passed.

## Production verification

Railway deployed exact application commit `ca68d75cd52811a24ba830b692464e12af8b64cf` successfully.

Production smoke against `https://yoshidawatchrepair.com`:

- `GET /` = 200
- `GET /login` = 200
- unauthenticated valid JSON `POST /api/physical-tags/assign` = 401
- unauthenticated malformed JSON `POST /api/physical-tags/assign` = 401
- unauthenticated valid JSON `POST /api/physical-tags/release` = 401
- unauthenticated malformed JSON `POST /api/physical-tags/release` = 401
- unauthenticated valid JSON `POST /api/physical-tags/replace` = 401
- unauthenticated malformed JSON `POST /api/physical-tags/replace` = 401

The malformed-JSON 401 results confirm that production authentication runs before request-body parsing for all three lifecycle routes.

No authenticated mutation smoke was performed because it would create or change production PhysicalTag assignment state.

## Task boundary

Task196C added the lifecycle service/API only.

It did not:

- change schema or migration
- create or issue PhysicalTags
- generate or print QR labels
- write NDEF data
- add R65-specific UID assumptions
- implement keyboard-wedge/HID receiver
- implement ScanSession
- implement StorageLocation
- change Repair status
- connect Shipment
- connect LINE
- add UI

R65 USB HID reader format remains unconfirmed. Byte order, HEX/DEC, prefix/suffix, Enter behavior, and actual UID output format must be determined from the real reader rather than inferred.

Task196D is the next candidate and remains unstarted. Its scope is the QR label display/printing minimum path; PhysicalTag issuance/registration boundaries must be confirmed during implementation prep. Task197 ScanSession remains unstarted.
