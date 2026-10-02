# CURRENT TASK

## 現在のcheckpoint — 2026-10-02

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `165530378a6713c188a33585142b2b1a96420529`
- Commit subject: `feat: add shipment server foundation`
- Deploy source: GitHub `main` → Railway, exact commit `165530378a6713c188a33585142b2b1a96420529`
- Railway deployment: `59a1a9c3-d9be-454b-9f34-49f31355890f`
- Deployment status: `SUCCESS`
- Production tag: `production-task199b-20261002`
- Region: `sin`
- Runtime: Next.js 15.5.27, Ready in 345ms
- Supabase migration: none; schema / migration / production DB mutationなし

Production: Task199B complete. Task199C is awaiting user approval.

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

### Task198D — StorageLocation audit scan

Status: production complete

- Application commit: `af0555a3847275d4e17961d392f79cabb8f8109d`
- Railway deployment: `2a99e732-a6db-4fad-93bc-f6cb5873e9d3` — SUCCESS
- Production tag: `production-task198d-20261002`
- schema / migration / production DB mutationなし。
- ScanSessionへ `LOCATION_AUDIT` modeを追加。
- 棚卸しLocationを先にscanし、その後PhysicalTag / Repairを最大100件まで連続scan。
- 明示的な「棚卸し結果を確認」でread-only照合を実行。
- Prisma Repeatable Read snapshot内でactive StorageLocationAssignmentと照合。
- 結果分類: MATCH / OTHER_LOCATION / UNASSIGNED / MISSING。
- 0件scanでも対象Locationのactive Repair全件をMISSINGとして確認可能。
- audit中の追加scanをblockし、mode / Location変更時のrequest ID + generation guardでstale responseを破棄。
- scan / auditだけではStorageLocationAssignmentを変更しない。
- Repair.status / approvalStatus / RepairPlanningStateを変更しない。
- recommended zone判定・不一致自動解消は対象外。
- 独立レビューでtest-only TypeScript typing issueを1件検出し、Codex修正後に再検証。
- Prisma validate / TypeScript / `git diff --check` / production build PASS。
- StorageLocation / ScanSession regression: 26/26 PASS。
- Production smoke: `/`=200、`/login`=200、`/storage-locations`未認証=307、`POST /api/storage-locations/audit`未認証=401。
- 詳細: `docs/ai-tasks/198d-storage-location-audit.md`

### Task198E — Storage zone recommendation / mismatch visibility

Status: production complete

- Application commit: `d5c6007b3405730104204973b98abff4e5a5dbdd`
- Railway deployment: `d4209f14-c39c-4720-bceb-be2903475466` — SUCCESS
- Production tag: `production-task198e-20261002`
- schema / migration / production DB mutationなし。
- Repair.status / approvalStatus / RepairPlanningState / canonical parts readinessからrecommended zone / allowed zones / 根拠 / attentionをread-onlyで導出。
- `resolveRepairPartsReadiness()`を再利用し、部品準備判定を複製しない。
- 見積中は「見積り待ち」を推奨し「見積り調査中」も許容。
- 作業完了は「ランニングテスト中」を推奨し「発送・引渡し待ち」も許容。
- 作業中は専用zoneがないため条件により未割当を許容。
- StorageLocationがSHELF / BOX / TRAYでもparentを辿ってcanonical ZONEを判定。
- cycle / missing parent / inactive node / canonical外ZONEはfail-safeでMISMATCH。
- Repair詳細と `/storage-locations` に推奨 / 許容 / 判定 / 根拠 / attentionを表示。
- StorageLocationAssignment自動移動、Repair.status変更、Shipment先取りなし。
- 独立レビュー: blocking findingなし。
- Prisma validate / TypeScript / `git diff --check` / production build PASS。
- related StorageLocation / ScanSession / parts readiness tests: 43/43 PASS。
- Railway build: static pages 56/56。
- Production smoke: `/`=200、`/login`=200、`/storage-locations`未認証=307、`/repairs/1`未認証=307。
- 詳細: `docs/ai-tasks/198e-storage-zone-recommendations.md`

## Supabase security hardening — 2026-10-02

Status: production complete

- Security AdvisorのFunction Search Path Mutable WARN対象だった2つのtrigger functionだけに空の`search_path`を設定。function body、table/data、RLS、GRANTの変更なし。
- 独立レビュー、production function signature確認、migration前backupを完了。Supabase migration `20261002013945 harden_trigger_function_search_paths`を適用。
- 適用後、両functionの`proconfig`に`search_path=""`を確認し、`security_definer=false`を維持。Function Search Path Mutable WARNは0件。
- Railway deployment `4df54bcf-ad0d-4ca6-9a4f-59f33edcf5d6`成功。Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307。
- 詳細・backup・対象外follow-up: `docs/ai-tasks/supabase-security-hardening-20261002.md`

