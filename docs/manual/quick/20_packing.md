# 簡易版 20 — 梱包対象を照合する

1. ScanSessionで `梱包照合` を選ぶ。
2. **発送ID** を入力し、`発送を読込` を押す。顧客とRepair一覧を確認する。
3. 箱に入れる時計のPhysicalTagを全件読む。
4. `照合済み X / Y件` が全件、`不一致スキャン 0件` であることを確認する。
5. `発送を再確認して梱包一致を確定` を押し、`梱包内容一致` を確認する。

![Shipment packing](../assets/screenshots/shipment-packing-release.png)

Shipment外の時計、重複、未登録・廃止・未割当タグを見つけたら現物を調べる。不一致があればクリアして最初からやり直す。最終確認ではShipmentを再取得し、内容や状態が変わっていたら確定しない。

**現在の限界:** scanと梱包一致はShipmentやRepairを更新せず、発送済みにもしない。PhysicalTagの割当解放は次の別操作。
