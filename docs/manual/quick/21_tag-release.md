# 簡易版 21 — 発送前にPhysicalTagを解放する

1. `梱包内容一致` の後、同じ `梱包照合` モードで `タグ解放対象を確認` を押す。
2. previewの問い合わせ番号・PhysicalTag shortCodeと現物を照合し、全件が `解放可能` か見る。
3. 正しければ `このN件のPhysicalTag割当を解放する` を押す。
4. `タグ割当を解放しました` を確認する。

![PhysicalTag release](../assets/screenshots/shipment-packing-release.png)

previewまででは解放されない。active割当なし、複数割当、ACTIVEでないタグなどの表示があれば進めず原因を確認する。解放後もPhysicalTag本体は `ACTIVE` で再利用できる。

**通信結果が不明な場合は再送しない。** Repairの割当状態を再確認してから対応する。解放は発送・追跡・Repair.statusを更新しない。
