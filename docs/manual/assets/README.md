# Manual assets

詳細版と簡易版で共通利用する画像・図解をここへ置く。

## screenshots/

画面スクリーンショットの正本。

### 取得済み — システム基本画面

- `login-page.png` — production公開 `/login` の現行ログイン画面。`admin@example.com` はplaceholderであり実アカウントではない

### 取得済み — 問い合わせ・受付

- `inquiry-review-full.png` — Inquiryレビュー画面の全体。LINE履歴、B2C受付判断、時計情報確認までを含む
- `inquiry-review-line.png` — LINEやり取りを読みやすい大きさで撮影した画面
- `inquiry-review-watch.png` — 既存master選択、AI候補、根拠、確定操作
- `inquiry-intake-dialog.png` — 顧客用受付リンク発行ダイアログ。URL tokenは `xxxxxxxx` に置換

上記4枚は、実アプリの `InquiryReviewScreen` を使用し、表示データだけをマニュアル用の合成データへ差し替えて撮影した。実顧客の個人情報、実LINE識別子、認証情報、実受付tokenは使用していない。

### 取得済み — 現物受付・PhysicalTag・保管場所

- `physical-tag-panel.png` — Repair詳細のPhysicalTag / 管理タグ。実コンポーネントへマニュアル用合成データを渡して撮影
- `physical-tag-label-preview.png` — 62×75mm修理袋ラベルのレイアウト見本。実装済み印字項目・QR payload方針に合わせた合成プレビュー
- `storage-location-panel.png` — Repair詳細「現在の保管場所」と推奨 / 許容ゾーン表示。現行pageの表示構造へ合成データを適用
- `repairs-waiting-shipment.png` — `送付待ち` Repairと、現物到着後に選べる次status `受付` を示す合成画面
- `repair-status-received.png` — 現物受領後の `受付` 状態と次業務への案内

実顧客データ、実QR token、実NFC UIDは使用していない。

### 取得済み — 見積・承認・部品

- `estimate-entry.png` — 現行RepairEntryFormの見積・修理明細UIを元に、合成データで再現した見積入力例
- `estimate-document-actions.png` — 実際のEstimatePdfActionsコンポーネント。PDFを開く / PDFを生成 / LINEで送信
- `customer-estimate-approval.png` — B2C顧客共有ページと実際のCustomerB2CApprovalPanelを使った合成見積画面
- `customer-approval-address-dialog.png` — 実際のB2C返送先確認ダイアログ。合成住所を使用
- `orders-management.png` — 現行発注管理UIの項目・状態・操作を元にした合成画面

実顧客データ、実共有token、実OrderRequest、production DBは使用していない。

### 今後取得する — 問い合わせ・受付

- `inquiry-list.png` — Inquiry一覧
- `slack-inquiry-notification-sample.png` — ダミーSlack通知

### 取得済み — タイマー・Scheduler

- `work-timer-bar.png` — 共通業務タイマーバー。active作業、経過時間、停止、共通業務クイック開始を合成表示
- `repair-work-timer.png` — Repair詳細の作業タイマー。見積開始とLABOR明細ごとの修理開始を合成表示
- `scheduler-settings.png` — Scheduler設定の共通設定と修理一般標準時間を、現行項目に沿った合成データで表示
- `repair-work-time-preview.png` — Repair詳細の作業時間previewと「推定時間を採用」導線を合成表示
- `work-calendar.png` — 通常8時間と0h / 4h等の例外日を含むWorkCalendar合成画面
- `scheduler-v2-preview.png` — Scheduler v2の分割予定案、時間feedback、部品・中断、apply導線を合成表示
- `today-work.png` — 今日の容量、実行可能作業、部品待ちとRepairタイマー開始導線を合成表示

実顧客データ、実WorkTimeSession、実ScheduleSegment、production DBは使用していない。

### 取得済み — ScanSession・作業完了・ランニングテスト

- `scan-session-timer.png` — 実ScanSessionのTIMERモードへ合成PhysicalTagを解決し、Repair候補と明示開始ボタンを表示
- `repair-status-work-complete.png` — 現行StatusUpdateFormで `作業中 → 作業完了` を選んだ合成画面
- `running-test-location.png` — `作業完了`・blockedなしの合成Repairで、推奨zone `ランニングテスト中` と現行の完了イベント未実装を明示した画面
- `completion-notice-review.png` — 実RepairCompletionNoticePanelで配達希望URLを含む最終LINE文面を確認する画面。tokenは `xxxxxxxx`
- `completion-notice-confirmed.png` — 実RepairCompletionNoticePanelの `CONFIRMED / 送信済み` 表示

実顧客、実LINE送信先、実public token、実WorkTimeSession、production DBは使用していない。LINE送信・status更新・DB mutationも実行していない。

### 取得済み — 配達希望・Shipment・梱包

- `delivery-preference-customer.png` — 実DeliveryPreferenceFormへ合成データを表示し、日付+時間帯の回答確認まで進めた画面
- `delivery-preference-admin.png` — 実RepairDeliveryRequestPanelへ合成回答とDRAFT Shipmentを表示し、`Shipmentへ反映済み` を確認できる画面
- `shipments-schedule.png` — 実ShipmentsClientへ合成Shipmentを表示した発送予定一覧
- `shipment-select.png` — 実ScanSessionの `発送対象` でPhysicalTag 1件を選択し、明示的なShipment作成ボタンを表示した画面
- `shipment-packing-release.png` — 実ScanSessionの `梱包照合` で梱包一致後、PhysicalTag release previewと明示解放ボタンまで表示した画面

