# 簡易版 5 — PhysicalTag発行と修理袋ラベル

## 目的

現物受付した時計へ管理タグを割り当て、Brother QL-800で修理袋ラベルを印刷する。

## 1. 現物受付を確認

Repairが `送付待ち` のままなら、時計現物を受領したことを確認して `受付` へ進める。

## 2. PhysicalTagを確認・発行

Repair詳細の「PhysicalTag / 管理タグ」を確認する。

- NFC UIDを使う場合はreaderで読み取った値を入力する。
- NFC UIDなしでもQR + shortCodeで発行できる。
- 発行後は `PT-000123` のようなshortCodeが表示される。

![PhysicalTag panel](../assets/screenshots/physical-tag-panel.png)

## 3. ラベルを印刷

1. Brother QL-800のonline状態とDK-2205の62 mm連続紙を確認する。
2. Repair詳細の「ラベル印刷」を押し、QL-800へ62 × 75 mmを1枚直接印刷する。
3. 印刷先はQL-800に固定される。b-PAC Extensionや用紙・テンプレート等の確認に失敗した場合は、表示されたエラーを確認する。
4. 75 mmでオートカットされたことを確認する。
5. 受付番号・時計情報・shortCodeを目視確認する。

QRには顧客情報やRepair IDは直接入っていない。

PDFを確認・予備印刷する場合は「プレビュー」から開き、62 × 75 mmを等倍で印刷する。再印刷でも新しいPhysicalTagは発行しない。

## 4. 修理袋へ付ける

印刷物は剥離紙から剥がさず、台紙付きのまま修理袋用カードとして使用してよい。

時計本体へ直接タグやラベルを貼らない。

## 5. 次へ

PhysicalTagとラベルの確認後、時計を指定ゾーンへ置き、StorageLocationを登録する。
