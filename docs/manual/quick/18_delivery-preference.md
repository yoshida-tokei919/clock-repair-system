# 簡易版 18 — 配達希望回答を確認する

## 操作

1. 作業完了LINE連絡の最終文面に配達希望回答URLが入っていることを確認し、送信待ちへ追加する。Repairを `作業完了` にしただけでは案内は送られない。
2. お客様には、希望がなくても回答ページで `希望なし` を選んで回答していただく。選択肢は **希望なし / 日付 / 時間帯 / 日付+時間帯**。
3. Repair詳細の `配達希望日時の記録` で `発送候補を更新` を押し、回答日時・内容・Shipmentへの反映状態を確認する。
4. `Shipment作成待ち`、`複数Shipmentのため要確認`、`複数Repair同梱のため要確認`、`内容差異あり` は自動反映済みとみなさず、対象個口を確認する。

![Delivery preference](../assets/screenshots/delivery-preference-admin.png)

回答はShipmentがまだなくてもRepair側に残る。自動反映されるのは、未取消OUTBOUND・未発送のDRAFT Shipmentがちょうど1件で、そのShipmentに当該Repairだけが入る場合。後から単一Repair Shipmentを作るときも、他に対象Shipmentがない場合だけ引き継ぐ。

必要なら対象のDRAFT Shipmentを明示して手動保存する。ShipmentがDRAFTを離れると顧客の再回答はロックされ、LINEでの連絡が必要になる。

**現在の限界:** 回答だけでは送り状発行・発送・追跡・配達完了は進まない。Shipmentへ反映済みかを必ず確認する。
