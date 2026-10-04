# Manual assets

詳細版と簡易版で共通利用する画像・図解をここへ置く。

## screenshots/

画面スクリーンショットの正本。

### 取得済み — 問い合わせ・受付

- `inquiry-review-full.png` — Inquiryレビュー画面の全体。LINE履歴、B2C受付判断、時計情報確認までを含む
- `inquiry-review-line.png` — LINEやり取りを読みやすい大きさで撮影した画面
- `inquiry-review-watch.png` — 既存master選択、AI候補、根拠、確定操作
- `inquiry-intake-dialog.png` — 顧客用受付リンク発行ダイアログ。URL tokenは `xxxxxxxx` に置換

上記4枚は、実アプリの `InquiryReviewScreen` を使用し、表示データだけをマニュアル用の合成データへ差し替えて撮影した。実顧客の個人情報、実LINE識別子、認証情報、実受付tokenは使用していない。

### 今後取得する — 問い合わせ・受付

- `inquiry-list.png` — Inquiry一覧
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
- 原則として、実アプリUIへマニュアル用合成データを表示して撮影する。
- API token、cookie、LINE user ID、Manager bot/chat ID、R2 object key、signed URL等を写さない。
- 公開URLにbearer tokenが含まれる画面では、実tokenを `xxxxxxxx` 等へ置換してから保存する。
- browser全体ではなく、説明に必要なアプリ領域を優先する。
- 同じ画面は詳細版・簡易版で共用する。
- 操作箇所の番号・矢印は、元スクリーンショットへ直接焼き込まず、印刷レイアウト側で重ねる。
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

## 印刷プレビュー

受付編の初回印刷レイアウト原本は `../previews/01_intake-print-preview.md`。

生成PDFはMarkdown原本ではなく確認用出力として扱い、Gitの正本にはしない。今回の5ページ見本はローカルの `C:\Users\yoshi\clock-repair-manual-preview\時計修理アプリ_受付編_印刷見本_v0.1.pdf` に出力している。