実顧客、実Shipment、実PhysicalTag token、実public token、production DBは使用していない。Shipment作成、配達希望保存、PhysicalTag release等のmutationも実行していない。

### 今後取得する — 見積・作業

- `repair-detail.png`
- `estimate-document-create.png`
- `estimate-parts-search.png`
- `today-work-and-scan.png`

### 今後取得する — PhysicalTag・保管場所

- `storage-locations.png`

### 今後取得する — 発送・納品

- `yupuri-export.png` — 共通UIが追加された場合に取得。現状はAPI出力のため偽画面を作らない

## スクリーンショット方針

- 実顧客の氏名・住所・電話・LINE識別情報は写さない。
- 原則として、実アプリUIへマニュアル用合成データを表示して撮影する。
- 実コンポーネント単体では安全に撮影しにくい場合は、現行UIの項目・配置・文言を元にした撮影専用の合成画面を一時生成し、原本へはPNGだけ残す。
- API token、cookie、LINE user ID、Manager bot/chat ID、R2 object key、signed URL等を写さない。
- 公開URLにbearer tokenが含まれる画面では、実tokenを `xxxxxxxx` 等へ置換してから保存する。
- browser全体ではなく、説明に必要なアプリ領域を優先する。
- 同じ画面は詳細版・簡易版で共用する。
- 操作箇所の番号・矢印は、元スクリーンショットへ直接焼き込まず、印刷レイアウト側で重ねる。
- UI変更時は正本スクリーンショットを差し替え、詳細版・簡易版の両方から再利用する。
- 撮影用の一時route / scriptはcommitしない。

## diagrams/

業務フロー・システム構成・ロジック図の正本と書き出し画像を置く。

初期作成予定:

1. `business-flow` — LINE問い合わせから納品まで
2. `system-architecture` — Railway / Supabase / R2 / Windows n8n / Slack / LINE / local sender
3. `line-inbound-flow` — LINE Webhook → 署名検証 → Inbox → n8n → Inquiry / R2 → Slack
4. `inquiry-ai-flow` — bridge → AI暫定分析 → inputFingerprint → 人レビュー
5. `inquiry-intake-flow` — 受付希望 → 顧客受付リンク → Repair送付待ち → 現物到着 → 受付
6. `line-outbox-flow` — APPROVED → claim → fence → POST → reconciliation → CONFIRMED
7. `n8n-runtime-overview` — Windows Task Scheduler → n8n → 2 active workflows
8. `slack-outbox-flow` — Outbox → n8n → Slack → sent / failed ack
9. `estimate-approval-flow` — 見積中 → PDF → LINE CONFIRMED → 承認待ち → approved → 部品待ち / 作業待ち
10. `parts-order-flow` — pending → ordered → received → assigned
11. `scheduler-flow` — 作業可能判定 → 優先順位 → segment予定
12. `physical-tag-flow` — assign / scan / release / reuse
13. `storage-location-flow` — 移動 / 推奨zone / audit
14. `shipment-flow` — Shipment作成 → packing → ゆうプリR → tracking

最終PDFではカラー図へ書き出し、Markdownから同じ画像を参照する。

- [システム構成とデータの流れ](diagrams/system-architecture.svg) — 第3章
- [管理画面の共通レイアウト](diagrams/admin-common-ui.svg) — 第4章
- [LINE Webhook / Inboxフロー](diagrams/line-webhook-inbox-flow.svg) — 第27章
- [LINE Manager senderフロー](diagrams/line-manager-sender-flow.svg) — 第28章
- [SupabaseとR2のデータ保存境界](diagrams/supabase-r2-data-boundary.svg) — 第31・32章
- [Railway deployとDB migration](diagrams/railway-deploy-flow.svg) — 第33章
- [外部サービスの接続境界](diagrams/external-services-boundary.svg) — 第34章
- [業務事実ごとの正本](diagrams/status-source-of-truth.svg) — 第35章
- [二重処理防止の層](diagrams/duplicate-safety-flow.svg) — 第36章
- [障害の層と確認の順序](diagrams/troubleshooting-boundary.svg) — 第37章
- [production変更の安全フロー](diagrams/production-change-safety-flow.svg) — 第38章

## 印刷プレビュー

- `../previews/01_intake-print-preview.md` — 問い合わせ・受付前半
- `../previews/02_receive-tag-storage-preview.md` — 現物受付・PhysicalTag・StorageLocation
- `../previews/03_estimate-approval-parts-preview.md` — 見積・承認・部品
- `../previews/04_timer-scheduler-preview.md` — WorkTimeSession・Scheduler設定・Scheduler v2・今日の作業
- `../previews/05_repair-work-completion-preview.md` — ScanSession・修理作業・作業完了・ランニングテスト・LINE完了連絡
- `../previews/06_shipping-yupuri-preview.md` — 配達希望回答・Shipment・梱包照合・PhysicalTag release・ゆうプリR
- [07 LINE内部構造](../previews/07_line-internals-preview.md)
- [08 データ保存・実行環境](../previews/08_data-runtime-preview.md)
- [09 外部配送・決済等の接続](../previews/09_external-services-preview.md)
- [10 ステータス・正本・二重処理防止](../previews/10_status-safety-preview.md)
- [11 障害切り分け・production変更](../previews/11_troubleshooting-deploy-preview.md)
- [12 システム構成・ログイン・共通操作](../previews/12_system-basics-preview.md)

生成PDFはMarkdown原本ではなく確認用出力として扱い、Gitの正本にはしない。
