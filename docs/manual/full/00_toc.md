# 詳細版 目次案

## 第I部 システムを理解する

1. このアプリでできること
2. 受付から納品までの全体業務フロー
3. システム構成とデータの流れ
4. ログイン・画面構成・共通操作

## 第II部 受付・問い合わせ・案件化

5. LINE問い合わせ受付
6. Inquiry / LINE会話 / 画像の保存
7. AI分析・受付レビュー
8. 時計情報の確認とInquiryからRepairへの案件化

## 第III部 見積・承認・部品・作業準備

9. 修理明細・見積作成
10. 顧客共有ページ・承認・キャンセル
11. 部品検索・発注・部品待ち
12. 見積り待ち / 見積り調査中 / 承認待ちの運用

## 第IV部 修理作業・スケジュール・現物管理

13. WorkTimeSessionと共通業務タイマー
14. Scheduler設定・標準作業時間・実績学習
15. Scheduler v2・今日の作業
16. PhysicalTag / QR / NFC / shortCode
17. ScanSession
18. StorageLocationと棚・箱の運用
19. Brother QL-800 / DK-2205 ラベル印刷

## 第V部 作業完了・発送・納品

20. 作業完了処理とLINE作業完了連絡
21. 顧客の配達希望日時回答
22. Shipment作成・発送予定一覧
23. PhysicalTag連続scanによる梱包照合
24. 発送前PhysicalTag release
25. ゆうプリR CSV出力・発送履歴取込
26. [発送・追跡・配達完了 — 現行運用と制限](26_shipping-tracking-delivery.md)

## 第VI部 外部連携と内部ロジック

27. LINE WebhookとInquiry保存
28. LINE Manager Outbox / local sender / lineoa / 履歴照合
29. n8n連携
30. Slack通知
31. Supabase / Prisma
32. Cloudflare R2
33. Railway
34. 外部配送・決済等の接続

## 第VII部 保守・トラブル対応

35. ステータスと正本データの考え方
36. 二重送信・二重作成を防ぐ仕組み
37. エラー時の切り分け
38. バックアップ・migration・deployの考え方
39. [マニュアル更新手順](39_manual-update.md)

ページ数目安: 約100〜120ページ。各章は実装確定後に統合・分割する。
