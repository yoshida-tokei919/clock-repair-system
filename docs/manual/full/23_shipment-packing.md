# 第23章 PhysicalTag連続scanによる梱包照合

## 23.1 目的と前提

ScanSessionの `梱包照合`（`SHIPMENT_PACKING`）は、既存Shipmentに入れる予定のRepair全件と、手元の時計現物に付いたPhysicalTagを照合する。Shipmentを新規作成するモードではない。対象はOUTBOUND・未発送・未取消のShipmentで、**発送IDの入力が必須**。

梱包照合の前に、時計現物、発送ID、顧客、同梱Repair、納品書等の発送準備を人が確認する。画面のランニングテスト完了は判定不可である。

## 23.2 操作

1. 画面上部のScanSessionで `梱包照合` を選ぶ。
2. `発送ID` を入力し、`発送を読込` を押す。表示された顧客とRepair件数・問い合わせ番号が対象個口と一致することを確認する。
3. 実際に同梱する時計のPhysicalTagを1件ずつ読む。画面の `照合済み X / Y件`、各Repairの `読取済み / 未読取`、`不一致スキャン` を見る。
4. **期待Repair全件が読取済み、かつ不一致が0件** になった場合だけ、`発送を再確認して梱包一致を確定` を押す。
5. `梱包内容一致` の表示を確認する。

![Shipment packing and release preview](../assets/screenshots/shipment-packing-release.png)

同じRepairの再scanは重複として扱われる。Shipment外のRepairは不一致に表示される。未登録・廃止・未割当など解決できないタグはエラーとなる。不一致が出たら現物とShipmentを調べ、画面をクリアして最初から照合する。

## 23.3 最終確認で再取得する内容

最終確認時はShipmentを再取得し、Repair集合、顧客、方向、status、実発送日時が読込時から変わっていないか確認する。途中で変わった場合は照合を確定せず、発送IDを読み直して最初から行う。読取直後の表示だけで完了とはしない。

scan、全件一致、最終確認はいずれもShipment、Repair、PhysicalTag、StorageLocationを更新しない。梱包一致後のPhysicalTag割当解放は第24章の別操作である。梱包一致も、送り状発行・発送済み登録・追跡番号登録を意味しない。
