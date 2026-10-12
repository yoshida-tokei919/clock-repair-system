# 第26章 発送・追跡・配達完了 — 現行運用と制限

> **2026-10-13現在:** ゆうプリクラウドWorkerによる送り状発行は実運用有効。Task204A〜Eの追跡・通知・納品反映コードもproduction deploy済み。ただし `TRACKING_SYNC_ENABLED=false`、Workerの `-AllowTrackingSync` なしで永続追跡同期はOFF。実発送から配達完了までのE2E確認前であり、完全自動運用中とは扱わない。

## 26.1 発送前から現物引渡しまで

1. Shipmentの対象Repair、返送先snapshot、配達希望を確認する。
2. PhysicalTagで梱包対象を全件照合し、再利用するタグのactive割当を明示操作でreleaseする。
3. `/shipments` の `ゆうプリクラウド発行を依頼` を押す。Workerがサービス時間内にCSV登録、送り状発行、追跡番号のShipment保存、PDF取得、固定プリンタ印刷を行う。結果不明時は再発行せず、Shipment・Worker記録・クラウド側を照合する。代替のゆうプリR V3 CSVは第25章を参照する。
4. 印刷された宛先、配達希望、サービス、追跡番号、荷物を現物で照合し、日本郵便へ引き渡す。

Workerの自動操作時間は **06:00以上23:55未満（日本時間）**。専用Edgeのログインが必要になれば手動復旧する。`ClockRepair-YuPriCloudWorker` は発行許可つきで稼働し、旧 `ClockRepair-YuPriCloudSession` はDisabled。印刷先は `NEC MultiWriter 5750C` 固定で、Brother QL-800はこの工程で使わない。紙の実印刷・荷物の実引渡しは現物で確認する。

Shipment作成、送り状発行・印刷、追跡番号取得のいずれも郵便局の「引受」を意味しない。発行直後に `actualShippedAt` やRepairを発送済みにしない。

## 26.2 実装済みの追跡処理

追跡の入力は、ゆうプリクラウド `発行後` から登録済み出力フィルタで取得する公式6列CSVである。配送状態を画面のHTML表示から推定しない。管理番号 `SHP-{Shipment.id}`、12桁追跡番号、公式配送status code pairをShipmentと照合し、不明・重複・不一致は停止する。

同期を有効化した場合、公式CSVの「引受」以降でShipment状態と `actualShippedAt` を保存する。輸送中、持出中、配達完了、例外状態も段階的に同期する。14桁の日時値は現時点で実CSVによる確証がなく、暫定の厳密な書式に合わなければ保存しない。古い状態へ巻き戻さず、同じCSVの再処理は二重更新しない。

B2Cで引受が確認されたShipmentは、追跡番号付きLINE発送通知をShipmentにつき1回、既存Outboxへ積む。`APPROVED` は送信待ちで、Manager履歴により `CONFIRMED` になって初めて送信確認済みとなる。LINE送信先に不整合があれば通知せず、配送状態の同期結果と分けて調べる。通常の輸送中の変化ごとにLINEを送らない。

顧客共有ページには、紐づく日本郵便の発送個口について `発送準備中 / 発送済み / 輸送中 / 配達中 / 配達完了 / 配送状況を確認中` と、形式が正しい追跡番号を表示できる。表示は保存済みShipment状態に基づくため、同期OFFの間は日本郵便の最新状態と一致するとは限らない。

配達完了が同期されたときは、そのRepairに紐づく未取消OUTBOUND Shipment **すべて** が `DELIVERED` で配達完了日時を持つ場合だけ、`作業完了` のRepairを `納品済み` に進める。複数個口の一部だけでは進めない。

## 26.3 現在の運用制限と確認手順

2026-10-13時点では永続追跡同期がOFFで、実発送のCSV書式、引受→LINE通知→輸送→配達完了→Repair納品済みのE2Eは未確認。Task204A〜Eはコードとproduction deployまで完了しているが、自動実行される前提で案件を閉じない。

発送後の問い合わせには次を順に確認する。

1. 対象Shipmentと送り状の `SHP-` 管理番号・追跡番号・現物が一致するか。
2. 日本郵便側で実際の引受・輸送・配達結果は何か。`10/0A = 引受予定` を実引受と扱わない。
3. アプリのShipment状態、`actualShippedAt`、`deliveredAt` とRepair.statusに何が保存されているか。
4. LINE発送通知が必要な場合、Outboxが `CONFIRMED` まで進んだか。

ゆうプリR発送履歴APIのpreviewは引き続き読取専用であり、preview自体はShipmentもRepairも更新しない。外部の配送事実とアプリの保存状態が異なるときは、推測でstatusを進めず管理者が照合する。正本の考え方は[第35章](35_status-source-of-truth.md)、二重処理防止は[第36章](36_duplicate-safety.md)、障害対応は[第37章](37_troubleshooting.md)を参照する。
