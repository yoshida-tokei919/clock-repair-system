# CURRENT TASK

## 現在のcheckpoint — 2026-10-02

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `684a5cff462f2b3713e7ee67993d12fb7946530a`
- Commit subject: `feat: add scan session receiver`
- Deploy source: GitHub `main` → Railway, exact feature commit `684a5cff462f2b3713e7ee67993d12fb7946530a`
- Railway deployment: `54274dcf-d047-4dc3-92e6-b2e63295c55b`
- Deployment status: `SUCCESS`
- Production tag: `production-task197-20261002`
- Region: `sin`
- Runtime: Next.js Ready in 347ms
- Task197 migration: none

Production: Task197 complete

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

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task198

Status: implementation prep authorized

Task198ではPhysicalTag / ScanSession基盤の次段として、現物所在確認・StorageLocation / 棚運用を扱う。
実装前に現行Repair status、物理ゾーン運用、schema、既存scan modesとの責務境界を確認し、Repair statusと物理保管場所を混同しない設計にする。

想定している物理ゾーン案:
- 受付処理待ち
- 受付済み
- 見積り調査中
- 承認待ち
- 部品待ち
- 作業待ち
- 作業中
- ランニングテスト中
- 作業完了
- 返送準備
- 発送済み

ただし上記名称・永続化方法・履歴・scan操作はTask198の実装前調査で正本/現行実装と照合して確定する。
Repair status自体の自動変更は別責務とし、scanだけで不可逆な状態変更を行わない。

Task198以外の次Taskを連続開始しない。
