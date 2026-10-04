# Manual assets

詳細版と簡易版で共通利用する画像・図解をここへ置く。

## screenshots/

画面スクリーンショットの正本。

### 問い合わせ・受付

- `inquiry-list.png` — Inquiry一覧
- `inquiry-review-overview.png` — Inquiryレビュー全体
- `inquiry-review-line-section.png` — LINEやり取り
- `inquiry-review-watch-candidates.png` — AI候補・根拠・確定操作
- `inquiry-review-master-selection.png` — master選択・明示登録
- `inquiry-intake-invite-dialog.png` — 顧客用受付リンク発行
- `repairs-waiting-shipment.png` — 「送付待ち」Repair
- `repair-status-received.png` — 現物到着後の「受付」変更
- `slack-inquiry-notification-sample.png` — ダミーSlack通知

### 見積・作業

- `repair-detail.png`
- `estimate-editor.png`
- `customer-shared-page.png`
- `today-work.png`
- `today-work-and-scan.png`

### PhysicalTag・保管場所

- `physical-tag-panel.png`
- `scan-session.png`
- `storage-locations.png`

### 発送・納品

- `shipments.png`
- `delivery-preference.png`
- `yupuri-export.png`

## スクリーンショット方針

- 実顧客の氏名・住所・電話・LINE識別情報は写さない。
- マニュアル用デモデータを使うか、個人情報を確実にマスクする。
- API token、cookie、LINE user ID、Manager bot/chat ID、R2 object key、signed URL等を写さない。
- browser全体ではなく、説明に必要なアプリ領域を優先する。
- 同じ画面は詳細版・簡易版で共用する。
- 操作箇所の番号・矢印は、元スクリーンショットへ直接焼き込まず、図解版を別ファイルにする。
- UI変更時は正本スクリーンショットを差し替え、詳細版・簡易版の両方から再利用する。

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
9. `scheduler-flow` — 作業可能判定 → 優先順位 → segment予定
10. `physical-tag-flow` — assign / scan / release / reuse
11. `storage-location-flow` — 移動 / 推奨zone / audit
12. `shipment-flow` — Shipment作成 → packing → ゆうプリR → tracking

最終PDFではカラー図へ書き出し、Markdownから同じ画像を参照する。

## 今回の優先取得画像

最初の印刷プレビューでは、次の8枚を優先して取得する。

1. `inquiry-list.png`
2. `inquiry-review-overview.png`
3. `inquiry-review-line-section.png`
4. `inquiry-review-watch-candidates.png`
5. `inquiry-review-master-selection.png`
6. `inquiry-intake-invite-dialog.png`
7. `repairs-waiting-shipment.png`
8. `repair-status-received.png`

この8枚で「LINE問い合わせ → 受付レビュー → 受付リンク → 送付待ち → 現物受付」の最初の章をカラー印刷用に組める。
