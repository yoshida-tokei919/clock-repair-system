# Task 107-20: Repair更新APIのRepairLineItem二重書き確認

## 1. 概要

Task 107-18で追加したRepair更新APIのRepairLineItem二重書きを、ローカルDB上の既存Repairで確認した。

確認した本線:

```txt
Repair更新API
↓
既存EstimateItem保存
↓
同じpayloadからRepairLineItemへreplace
```

このTaskではコード修正、schema変更、DB schema操作、seed変更は行っていない。

## 2. 確認対象Repair

確認対象:

```txt
repair.id: 19
inquiryNumber: Y-009
status: 作業完了
```

選定理由:

```txt
labor明細が1件ある
part明細が1件ある
part明細にpartsMasterIdがある
更新前RepairLineItemが0件で、二重書き結果を確認しやすい
```

## 3. 更新前のEstimateItem件数

更新前:

```txt
EstimateItem count: 2
RepairLineItem count: 0
```

更新前EstimateItem:

| type | itemName | quantity | unitPrice | partsMasterId |
|---|---|---:|---:|---:|
| labor | オーバーホール | 1 | 15000 | null |
| part | ゼンマイ | 1 | 2000 | 1 |

## 4. 更新前のRepairLineItem件数

更新前:

```txt
RepairLineItem count: 0
```

## 5. Repair更新API実行

`localhost:3000` の既存Repair更新APIへPATCHした。

API:

```txt
PATCH /api/repairs/19
```

payload概要:

```txt
status: 作業完了
request.endUserName: 小川
estimate.items:
  - labor / オーバーホール / 15000 / quantity 1
  - part / ゼンマイ / 2000 / quantity 1 / partsMasterId 1
```

結果:

```txt
HTTP status: 200
response.ok: true
success: true
```

補足:

最初のPATCH時にPowerShell経由の日本語payloadが文字化けし、対象Repairの明細名が一度 `????` になった。

その後、ASCIIのUnicode escapeだけで同じRepair更新APIを再実行し、以下の日本語値へ戻した。

```txt
status: 作業完了
endUserName: 小川
labor itemName: オーバーホール
part itemName: ゼンマイ
```

最終確認は復旧後のDB状態で行った。

## 6. 更新後のEstimateItem件数・内容

更新後:

```txt
EstimateItem count: 2
```

更新後EstimateItem:

| id | type | itemName | quantity | unitPrice | amount | partsMasterId |
|---:|---|---|---:|---:|---:|---:|
| 41 | labor | オーバーホール | 1 | 15000 | 15000 | null |
| 42 | part | ゼンマイ | 1 | 2000 | 2000 | 1 |

既存EstimateItem保存処理は維持され、従来通り delete/create で保存されている。

## 7. 更新後のRepairLineItem件数・内容

更新後:

```txt
RepairLineItem count: 2
```

更新後RepairLineItem:

| id | lineType | itemNameSnapshot | estimateDisplayNameSnapshot | b2bDisplayNameSnapshot | b2cDisplayNameSnapshot | quantity | unitPrice | amount | partsMasterId | pricingRuleId | relatedWorkLineItemId | sortOrder |
|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 3 | LABOR | オーバーホール | オーバーホール | オーバーホール | オーバーホール | 1 | 15000 | 15000 | null | null | null | 0 |
| 4 | PART | ゼンマイ | ゼンマイ | ゼンマイ | ゼンマイ | 1 | 2000 | 2000 | 1 | null | null | 1 |

価格表示flag:

| lineType | showPriceB2b | showPriceB2c |
|---|---|---|
| LABOR | false | false |
| PART | false | false |

## 8. EstimateItemとRepairLineItemの対応確認

対応結果:

| EstimateItem | RepairLineItem | 結果 |
|---|---|---|
| labor | LABOR | OK |
| part | PART | OK |
| itemName | itemNameSnapshot | OK |
| itemName | estimateDisplayNameSnapshot | OK |
| itemName | b2bDisplayNameSnapshot | OK |
| itemName | b2cDisplayNameSnapshot | OK |
| quantity * unitPrice | amount | OK |
| partsMasterId | partsMasterId | OK |

件数:

```txt
EstimateItem count: 2
RepairLineItem count: 2
```

## 9. relatedWorkLineItemIdがnullであることの確認

確認結果:

```txt
relatedWorkLineItemId values:
- null
- null
```

Task 107-18の方針どおり、初期二重書きでは部品行と技術料行の紐づけは行っていない。

## 10. 空明細更新の確認

空明細更新は実行していない。

理由:

```txt
既存UI仕様上、実務データに対して空明細保存を行うのは不自然で、検証対象Repairの明細を壊すリスクがあるため。
```

ただし、実装上は `body.estimate.items.length === 0` の場合に以下が呼ばれる。

```txt
replaceRepairLineItems(id, [], tx)
```

空明細の実動作確認は、専用の検証Repairまたはテストデータで行うのがよい。

## 11. 既存画面・帳票への影響

このTaskでは既存UI、帳票、PublicCase、LINE送信処理を変更していない。

Repair更新APIのレスポンスは `success: true` で返った。

EstimateItemは従来通り保存されているため、既存画面・帳票の読み先をRepairLineItemへ変更していない現段階では、表示導線への直接影響は出ない想定。

## 12. PDF Storage問題は別Task扱い

見積書・請求書PDF download failed は Task 107-19 で切り分け済み。

原因はRepairLineItem二重書きではなく、ローカル環境からSupabase Storage接続先へ到達できない環境問題である。

このTaskではPDF download failedを失敗扱いにしない。

## 13. 確認コマンド

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success
```

## 14. 結論

Repair更新APIを通したRepairLineItem二重書きは成功した。

確認できたこと:

```txt
EstimateItemは従来通り保存される
RepairLineItemも同じpayloadから保存される
EstimateItemとRepairLineItemの件数が一致する
labor -> LABOR に変換される
part -> PART に変換される
itemNameが各snapshot表示名へ保存される
amount = quantity * unitPrice で保存される
partsMasterIdが保存される
relatedWorkLineItemIdはnullで保存される
```

## 15. 次Task案

```txt
Task 107-21:
RepairLineItem二重書きの新規Repair作成APIへの接続可否を設計する。
```

または、

```txt
Task 107-21:
RepairLineItemからEstimateItemを生成する段階移行設計を行う。
```

どちらへ進む場合も、既存帳票・共有ページはまだEstimateItem snapshotを読む方針を維持する。

## 16. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
RepairEntryForm
帳票/PDF/LINE
PublicCase生成
見積表示の読み先
新規Repair作成API
relatedWorkLineItemId紐づけ
```
