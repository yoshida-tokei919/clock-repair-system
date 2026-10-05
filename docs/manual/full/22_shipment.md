# 第22章 Shipment作成と発送予定一覧

## 22.1 Shipmentの単位

Shipmentは発送する **1個口** の記録で、Repairとは別に管理する。1個口に複数Repairを入れられ、1Repairが複数Shipmentに関係することもある。宛先はRepairに保存済みの返送先snapshotから作成時に確定し、顧客マスタの現住所で補わない。複数Repairをまとめるときは同一顧客かつ返送先が一致している必要がある。B2C/B2Bとも同じ検証を通す。

Shipment作成や計画編集だけでRepair.status、StorageLocation、PhysicalTag、納品書は変わらない。

## 22.2 発送対象を選び、作成する

1. 対象の時計現物、Repairの問い合わせ番号、返送先を確認する。
2. 画面上部のScanSessionで `発送対象`（`SHIPMENT_SELECT`）を選ぶ。
3. PhysicalTagを連続scanし、選択中のRepair一覧を確認する。別顧客の混入や読取エラーがあれば進めない。最大100件。
4. 1個口にするRepairが揃ったら `このN件で発送を作成` を押す。
5. 作成されたShipment IDを控え、`/shipments` で内容を確認する。

**scanだけではShipmentは作成されない。** 明示ボタン後もサーバーがRepair、顧客、返送先snapshotを再取得して検証し、条件が合わなければ作成しない。通信が切れて作成結果が不明な場合、同じ選択を盲目的に再送しない。発送予定を確認し、重複作成の有無を調べる。

![Shipment selection](../assets/screenshots/shipment-select.png)

## 22.3 `/shipments` で計画を確認する

`/shipments` は **OUTBOUND・未発送（`actualShippedAt` なし）・未取消** のShipment予定一覧。発送済み履歴の一覧ではない。発送予定日を日本時間で遅延、今日、明日、今週、来週、それ以降、未設定へ分ける。

各ShipmentでID、顧客、status、Repair問い合わせ番号と現在status、作業完了件数、納品書の発行状況、activeな保管場所とPhysicalTag shortCode、配達希望、送り状発行日時、配送会社・サービス・引渡方法を確認できる。同一顧客の他の未発送個口も参考表示されるが、統合可否を自動判定しない。ランニングテスト完了を示す正本イベントは未実装のため「判定不可」と表示される。

![Shipment schedule](../assets/screenshots/shipments-schedule.png)

## 22.4 DRAFTの計画編集

`計画を編集` はDRAFTだけで使える。保存できるのは次の6項目である。

| 項目 | 用途 |
| --- | --- |
| 発送予定日 `plannedShipDate` | 予定一覧の日付区分 |
| 配送会社コード `carrierCode` | 配送方法の計画 |
| サービスコード `serviceCode` | サービスの計画 |
| 引渡方法 `handoffMethod` | 集荷・窓口持込・その他 |
| 配達希望日 `requestedDeliveryDate` | 希望日の記録 |
| 配達希望時間帯 `requestedDeliveryTimeSlot` | 希望時間帯の記録 |

保存後は一覧を更新する。状態がDRAFT以外に変わった場合は更新できず、再読込して確認する。計画画面からShipment status、追跡番号、送り状発行日時、実発送日時、配達完了日時は書き換えられない。顧客のセルフ回答がある場合は第21章の反映状態も確認する。

## 22.5 現在の限界

Shipmentの作成・計画は実発送処理ではない。発送・追跡・配達完了の自動連携は完了していない。`/shipments` に表示されるstatus名だけを根拠に、配送会社が引き受けたと判断しない。
