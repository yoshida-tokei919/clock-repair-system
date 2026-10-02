# Task198C — StorageLocation visibility / initial zones

## Status

Production complete — 2026-10-02

## Task boundary

Task198A/Bで作成したStorageLocation基盤を実運用へ接続する最小範囲として、以下のみを実装した。

- 初期日本語StorageLocation 9ゾーンのdata-only migration
- Repair詳細でactive StorageLocationAssignmentを現在地として表示
- active StorageLocation一覧
- Location単位のactive Repair一覧
- 管理画面Sidebarからの導線
- /storage-locations を既存NextAuth middleware保護対象へ追加

対象外:

- LOCATION_AUDIT / 棚卸しscan
- 現物とDB現在地の不一致検知
- Repair.status等からの推奨zone導出
- Repair.status自動変更
- StorageLocation create/edit/delete UI
- Location QRラベル印刷
- NFC UID発行/書込
- Shipment
- Brotherプリンター

## Initial StorageLocation

| shortCode | name | type | sortOrder |
| --- | --- | --- | ---: |
| LOC-000001 | 受付処理待ち | ZONE | 10 |
| LOC-000002 | 見積り待ち | ZONE | 20 |
| LOC-000003 | 見積り調査中 | ZONE | 30 |
| LOC-000004 | 承認待ち | ZONE | 40 |
| LOC-000005 | 部品待ち | ZONE | 50 |
| LOC-000006 | 作業待ち | ZONE | 60 |
| LOC-000007 | ランニングテスト中 | ZONE | 70 |
| LOC-000008 | 発送・引渡し待ち | ZONE | 80 |
| LOC-000009 | 要確認 | ZONE | 90 |

- parentId = null
- nfcUid = null
- qrToken = null
- isActive = true
- 既存行をUPDATE / DELETEしない
- canonical nameが別shortCodeで存在する場合はfail closed
- canonical shortCodeが別定義で存在する場合もfail closed
- 定義一致済みの場合は既存行を維持
- Data API / RLS / GRANT変更なし

## UI

### Repair detail

activeなStorageLocationAssignment（releasedAt = null）を正本として以下を表示する。

- location name
- shortCode
- locationType
- assignedAt

active assignmentがない場合は「保管場所未登録」と表示する。

### /storage-locations

- isActive = true のLocationだけを sortOrder, id 順で表示
- active assignment件数を表示
- Location選択時にactive Repair一覧を表示
- Repair一覧: inquiryNumber / brand / model / Repair.status / assignedAt
- raw qrToken / nfcUidは表示しない

## Review

Implementer: Codex

Independent reviewer: カタリ

独立レビューで初期migrationの `ON CONFLICT ("shortCode") DO NOTHING` が、既存shortCodeの誤定義を黙って許容する点を検出した。

修正後は既存行を破壊せず、正本との不一致を例外で停止するfail-closed migrationとした。

## Local validation

- `npx --no-install prisma validate` — PASS
- `npx --no-install tsc --noEmit --incremental false` — PASS
- StorageLocation / ScanSession related tests — 20/20 PASS
- `git diff --check` — PASS
- `npm run build` — PASS
- 既知の `/api/repairs/recent` Dynamic server usage messageはbuild exit 0

## Production

Application commit:

`42281b9114b580443e89e192894d1b2b75b81170`

Commit subject:

`feat: add storage location visibility`

Supabase migration:

`20261002005051 seed_initial_storage_locations`

Pre-migration affected-table snapshot:

`C:\Users\yoshi\clock-repair-system-backups\task198c-pre-migration-20261002T004955Z.json`

Migration read-back:

- StorageLocation: canonical 9 rows
- StorageLocationAssignment: 0 rows
- StorageLocation / StorageLocationAssignment: RLS enabled
- anon / authenticated / service_role table grants: none

Railway deployment:

`a78de541-a17a-4419-b05d-78b55fc3810d`

- status: SUCCESS
- source: GitHub main
- exact commit: `42281b9114b580443e89e192894d1b2b75b81170`
- region: sin
- runtime: Next.js Ready in 314ms

Production tag:

`production-task198c-20261002`

Production smoke:

- `/` = 200
- `/login` = 200
- `/storage-locations` unauthenticated = 307 to NextAuth
- `/repairs` unauthenticated = 307 to NextAuth

Authenticated Location一覧の内容は、production DB read-backで9ゾーン投入を確認し、認証境界はHTTP smokeで確認した。

## Follow-up boundary

Task198D候補:

- LOCATION_AUDIT / 棚卸しscan
- 現物現在地とStorageLocationAssignmentの照合
- 不一致の明示
- scanだけで自動移動・status変更はしない

推奨zone判定はTask198Dへ混ぜず、Task198E候補として分離する。
