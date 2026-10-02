# Task198D — StorageLocation audit scan

## Status

Production complete — 2026-10-02

## Task boundary

Task198Cで投入・可視化したStorageLocationを使い、現物scanとDB上のactive StorageLocationAssignmentをread-onlyで照合する棚卸しフローを実装した。

実装対象:

- ScanSession `LOCATION_AUDIT` mode
- 棚卸しLocationのscan
- PhysicalTag / Repairの連続scan
- 明示的な「棚卸し結果を確認」
- active StorageLocationAssignmentとの同一snapshot内照合
- 4分類表示
  - MATCH
  - OTHER_LOCATION
  - UNASSIGNED
  - MISSING
- 0件scan時のMISSING全件確認
- 最大100 Repair
- audit中の追加scan防止
- mode / Location変更時のstale response防止

対象外:

- StorageLocationAssignmentのcreate / update / release / move
- Repair.status変更
- approvalStatus変更
- RepairPlanningState変更
- Repair状態からの推奨zone導出
- 不一致の自動解消
- schema / migration
- RLS / GRANT
- Shipment
- Brother printer

## API / domain contract

Endpoint:

`POST /api/storage-locations/audit`

Input:

- `storageLocationId`: PostgreSQL Int正数
- `repairIds`: 0〜100件、重複禁止

認証:

- NextAuth session必須
- 未認証は401
- read-onlyのためAdmin監査IDは不要

Domain:

`src/lib/storage-location-audit.ts`

- Prisma interactive transaction
- isolation level: `RepeatableRead`
- target Location
- scan対象Repair
- active StorageLocationAssignment
- target Locationのactive assignment
を同じsnapshotで読む。

DB mutationは行わない。

### Classification

#### MATCH

scanしたRepairのactive assignmentが棚卸し対象Location。

#### OTHER_LOCATION

scanしたRepairにactive assignmentがあるが、別Location。

返却情報:

- location id
- name
- shortCode
- locationType

raw `qrToken` / `nfcUid` は返さない。

#### UNASSIGNED

scanしたRepairにactive StorageLocationAssignmentがない。

#### MISSING

DB上では対象Locationにactive assignmentがあるが、今回のscanに含まれないRepair。

0件scanで確認した場合、対象Locationにあるactive RepairはすべてMISSINGになる。

## ScanSession safety

`LOCATION_AUDIT` は `LOCATION_MOVE` と同じ2段階scan契約を使う。

1. Location未選択: Location scan
2. Location選択後: PhysicalTag / Repair scan

安全策:

- audit結果確定は明示操作のみ
- audit中は追加scanしない
- mode変更時にqueue / selection / Location / audit resultをclear
- Location変更時にselection / audit resultをclear
- scan追加 / remove / clearで古いaudit resultを無効化
- request id + generation + Location ID guardでstale responseを破棄
- FIFO queue / debounce / generation safetyを維持
- LOCATION_MOVEのmutation contractは変更しない
- DELIVERY_NOTE / SHIPMENT_SELECTのmixed customer guardを維持
- TIMER contractを維持

## UI

ScanReceiverBarに「保管場所棚卸し」を追加。

フロー:

1. 棚卸し場所のLocationタグ / LOCコードを読む
2. PhysicalTag / PTコードを連続scan
3. 「棚卸し結果を確認」
4. 件数サマリー表示
   - 一致
   - 別場所
   - 保管場所未登録
   - 未検出
5. OTHER_LOCATION / UNASSIGNED / MISSINGの案件を具体表示

OTHER_LOCATIONは現在地名を表示する。

scanや確認だけでは移動・status変更しない。

## Review

Implementer: Codex

Independent reviewer: カタリ

独立レビューで、新規audit route test内のNode内部 `Module._compile` 呼び出しがTypeScript型定義に存在せず、`tsc`が1件失敗することを検出した。

production codeの問題ではなくtest-only typing issueだったため、Codexへ最小修正を返した。

修正:

- `Module & { _compile(code: string, filename: string): void }`
  への局所型アサーション

修正後TypeScriptはPASS。

## Validation

- `npx --no-install prisma validate` — PASS
- `npx --no-install tsc --noEmit --incremental false` — PASS
- 関連StorageLocation / ScanSession tests — 26/26 PASS
- `git diff --check` — PASS
- `npm run build` — PASS
- Next.js: 15.5.27
- build outputで `/api/storage-locations/audit` routeを確認

## Production

Application commit:

`af0555a3847275d4e17961d392f79cabb8f8109d`

Commit subject:

`feat: add storage location audit scan`

Railway deployment:

`2a99e732-a6db-4fad-93bc-f6cb5873e9d3`

- status: SUCCESS
- source: GitHub main
- exact commit: `af0555a3847275d4e17961d392f79cabb8f8109d`
- region: `sin`
- runtime: Next.js Ready in 270ms

Production tag:

`production-task198d-20261002`

Production smoke:

- `/` = 200
- `/login` = 200
- `/storage-locations` unauthenticated = 307 to NextAuth
- `POST /api/storage-locations/audit` unauthenticated = 401

No schema / migration / production DB mutation was required for Task198D.

## Follow-up boundary

Task198E候補:

- Repair.status
- approvalStatus
- RepairPlanningState
- parts readiness
- Scheduler / Shipment等の業務状態

から推奨zone / 許容zone / 要確認をdomain resolverで導出する。

Task198Dの現物-vs-DB現在地照合とは分離する。

Task198Eでも自動移動・status自動変更は前提にせず、まずread-only警告から検討する。
