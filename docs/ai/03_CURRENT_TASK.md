# CURRENT TASK

## 現在のcheckpoint — 2026-10-02

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `4f0664281933761f28cf27f519e62ddbb2b868ac`
- Commit subject: `feat: add storage location schema foundation`
- Deploy source: GitHub `main` → Railway, exact feature commit `4f0664281933761f28cf27f519e62ddbb2b868ac`
- Railway deployment: `ceecb7e7-f90a-498b-9fec-dc420de09ec9`
- Deployment status: `SUCCESS`
- Production tag: `production-task198a-20261002`
- Region: `sin`
- Runtime: Next.js Ready in 274ms
- Supabase migration: `20261001204201 add_storage_location_foundation`

Production: Task198A complete

## Stage B 現在地

### Task196A–C

PhysicalTag schema foundation、authenticated resolver、assign / release / replace lifecycleはproduction完了。

### Task196D — PhysicalTag発行・QRラベル

Software status: production complete

- Application commit: `07a62846ca77c12faf7160457f354d4e929440bf`
- Railway deployment: `29270eee-e41f-4c1c-b591-2823860d6e6a` — SUCCESS
- Production tag: `production-task196d-20261001`
- `PT-000001`形式のshortCode、opaque random qrToken、任意NFC UID、Repairへの即時assignを実装。
- Repair詳細へPhysicalTag管理パネルと62×29mm QRラベルPDF導線を追加。
- QR payloadはqrTokenのみ。Repair ID / inquiryNumber / PIIをQRへ含めない。
- legacy `/api/print-tag` とRepair-ID / inquiryNumber QRを撤去。
- Production smoke完了。
- Brotherプリンター実機での62×29mm印刷品質・余白・QR読取確認はハードウェア到着後に実施する。これはソフトウェアproduction反映とは分離して追跡する。
- 詳細: `docs/ai-tasks/196d-physical-tag-label-flow.md`

### Task197 — 共通scan receiver / ScanSession

Status: production complete

- Application commit: `684a5cff462f2b3713e7ee67993d12fb7946530a`
- Railway deployment: `54274dcf-d047-4dc3-92e6-b2e63295c55b` — SUCCESS
- Production tag: `production-task197-20261002`
- 管理画面全体へkeyboard-wedge/HID + 手入力の共通scan receiverを追加。
- modes: `OPEN_REPAIR`, `TIMER`, `BATCH_SELECT`, `DELIVERY_NOTE`, `SHIPMENT_SELECT`
- resolver APIを再利用し、NOT_FOUND / RETIRED / UNASSIGNED / AMBIGUOUSを明示。
- TIMERはscanだけで状態変更せず、人間の確認後に開始/切替。
- DELIVERY_NOTE / SHIPMENT_SELECTは別顧客混入をblockし、実際の帳票・Shipment作成は行わない。
- 後続scanを落とさないFIFO queue、最大16件、750ms同一raw scan debounceを実装。
- R65固有UID形式は未推測のまま。
- Final regression: 28/28 tests PASS、TypeScript PASS、`git diff --check` PASS、`npm run build` PASS。
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、resolver valid/malformed=401、WorkTimer active/start未認証=401。
- 詳細: `docs/ai-tasks/197-scan-session-receiver.md`

### Task198A — StorageLocation schema foundation

Status: production complete

- Application commit: `4f0664281933761f28cf27f519e62ddbb2b868ac`
- Railway deployment: `ceecb7e7-f90a-498b-9fec-dc420de09ec9` — SUCCESS
- Production tag: `production-task198a-20261002`
- Supabase migration: `20261001204201 add_storage_location_foundation`
- StorageLocation / StorageLocationAssignment / StorageLocationTypeを追加。
- StorageLocationはRepair.status / RepairWorkPlan / PhysicalTagから独立。
- 1 Repairにつきactive StorageLocationAssignmentは最大1件。
- 1 StorageLocationには複数Repairを配置可能。
- location hierarchyは parentId により ZONE / SHELF / BOX / TRAY / OTHER を表現可能。
- shortCode / nfcUid / qrToken は将来のlocation scan識別用にnullable uniqueで確保。
- 既存Repairのbackfill、初期zone seed、Repair status変更なし。
- server-only: RLS enabled、policyなし、anon/authenticated/service_roleへtable/sequence権限なし。
- production migration前backup: `C:\Users\yoshi\clock-repair-backups\task198a-20261002-0540`
- production read-back: 新2テーブル0件、enum/partial unique/CHECK/RLS/privileges確認済み。
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、PhysicalTag resolver valid/malformed未認証=401。
- 詳細: `docs/ai-tasks/198a-storage-location-schema-foundation.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task198B

Status: awaiting user approval

Task198BではTask198Aのschema foundationを利用し、StorageLocationへの実移動を安全に記録するAPI / domain層と、Task197 ScanSessionとの接続境界を扱う候補とする。

想定境界:
- current active StorageLocationAssignmentの取得
- Repairを別StorageLocationへ移動するtransaction
- 旧assignment release → 新assignment createを履歴保持してatomicに実行
- authenticated Admin IDを監査用に保存
- inactive location / nonexistent location / stale state / concurrency conflictを明示
- scanだけでRepair.statusを自動変更しない
- Shipment作成、PhysicalTag lifecycle、初期zone seed、不一致判定UIはTask198Bへ混ぜず、必要なら198C以降へ分離する

Task198Bの具体的API・scan mode・location resolver/issuance境界は、実装前調査で現行Task197契約と再照合して確定する。

Task198B以外の次Taskを連続開始しない。
