# Task198E — Storage zone recommendation / mismatch visibility

## Status

Production complete — 2026-10-02

## Task boundary

Task198Dで分離した「業務状態からの推奨保管zone / 不一致警告」をread-onlyで実装した。

対象:

- Repair.status
- approvalStatus
- RepairPlanningState
- canonical parts readiness
- StorageLocation hierarchy
- current active StorageLocationAssignment

から推奨/許容zoneを導出し、現在の所属ZONEと比較する。

対象外:

- StorageLocationAssignmentのcreate / update / release / move
- Repair.status変更
- approvalStatus変更
- RepairPlanningState変更
- OrderRequest / RepairPartAllocation変更
- Shipment
- ランニングテスト完了イベントの保存
- 見積り調査中専用状態の保存
- approval mode schema
- schema / migration / seed
- RLS / GRANT
- Task198D audit scanの仕様変更

## Canonical zones

- 受付処理待ち
- 見積り待ち
- 見積り調査中
- 承認待ち
- 部品待ち
- 作業待ち
- ランニングテスト中
- 発送・引渡し待ち
- 要確認

## Domain

Main resolver:

`src/lib/storage-zone-recommendation.ts`

Repair adapter:

`src/lib/storage-zone-repair.ts`

Output:

- recommendedZone
- allowedZones
- storageExpectation
  - REQUIRED
  - OPTIONAL
  - NONE
- reasonCode
- reason
- attention
- current zone comparison
  - MATCH
  - MISMATCH
  - UNASSIGNED
  - OPTIONAL_UNASSIGNED
  - NO_STORAGE_EXPECTED

## Main rules

### 送付待ち

- storageExpectation = NONE
- 現物受領前のためactive StorageLocationAssignmentを期待しない

### 受付

- recommended / allowed = 受付処理待ち

### 見積中

- recommended = 見積り待ち
- allowed = 見積り待ち / 見積り調査中

見積り調査中専用の保存状態がまだないため、見積り調査中を不一致にしない。

### 承認待ち

- recommended / allowed = 承認待ち
- approvalStatusがpending以外ならattentionを表示

### 部品待ち系

Repair.statusが以下ならrecommended / allowed = 部品待ち。

- 部品待ち(未注文)
- 部品待ち(注文済み)
- 部品入荷済み

入荷済みだけではallocation完了とみなさない。

### 作業待ち / 作業中 / 作業完了

優先順位:

1. RepairPlanningState.blocked
2. canonical parts readiness
3. Repair.status

`blocked=true && blockReason=WAITING_PARTS` は部品待ちを推奨。

その他のblocked状態は専用物理zoneがないため要確認を推奨。

作業待ち / 作業中でparts readinessがWAITING / WAITING_UNKNOWNの場合は部品待ち。

LEGACY_UNKNOWNは作業待ちを推奨し、要確認も許容。attentionを表示。

作業中でREADY / NOT_REQUIREDの場合:

- storageExpectation = OPTIONAL
- recommended = 作業待ち
- allowed = 作業待ち / 要確認

作業中専用zoneが存在しないため、ベンチ上等の未割当を即不一致にしない。

作業完了:

- recommended = ランニングテスト中
- allowed = ランニングテスト中 / 発送・引渡し待ち

Task199以降のShipmentやランニングテスト完了イベントがまだ正本化されていないため、発送・引渡し待ちも許容する。

### 納品済み

- storageExpectation = NONE
- active assignmentが残っていればMISMATCH

### キャンセル

- storageExpectation = OPTIONAL
- recommended = 発送・引渡し待ち
- allowed = 発送・引渡し待ち / 要確認

返却完了イベントがstatusだけでは分からないため、未割当を即不一致にしない。

### 保留 / unknown status

- recommended / allowed = 要確認
- unknown statusはattentionを表示

## Approval consistency

physical zone recommendation自体はstatus / planning / parts readinessから維持し、approvalStatusの矛盾はattentionとして分離する。

- individual案件が部品待ち/作業段階なのにapprovalStatus != approved
- 承認待ちなのにapprovalStatus != pending
- rejectedなのに保留 / キャンセル / 納品済み以外

business案件はpendingだけを理由にattentionしない。

## StorageLocation hierarchy

StorageLocationは将来の階層運用を前提にする。

- ZONE
- SHELF
- BOX
- TRAY
- OTHER

active assignmentがroot ZONEでなくても、parentIdを辿り最も近いcanonical ZONEを所属zoneとして比較する。

fail-safe:

- cycle
- missing parent
- inactive node
- canonical外のZONE

ではzone解決をnullにしてMISMATCHとする。

## UI

### Repair detail

既存「現在の保管場所」に以下を追加。

- 所属ゾーン
- 推奨ゾーン
- 許容ゾーン
- 判定
- 根拠
- attention

移動・status変更操作は追加しない。

### /storage-locations

選択Location内のRepair一覧へ以下を追加。

- 推奨 / 許容ゾーン
- 判定
- attention

Location hierarchyは全Locationをbulk readしてMap化し、RepairごとのN+1 queryを行わない。

## Review

Implementer: Codex

Independent reviewer: カタリ

Blocking finding: none.

独立レビューでは以下を確認した。

- canonical `resolveRepairPartsReadiness()` を再利用し、部品準備判定を複製していない
- StorageLocation hierarchyでcycle / missing parentをfail-safe処理
- `見積中` / `作業完了` の曖昧状態を複数allowedZonesで扱う
- ShipmentをTask199より先取りしていない
- DB mutationなし
- schema / migration / docs正本のTask外変更なし

## Validation

- `npx --no-install prisma validate` — PASS
- `npx --no-install tsc --noEmit --incremental false` — PASS
- related StorageLocation / ScanSession / parts readiness tests — 43/43 PASS
- `git diff --check` — PASS
- `npm run build` — PASS
- Next.js 15.5.27
- Railway build: 56/56 static pages generated

## Production

Application commit:

`d5c6007b3405730104204973b98abff4e5a5dbdd`

Commit subject:

`feat: add storage zone recommendations`

Railway deployment:

`d4209f14-c39c-4720-bceb-be2903475466`

- status: SUCCESS
- source: GitHub main
- exact commit: `d5c6007b3405730104204973b98abff4e5a5dbdd`
- region: `sin`
- runtime: Next.js Ready in 300ms

Production tag:

`production-task198e-20261002`

Production smoke:

- `/` = 200
- `/login` = 200
- `/storage-locations` unauthenticated = 307 to NextAuth
- `/repairs/1` unauthenticated = 307 to NextAuth

Task198E required no schema / migration / production DB mutation.

## Follow-up boundary

次候補はroadmapどおりTask199 Shipment基盤。

Task198EではShipment modelを先取りせず、作業完了時の「発送・引渡し待ち」はallowed zoneとしてのみ扱った。

Task199開始前にShipmentの正本、Repairとの多対多、まとめ発送、plannedShipDate、実発送イベント等の境界を改めて確認する。
