# 第24章 発送前PhysicalTag割当の解放

## 24.1 梱包照合との関係

第23章で `梱包内容一致` になった後、同じ `梱包照合` モード内でPhysicalTagの割当解放へ進む。解放は独立した操作であり、scan・梱包確認・解放対象previewの段階ではDBを変更しない。

解放すると、RepairとPhysicalTagの **activeな割当** に解放日時・担当者・理由を記録する。PhysicalTag本体は `ACTIVE` のまま残り、後で別のRepairへ再利用できる。Shipment status、Repair.status、保管場所、追跡番号は変わらない。

## 24.2 操作

1. `梱包内容一致` の状態で `タグ解放対象を確認` を押す。
2. previewの問い合わせ番号、案件ID、PhysicalTag shortCode、各行の `解放可能` を時計現物と照合する。
3. blocker、active割当なし、複数割当、ACTIVEでないタグがあれば解放を進めず、原因を確認する。
4. 対象全件が正しければ `このN件のPhysicalTag割当を解放する` を押す。
5. `タグ割当を解放しました` の結果を確認し、解放済みタグを再利用する運用へ回す。

![PhysicalTag release preview](../assets/screenshots/shipment-packing-release.png)

サーバーはPOST時にもShipmentの状態とRepair集合、active割当、タグのACTIVE状態を再検証する。1件でも条件が変われば全件を解放せずエラーにする。

## 24.3 通信結果が不明な場合

通信断、サーバーエラー、成功応答の内容不明などでは、解放が行われたか確定できない。同じsessionから解放POSTを盲目的に再送しない。対象RepairのPhysicalTag割当とShipmentを再取得・確認し、実際の状態を特定してから対応する。解放成功は発送完了を意味しない。
