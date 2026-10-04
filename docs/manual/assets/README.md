# Manual assets

詳細版と簡易版で共通利用する画像・図解をここへ置く。

## screenshots/

画面スクリーンショットの正本。

推奨ファイル名:

- `inquiry-review.png`
- `repair-detail.png`
- `estimate-editor.png`
- `customer-shared-page.png`
- `today-work.png`
- `physical-tag-panel.png`
- `scan-session.png`
- `storage-locations.png`
- `shipments.png`
- `delivery-preference.png`
- `yupuri-export.png`

### スクリーンショット方針

- 実顧客の氏名・住所・電話・LINE識別情報は写さない。
- マニュアル用デモデータを使うか、個人情報を確実にマスクする。
- browser全体ではなく、説明に必要なアプリ領域を優先する。
- 同じ画面は詳細版・簡易版で共用する。
- 操作箇所の番号・矢印は、元スクリーンショットへ直接焼き込まず、図解版を別ファイルにする。

## diagrams/

業務フロー・システム構成・ロジック図の正本と書き出し画像を置く。

初期作成予定:

1. `business-flow` — LINE受付から納品まで
2. `system-architecture` — Railway / Supabase / R2 / n8n / Slack / LINE
3. `line-outbox-flow` — APPROVED → claim → fence → POST → reconciliation → CONFIRMED
4. `inquiry-promotion-flow` — Inquiry → Watch / Repair
5. `scheduler-flow` — 作業可能判定 → 優先順位 → segment予定
6. `physical-tag-flow` — assign / scan / release / reuse
7. `storage-location-flow` — 移動 / 推奨zone / audit
8. `shipment-flow` — Shipment作成 → packing → ゆうプリR → tracking

最終PDFではカラー図へ書き出し、Markdownから同じ画像を参照する。