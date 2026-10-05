# 時計修理業務アプリ マニュアル原本

このディレクトリは、時計修理業務アプリの印刷用マニュアル原本を管理する。

## 作成する2冊

1. `full/` — 詳細版
   - アプリでできること
   - 受付から納品までの操作
   - 各画面の役割
   - 業務ロジック
   - LINE / LINE Manager sender / n8n / Supabase / Railway / R2 / ゆうプリR等の連携
   - Scheduler / WorkTimeSession / PhysicalTag / ScanSession / StorageLocation / Shipment等の内部ロジック
   - 障害時の切り分けと運用上の注意
2. `quick/` — 簡易版
   - 日常業務で必要な「受付から納品まで」の操作だけを短くまとめる
   - 原則として内部実装の詳細は載せない

## 原本と出力形式

- 編集原本: Markdown (`.md`)
- 共通画像: `assets/screenshots/`
- 図解原本・画像: `assets/diagrams/`
- 編集確認用: 必要に応じてDOCXへ変換
- 印刷・配布用: A4カラーPDFへ出力

PDFだけを正本にはしない。画面変更やロジック変更時はMarkdownと共通画像を更新し、PDFを再生成する。

## 更新ルール

- マニュアルは「現在の実装」と「将来予定」を混同しない。
- 未完成・未検証機能は、完成済みのように記載しない。
- 画面画像は詳細版と簡易版で共用し、同じ画面を二重管理しない。
- UI変更時は該当スクリーンショットと説明だけを差し替える。
- ロジック変更時は該当章と図解を更新する。
- API token、cookie、認証情報、署名URL、顧客の個人情報をマニュアルへ載せない。
- LINE / n8n / 外部サービスの説明は、正本資料または実稼働設定を確認してから記載する。

## 印刷方針

- A4縦を基本とする。
- フルカラー。
- 画面スクリーンショットは文字が読める大きさを優先する。
- 重要操作は番号・囲み・矢印で示す。
- 詳細版は約100〜120ページ、簡易版は約20〜30ページを目安とする。

## この原本の初期基準

初期作成日: 2026-10-04

初期確認時のrepository HEAD: `2e28c8f586c0ccc783893ba901578953bab90d9c`

今後は機能のproduction反映状況に合わせて継続更新する。

## 発送・配達希望の章

- 詳細版: [21 配達希望](full/21_delivery-preference.md) → [22 Shipment](full/22_shipment.md) → [23 梱包照合](full/23_shipment-packing.md) → [24 タグ解放](full/24_physical-tag-release.md) → [25 ゆうプリR](full/25_yupuri.md)
- 簡易版: [18 配達希望](quick/18_delivery-preference.md) → [19 Shipment](quick/19_shipment.md) → [20 梱包](quick/20_packing.md) → [21 タグ解放](quick/21_tag-release.md) → [22 ゆうプリR](quick/22_yupuri.md)

これらの章は現行実装と未実装範囲を明示する。発送・追跡・配達完了の自動処理はまだ完成していないため、実装済みの発送準備と未実装の自動連携を分けて記載する。

## LINE内部構造の章

- 詳細版: [27 LINE WebhookとInquiry保存](full/27_line-webhook.md) → [28 LINE Manager Outbox / local sender / lineoa / 履歴照合](full/28_line-manager-sender.md)

## データ保存・実行環境の章

- 詳細版: [31 Supabase / Prisma](full/31_supabase-prisma.md) → [32 Cloudflare R2](full/32_cloudflare-r2.md) → [33 Railway](full/33_railway.md)

## 外部サービスの接続境界

- 詳細版: [34 外部配送・決済等の接続](full/34_external-integrations.md)

## 第VII部 ステータス・正本・二重処理防止

- 詳細版: [35 ステータスと正本データの考え方](full/35_status-source-of-truth.md) → [36 二重送信・二重作成を防ぐ仕組み](full/36_duplicate-safety.md)

## 第VIII部 障害切り分け・production変更

- 詳細版: [37 エラー時の切り分け](full/37_troubleshooting.md) → [38 バックアップ・migration・deploy](full/38_backup-migration-deploy.md)

## 印刷プレビュー

`previews/` は、Markdown原本と共通スクリーンショットからA4カラーPDFを組む際のページ構成・文字量・画像サイズを確認するためのレイアウト原本を置く。

- 初回見本: `previews/01_intake-print-preview.md` — LINE問い合わせ → AI受付レビュー → 受付リンク → Repair「送付待ち」
- 続き見本: `previews/02_receive-tag-storage-preview.md` — 現物到着 → 受付 → PhysicalTag → QL-800ラベル → StorageLocation
- 見積・承認見本: `previews/03_estimate-approval-parts-preview.md` — 見積入力 → LINE共有 → 顧客承認 → 部品発注
- タイマー・Scheduler見本: `previews/04_timer-scheduler-preview.md` — WorkTimeSession → Scheduler設定 → WorkCalendar → Scheduler v2 → 今日の作業
- 修理作業・完了連絡見本: `previews/05_repair-work-completion-preview.md` — PhysicalTag scan → 実修理 → 作業完了 → ランニングテスト → LINE完了連絡
- 配達希望・発送見本: `previews/06_shipping-yupuri-preview.md` — 配達希望回答 → Shipment → 梱包照合 → PhysicalTag release → ゆうプリR
- LINE内部構造見本: [previews/07_line-internals-preview.md](previews/07_line-internals-preview.md)
- データ保存・実行環境見本: [previews/08_data-runtime-preview.md](previews/08_data-runtime-preview.md)
- 外部配送・決済等の接続見本: [previews/09_external-services-preview.md](previews/09_external-services-preview.md)
- ステータス・正本・二重処理防止見本: [previews/10_status-safety-preview.md](previews/10_status-safety-preview.md)
- 障害切り分け・production変更見本: [previews/11_troubleshooting-deploy-preview.md](previews/11_troubleshooting-deploy-preview.md)
- 生成PDFは確認用出力であり、Git上の正本にはしない。
- 画面例には実顧客データを使わず、実アプリUIまたは現行UI構造へ合成データを表示して撮影する。
