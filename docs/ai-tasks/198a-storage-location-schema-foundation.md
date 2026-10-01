# Task198A — StorageLocation schema foundation

Status: production complete
Date: 2026-10-02

## Purpose

時計現物の実際の保管場所を、Repair.status / RepairWorkPlan / PhysicalTagとは独立して永続化するschema foundationを追加する。

Task198Aはschema foundationのみとし、初期zone seed、移動API、scan UI、不一致判定は後続Taskへ分離した。

## Production record

- Application commit: `4f0664281933761f28cf27f519e62ddbb2b868ac`
- Commit subject: `feat: add storage location schema foundation`
- Railway deployment: `ceecb7e7-f90a-498b-9fec-dc420de09ec9`
- Deployment status: `SUCCESS`
- Production tag: `production-task198a-20261002`
- Region: `sin`
- Runtime: Next.js Ready in 274ms
- Supabase migration: `20261001204201 add_storage_location_foundation`

## Schema

### StorageLocationType

- `ZONE`
- `SHELF`
- `BOX`
- `TRAY`
- `OTHER`

### StorageLocation

主な列:

- `id`
- `name`
- `locationType`
- `parentId`
- `shortCode`
- `nfcUid`
- `qrToken`
- `isActive`
- `sortOrder`
- timestamps

`parentId` によりlocation hierarchyを表現する。

`shortCode` / `nfcUid` / `qrToken` は後続Taskでのlocation scan識別用にnullable uniqueとして確保し、Task198Aでは発行・正規化を行わない。

### StorageLocationAssignment

主な列:

- `storageLocationId`
- `repairId`
- `assignedAt`
- `releasedAt`
- `assignReason`
- `releaseReason`
- `assignedBy`
- `releasedBy`
- timestamps

Repairへ履歴付きで物理現在地を割り当てる。

## Database invariants

- partial unique indexにより、1 Repairにつきactive assignmentは最大1件
- StorageLocation側にはactive uniquenessを設けず、同じlocationに複数Repairを配置可能
- `releasedAt IS NULL OR releasedAt >= assignedAt`
- self-parent禁止: `parentId IS NULL OR parentId <> id`
- FK deleteはRESTRICT
- 既存Repairへのbackfillなし
- 初期StorageLocation row投入なし
- migration-time token生成なし

## Security / Data API

StorageLocation系2テーブルはserver-only Prisma accessとする。

- RLS enabled
- RLS policyなし
- `anon` table privilegeなし
- `authenticated` table privilegeなし
- `service_role` table privilegeなし
- new serial sequence privilegeも上記3roleへなし
- Data API GRANTなし
- SECURITY DEFINER functionなし

Supabase Security Advisorの `rls_enabled_no_policy` INFOは、このserver-only設計では意図した状態。

## Independent review

Implementer: Codex
Independent reviewer: Katari

Blocking issue: none

Validation:

- `npx --no-install prisma validate` — PASS
- `npx --no-install tsc --noEmit --incremental false` — PASS
- `git diff --check` — PASS
- migration static safety checks — PASS
- production preflight confirmed no pre-existing StorageLocation tables/type

## Pre-production backup

Backup directory:

`C:\Users\yoshi\clock-repair-backups\task198a-20261002-0540`

Contents:

- `public-data-and-xsd.xml`
- `schema-metadata.json`
- `manifest.txt`
- `README.txt`

Backup type: read-only logical XML data + schema/security metadata snapshot.
Local `pg_dump` / Supabase CLI were unavailable.

Public base tables before migration: 72.

Previous full SQL dump baseline:

`C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752`

## Production verification

After migration:

- `StorageLocation` exists
- `StorageLocationAssignment` exists
- `StorageLocationType = {ZONE,SHELF,BOX,TRAY,OTHER}`
- StorageLocation row count = 0
- StorageLocationAssignment row count = 0
- RLS enabled on both tables
- policy count = 0
- API table privilege count for anon/authenticated/service_role = 0
- API sequence privilege count for anon/authenticated/service_role = 0
- active Repair partial unique index confirmed
- releasedAt check confirmed
- self-parent check confirmed
- migration listed as `20261001204201 add_storage_location_foundation`

Production smoke:

- `GET /` = 200
- `GET /login` = 200
- unauthenticated `GET /repairs` = 307
- unauthenticated PhysicalTag resolver valid JSON = 401
- unauthenticated PhysicalTag resolver malformed JSON = 401

## Out of scope / next work

Task198A did not implement:

- initial Japanese StorageLocation rows
- location issue/create API
- LOC shortCode generation
- QR token generation
- NFC normalization / R65 assumptions
- location resolver API
- StorageLocation move API
- ScanSession LOCATION mode
- mismatch detection / recommended-zone logic
- inventory/count UI
- Repair status changes
- Shipment
- printer changes
- PhysicalTag lifecycle changes

Next candidate: Task198B, after explicit user approval and fresh implementation-prep review.
