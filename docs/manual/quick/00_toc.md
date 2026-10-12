# 簡易版 目次

この冊子は、B2C案件をLINE問い合わせから発送・納品確認まで日常業務で処理するための操作版である。発送後の追跡連携は実装済みだが、2026-10-13時点で永続同期は停止中。第22章で現在の制限を確認する。

## 問い合わせ・受付

1. [受付から納品までの全体像](01_workflow-overview.md)
2. [LINE問い合わせを確認する](02_line-inquiry.md)
3. [受付レビューと受付リンク](03_review-and-intake-link.md)
4. [「送付待ち」から現物受付へ](04_receive-watch.md)
5. [PhysicalTag発行と修理袋ラベル](05_physical-tag-label.md)
6. [保管場所を登録する](06_storage-location.md)

## 見積・承認・部品

7. [見積明細を作成・送信する](07_estimate.md)
8. [顧客承認を確認する](08_customer-approval.md)
9. [部品を発注・入荷・案件割当する](09_parts-order.md)
10. [見積・承認中の置き場所と状態](10_estimate-approval-status.md)

## 修理作業・スケジュール

11. [作業カレンダーと予定案を確認する](11_scheduler-daily.md)
12. [今日の作業を確認する](12_today-work.md)
13. [作業タイマーを開始・切替・停止する](13_work-timer.md)
14. [PhysicalTagをscanする](14_scan-session.md)
15. [修理作業を完了する](15_complete-repair.md)
16. [ランニングテスト・最終確認を行う](16_running-test.md)

## 作業完了・発送準備

17. [作業完了をLINE連絡する](17_completion-line.md)
18. [配達希望回答を確認する](18_delivery-preference.md)
19. [Shipmentを確認・作成し、予定を確認する](19_shipment.md)
20. [梱包対象を照合する](20_packing.md)
21. [発送前にPhysicalTagを解放する](21_tag-release.md)
22. [ゆうプリクラウドとゆうプリRの使い方](22_yupuri.md)

> **現行制限:** ゆうプリクラウドでの送り状発行は運用中。配送CSVからのShipment同期・LINE発送通知・Repair納品済み反映は実装済みだが、永続追跡同期はOFFで実発送E2Eは未確認。送り状発行だけで発送済みと判断しない。