## Next.js 15 security migration — 2026-10-02

Status: production complete

- Next.js 14.1.0 → 15.5.27、React / ReactDOM 19.3.0へ更新。Next 15 Async Request API、React-PDF互換、build設定を移行。
- 独立read-onlyレビューでblocking findingなし。TypeScript、関連regression 20/20、local build、Railway build（static pages 56/56）がPASS。
- Railway deployment `cfe7be54-9a60-4be2-ade9-083611482b23`成功。Production smoke: `/`、`/login`、`/cases/gallery`=200、`/repairs`と`/storage-locations`未認証=307、`/api/repairs/1/planning`未認証=401。対象リクエストのRailway HTTP logsにupstream errorなし。
- `npm audit` production findingsは8件→5件。`next-auth` 4.24.13のcriticalを含む残存advisoryは未解消で、別follow-up対象。
- 詳細: `docs/ai-tasks/next15-security-migration-20261002.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage C 現在地 — Task199 Shipment基盤

### Task199A — Shipment schema foundation

Status: production complete

- Application commit: `2a2a4fe491675e6c67de87b784262226782d0fee`
- Railway deployment: `83f71fb9-0a51-4a87-bc64-1066fa7bba89` — SUCCESS
- Production tag: `production-task199a-20261002`
- Supabase migration: `20261002074103 add_shipment_foundation`
- Shipment / ShipmentRepairと3 enumを追加。
- Repair ↔ Shipmentを明示join modelで多対多化。
- 1 Shipment = 1個口、1 Shipmentに複数Repair、1 Repairに複数Shipmentを許容。
- plannedShipDate / actualShippedAt / trackingNumber / carrier-independent destination snapshot等をShipmentへ配置。
- Repair.status / DeliveryNote / StorageLocation / PhysicalTagとは独立。
- 日本郵便 / ヤマト固有schemaは追加せず、carrierCode / serviceCodeを共通fieldとして保持。
- server-only: RLS enabled、policyなし、anon/authenticated/service_roleへtable/sequence権限なし、GRANTなし。
- 独立レビューでmigration順序とgenerated tsconfig.tsbuildinfo混入を検出し、production前に修正。
- Prisma validate / TypeScript / `git diff --check` / production build PASS。
- Production read-backでtable / enum / FK / index / RLS / privileges一致を確認。
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、`/storage-locations`未認証=307。
- 詳細: `docs/ai-tasks/199a-shipment-schema-foundation.md`

### Task199B — Shipment server-side create/read/update foundation

Status: production complete

- Application commit: `165530378a6713c188a33585142b2b1a96420529`
- Railway deployment: `59a1a9c3-d9be-454b-9f34-49f31355890f` — SUCCESS
- Production tag: `production-task199b-20261002`
- schema / migration / RLS / GRANT変更なし。
- `POST /api/shipments` でexplicit `confirmed: true` を要求し、repairIdsをserver-side再取得。
- missing Repairは404、別customer混在・返送先snapshot欠損/不正/不一致は409でfail closed。
- duplicate repairIdsはdeduplicate。
- Customer.typeだけでは作成可否を決めず、individual / business共通でRepair return-address snapshotを正本として検証。
- Customer current addressへのfallbackなし。
- validな場合のみSerializable transactionでShipment + ShipmentRepairを作成。
- `GET /api/shipments/[id]` で必要最小限のCustomer / Repair relationをread。
- `PATCH /api/shipments/[id]` はDRAFTのplanning fieldだけ更新可能。
- ShipmentStatus / trackingNumber / labelIssuedAt / actualShippedAt / deliveredAtはTask199Bでは変更不可。
- Repair.status / StorageLocation / DeliveryNote / ScanSession / carrier adapter / LINEには接続していない。
- 独立レビューでB2B一律拒否を検出し、complete + valid + identicalなRepair snapshotならbusinessも共通Shipmentを作成できるよう修正。
- Prisma validate / TypeScript / focused tests 11/11 / staged diff check / production build PASS。
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、Shipment POST/GET/PATCH未認証=401。
- 詳細: `docs/ai-tasks/199b-shipment-server-foundation.md`

### Task199C — ScanSession SHIPMENT_SELECT connection

Status: awaiting user approval

次候補はTask199C。

少なくとも以下を扱う。

- ScanSession `SHIPMENT_SELECT` のselected Repairsを確認画面へ接続
- scanだけではShipmentを作成しない
- 人間の明示確認後にTask199Bのserver contractへPOST
- server-sideでRepair / customer / return-address snapshotを再検証
- 別顧客 / 宛先不一致はblock
- Repair.status / StorageLocationの自動変更はまだ行わない
- Task200の発送スケジュールUIは先取りしない

Task199Cはuser approvalなしに開始しない。
