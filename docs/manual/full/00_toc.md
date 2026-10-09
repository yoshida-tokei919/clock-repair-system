# 詳細版 目次

## 第I部 システムを理解する

1. [このアプリでできること](01_capabilities.md)
2. [受付から納品までの全体業務フロー](02_system-overview.md)
3. [システム構成とデータの流れ](03_system-architecture.md)
4. [ログイン・画面構成・共通操作](04_login-common-ui.md)

## 第II部 受付・問い合わせ・案件化

5. [LINE問い合わせ受付](05_line-inquiry-intake.md)
6. [Inquiry / LINE会話 / 画像の保存](06_inquiry-line-storage.md)
7. [AI分析・受付レビュー](07_ai-review.md)
8. [時計情報の確認とInquiryからRepairへの案件化](08_inquiry-to-repair.md)

## 第III部 見積・承認・部品・作業準備

9. [修理明細・見積作成](09_estimate.md)
10. [顧客共有ページ・承認・キャンセル](10_customer-approval.md)
11. [部品検索・発注・部品待ち](11_parts-order.md)
12. [見積り待ち / 見積り調査中 / 承認待ちの運用](12_estimate-approval-operations.md)

## 第IV部 修理作業・スケジュール・現物管理

13. [WorkTimeSessionと共通業務タイマー](13_work-time-session.md)
14. [Scheduler設定・標準作業時間・実績学習](14_scheduler-settings.md)
15. [Scheduler v2・今日の作業](15_scheduler-v2-today.md)
16. [PhysicalTag / QR / NFC / shortCode](16_physical-tag.md)
17. [ScanSession](17_scan-session.md)
18. [StorageLocationと棚・箱の運用](18_storage-location.md)
19. [Brother QL-800 / DK-2205 ラベル印刷](19_ql800-label.md)

## 第V部 作業完了・発送・納品

20. [作業完了処理とLINE作業完了連絡](20_completion-line.md)
21. [顧客の配達希望日時回答](21_delivery-preference.md)
22. [Shipment作成・発送予定一覧](22_shipment.md)
23. [PhysicalTag連続scanによる梱包照合](23_shipment-packing.md)
24. [発送前PhysicalTag release](24_physical-tag-release.md)
25. [ゆうプリR CSV出力・発送履歴プレビュー](25_yupuri.md)
26. [発送・追跡・配達完了 — 現行運用と制限](26_shipping-tracking-delivery.md)

## 第VI部 外部連携と内部ロジック

27. [LINE WebhookとInquiry保存](27_line-webhook.md)
28. [LINE Manager Outbox / local sender / lineoa / 履歴照合](28_line-manager-sender.md)
29. [n8n連携](29_n8n.md)
30. [Slack通知](30_slack.md)
31. [Supabase / Prisma](31_supabase-prisma.md)
32. [Cloudflare R2](32_cloudflare-r2.md)
33. [Railway](33_railway.md)
34. [外部配送・決済等の接続](34_external-integrations.md)

## 第VII部 保守・トラブル対応

35. [ステータスと正本データの考え方](35_status-source-of-truth.md)
36. [二重送信・二重作成を防ぐ仕組み](36_duplicate-safety.md)
37. [エラー時の切り分け](37_troubleshooting.md)
38. [バックアップ・migration・deployの考え方](38_backup-migration-deploy.md)
39. [マニュアル更新手順](39_manual-update.md)

## 第VIII部 追加の現行業務

40. [Customer Communication HubとRepairのLINE履歴](40_customer-communication-hub.md)
41. [B2B一括受付と管理タグ印刷](41_b2b-batch-intake.md)
42. [B2C前受金・返金・最終請求への充当](42_repair-prepayment.md)
