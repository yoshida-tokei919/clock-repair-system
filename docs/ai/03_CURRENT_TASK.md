# CURRENT TASK

## 現在のcheckpoint — 2026-10-02

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `957d675d210b42baeec7cfa37b0596ec825178c9`
- Commit subject: `fix: pin trigger function search paths`
- Deploy source: GitHub `main` → Railway, exact commit `957d675d210b42baeec7cfa37b0596ec825178c9`
- Railway deployment: `4df54bcf-ad0d-4ca6-9a4f-59f33edcf5d6`
- Deployment status: `SUCCESS`
- Production tag: `production-security-hardening-20261002`
- Region: `sin`
- Runtime: Next.js Ready in 607ms
- Supabase migration: `20261002013945 harden_trigger_function_search_paths`

Production: Supabase security hardening complete; Task198C remains complete.

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
- FIFO queue、最大16件、750ms同一raw scan debounceを実装。
- R65固有UID形式は未推測のまま。
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
- server-only: RLS enabled、policyなし、anon/authenticated/service_roleへtable/sequence権限なし。
- 詳細: `docs/ai-tasks/198a-storage-location-schema-foundation.md`

### Task198B — StorageLocation move flow / ScanSession接続

Status: production complete

- Application commit: `aeaa0be6723b526de87af74e18c9faac61c3a5b1`
- Railway deployment: `b457c062-0330-4699-9646-25703fdd0967` — SUCCESS
- Production tag: `production-task198b-20261002`
- schema / migration変更なし。
- authenticated StorageLocation resolverを追加。
- identifier types: NFC_UID / QR_TOKEN / SHORT_CODE。
- resolver status: NOT_FOUND / INACTIVE / RESOLVED。
- authenticated StorageLocation move APIを追加。
- 最大100 Repairを1つのSerializable transactionで同一Locationへ移動可能。
- 旧assignment release → 新assignment createで履歴保持。
- 同一Locationはno-op。
- actual Admin.idを監査保存。
- stale state / P2002 / P2034は409。
- ScanSessionへ `LOCATION_MOVE` modeを追加。
- 先に移動先Locationをscanし、その後PhysicalTag/Repairを複数scan。
- scanだけではDB変更せず、明示確認後に移動。
- 移動成功後はdestinationを保持し、次のbatchを同じ場所へ連続移動可能。
- 連続scanのphaseはenqueue時ではなく処理時点のcurrent destinationで判定。
- Repair.statusは変更しない。
- Task198B + ScanSession + PhysicalTag regression: 42/42 PASS。
- TypeScript PASS、`git diff --check` PASS、`npm run build` PASS。
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、StorageLocation resolve valid/malformed未認証=401、move valid/malformed未認証=401。
- StorageLocationはproductionでまだ0件のため、実移動mutation smokeは未実施。
- 詳細: `docs/ai-tasks/198b-storage-location-move-flow.md`

### Task198C — StorageLocation visibility / initial zones

Status: production complete

- Application commit: `42281b9114b580443e89e192894d1b2b75b81170`
- Railway deployment: `a78de541-a17a-4419-b05d-78b55fc3810d` — SUCCESS
- Production tag: `production-task198c-20261002`
- Supabase migration: `20261002005051 seed_initial_storage_locations`
- 初期StorageLocation 9ゾーンをdata-only migrationで投入。
- 既存shortCode / nameが正本定義と衝突する場合はfail closed。既存行のUPDATE / DELETEなし。
- StorageLocation / StorageLocationAssignmentはRLS enabled、policyなし、anon/authenticated/service_roleへのtable権限なしを維持。
- Repair詳細にactive StorageLocationAssignmentを現在保管場所として表示。未割当は「保管場所未登録」。
- `/storage-locations` にactive Location一覧、active Repair件数、Location単位のRepair一覧を追加。
- Sidebar導線とNextAuth middleware保護を追加。
- LOCATION_AUDIT / 棚卸しscan、推奨zone判定、status自動変更は対象外。
- StorageLocation / ScanSession regression: 20/20 PASS。
- Prisma validate / TypeScript / `git diff --check` / production build PASS。
- Production read-back: canonical 9 zones、StorageLocationAssignment 0件。
- Production smoke: `/`=200、`/login`=200、`/storage-locations`未認証=307、`/repairs`未認証=307。
- 詳細: `docs/ai-tasks/198c-storage-location-visibility.md`

## Supabase security hardening — 2026-10-02

Status: production complete

- Security AdvisorのFunction Search Path Mutable WARN対象だった2つのtrigger functionだけに空の`search_path`を設定。function body、table/data、RLS、GRANTの変更なし。
- 独立レビュー、production function signature確認、migration前backupを完了。Supabase migration `20261002013945 harden_trigger_function_search_paths`を適用。
- 適用後、両functionの`proconfig`に`search_path=""`を確認し、`security_definer=false`を維持。Function Search Path Mutable WARNは0件。
- Railway deployment `4df54bcf-ad0d-4ca6-9a4f-59f33edcf5d6`成功。Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307。
- 詳細・backup・対象外follow-up: `docs/ai-tasks/supabase-security-hardening-20261002.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task198D

Status: awaiting user approval

Task198D候補は、Task198Cで投入・可視化したStorageLocationを使った現在地確認 / 棚卸しscanに限定する。

候補境界:

- LOCATION_AUDIT / 棚卸しscan mode
- PhysicalTag / Repair scanとStorageLocationAssignment現在地の照合
- 現物とDB現在地の不一致を明示
- scanだけで自動移動しない
- Repair.statusを自動変更しない
- 不一致解消は人間の確認操作を残す

Repair.status / approvalStatus / RepairPlanningState等から推奨zoneを導くロジックはTask198Dへ混ぜず、Task198E候補として分離する。

Task198D以外の次Taskを連続開始しない。
