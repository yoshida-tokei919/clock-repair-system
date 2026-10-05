# 第21章 顧客の配達希望日時回答

## 21.1 対象と回答の流れ

B2Cの作業完了LINE連絡で案内する配達希望回答ページは `/customer/delivery/[token]`。Repair単位のURLを使う。Repair.statusを `作業完了` にしただけでは案内は送信されず、管理者が最終文面を確認して送信待ちへ追加する操作が必要である。URLは受付番号やLINE識別子を含まないが、開ける人が回答できるため外部へ転載しない。

顧客は次のいずれかを選び、`回答内容を確認` → `この内容で回答する` の順で送信する。希望がない場合も `希望なし` の回答が必要である。

| 回答モード | 画面表示 | 保存する内容 |
| --- | --- | --- |
| `NONE` | 希望なし | 日付なし、時間帯は「指定なし」 |
| `DATE` | 日付を指定 | 希望日、時間帯は「指定なし」 |
| `TIME` | 時間帯を指定 | 日付なし、選択した時間帯 |
| `DATE_TIME` | 日付と時間帯を指定 | 希望日と時間帯 |

日付は日本時間で過去日を選べない。時間帯は画面の選択肢から選ぶ。回答ページはB2Cかつ作業完了連絡の有効な送信待ち記録があるRepairに限る。ページを開くだけでは回答用tokenを発行しない。

![Customer delivery preference](../assets/screenshots/delivery-preference-customer.png)

## 21.2 管理画面で確認する

Repair詳細の `配達希望日時の記録` で `発送候補を更新` を押し、お客様の回答日時・希望日・時間帯・Shipmentへの反映状態を見る。回答は `RepairDeliveryPreference` に保存されるため、Shipment作成前でも残る。

表示される主な状態は `未回答`、`Shipmentへ反映済み`、`Shipment作成待ち`、`複数Shipmentのため要確認`、`複数Repair同梱のため要確認`、`Shipmentとの内容差異あり`、`発送準備進行済み`。反映済み以外の回答は、対象Shipmentと回答内容を人が照合する。

必要な場合は同じパネルで対象のDRAFT Shipmentを選び、配達希望日・時間帯を手動で保存できる。複数の候補があるときはShipment IDと同梱Repairを確認して選ぶ。DRAFT以外は表示のみ。`/shipments` の計画編集にも配達希望欄があるが、顧客回答の反映状態はRepair詳細で確認する。

![Admin delivery preference](../assets/screenshots/delivery-preference-admin.png)

## 21.3 自動反映の厳密な条件

顧客が回答した時点で、対象Repairに紐づく **未取消のOUTBOUND・未発送Shipmentがちょうど1件** あり、そのShipmentが **DRAFT** で、Shipment内のRepairが **その1件だけ** の場合に限り、回答を同一処理でShipmentへ反映する。Shipmentが0件、複数件、複数Repair同梱の場合はRepairの回答だけ保存し、対象個口を自動選択しない。

回答後に単一RepairのShipmentを作る場合も、そのRepairに他の未取消OUTBOUND・未発送Shipmentがない場合だけ保存済み回答を引き継ぐ。既存の対象個口がある場合や複数Repairを同梱する場合は自動反映しない。保存済みの希望日が作成時点で過去日なら引き継がないため、人が確認する。

対象RepairのactiveなOUTBOUND ShipmentがDRAFTを離れると、顧客ページからの回答変更はロックされる。画面はLINEでの連絡を案内する。ロック後の変更を受けた担当者は、現行のDRAFT編集機能で変更できると決めつけず、発送状況を確認して個別対応する。

## 21.4 運用上の区切り

回答の保存やShipmentへの反映は、送り状発行・発送・追跡番号保存・配達完了を意味しない。配達希望回答と、送り状発行・発送・追跡・配達完了は別工程として確認する。
