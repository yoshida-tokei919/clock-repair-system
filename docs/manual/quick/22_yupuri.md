# 簡易版 22 — ゆうプリクラウドとゆうプリRの使い方

## 通常の送り状発行

1. `/shipments` で対象のDRAFT Shipment、宛先、対象Repair、配達希望を確認する。
2. 管理画面の `ゆうプリクラウド発行を依頼` を明示操作する。READYになると配達希望の通常変更はロックされる。
3. WindowsのゆうプリクラウドWorkerが、サービス時間内にCSV登録、発行、追跡番号取得、PDF取得、`NEC MultiWriter 5750C` への印刷を進める。発行結果と紙の送り状を照合する。結果不明やエラーのときは再依頼せず、Shipment、Worker記録、クラウド側を確認する。
4. 現物を日本郵便へ引き渡す。送り状発行・印刷だけでは実発送ではない。

Workerの自動操作は **06:00以上23:55未満（日本時間）**。専用ログインが必要になった場合は手動復旧する。旧Sessionタスクは使わない。

## ゆうプリR V3出力（代替経路）

管理者認証がある環境で、対象発送IDの `GET /api/shipments/[id]/yupuri-v3` からゆうプリR標準フォーマットV3 CSVを取得できる。`/shipments` に共通の出力ボタンは **まだない**。API操作環境がない場合は管理責任者に取得方法を確認する。

出力対象は **OUTBOUND・未発送（`actualShippedAt = null`）で、statusが `DRAFT / READY / LABEL_ISSUED / AWAITING_ACCEPTANCE` のいずれか**。出力は100列、CP932 / Shift_JIS、BOMなし、CRLF。お客様側管理番号は `SHP-{id}`。宛先と配達希望を確認してからゆうプリRへ取り込む。荷物サイズコードは現時点で `060` 固定なので、60サイズ以外の荷物にはそのまま使わない。CSV出力だけでは発送状態は変わらない。

## 発送履歴の確認

管理者用の発送履歴CSVプレビューAPIは **読取専用**。Task202Bで公式配送status code pairの説明を表示するようになった。`10/0A = 引受予定`は実引受ではない。`importableLater`は将来取込候補で、状態更新承認ではない。14バイトの日付値はrawのままで、追跡番号や発送日、配達完了日、Shipment / Repair statusを書き戻さない。

## 追跡・納品の現在の制限

ゆうプリクラウドの発行後CSVから、引受以降のShipment状態同期、追跡番号付きLINE発送通知、共有ページの配送状態表示、全個口の配達完了後のRepair納品済み反映は **コードとproduction deployまで完了**。ただし2026-10-13時点で永続追跡同期はOFF（`TRACKING_SYNC_ENABLED=false`、Workerの `-AllowTrackingSync` なし）で、実発送E2E確認前。現在の発送後状況は日本郵便側の実績とアプリ保存値を別々に確認する。

発送後の現行確認手順と運用制限は、詳細版の[第26章「発送・追跡・配達完了 — 現行運用と制限」](../full/26_shipping-tracking-delivery.md)を参照する。
