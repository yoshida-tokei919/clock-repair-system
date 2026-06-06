# Task 107-22: Repair新規作成APIのRepairLineItem二重書き確認

## 1. 概要

Task 107-21で追加したRepair新規作成APIのRepairLineItem二重書きを、ローカルDB上で実際に新規Repairを作成して確認した。

確認した本線:

```txt
Repair新規作成API
↓
既存Estimate / EstimateItem作成
↓
同じpayloadからRepairLineItemへreplace
```

このTaskではコード修正、schema変更、DB schema操作、seed変更は行っていない。

## 2. 新規作成したRepair

作成API:

```txt
POST /api/repairs
```

作成結果:

```txt
HTTP status: 200
response.ok: true
success: true
```

新規Repair:

```txt
repair.id: 21
inquiryNumber: Y-011
status: 見積中
customer: ヨシダ時計修理工房
partnerRef: TASK-107-22
endUserName: 新規検証
```

時計情報:

```txt
brand: ROLEX
model: デイトジャスト
ref: 16233
caliber: 3135
serial: TEST-107-22
```

作成payloadの明細:

| type | name | quantity | price | partsMasterId |
|---|---|---:|---:|---:|
| labor | オーバーホール | 1 | 15000 | null |
| part | ゼンマイ | 1 | 2000 | 1 |

補足:

```txt
partsMasterId: 1 のゼンマイを使ったため、既存の通常処理によりローカルDB上の在庫数は 1 -> 0 になった。
stockWarnings: []
orderRequestCount: 0
```

## 3. 作成後のEstimateItem件数・内容

作成後:

```txt
estimate.id: 26
EstimateItem count: 2
```

EstimateItem:

| id | type | itemName | quantity | unitPrice | amount | partsMasterId |
|---:|---|---|---:|---:|---:|---:|
| 43 | labor | オーバーホール | 1 | 15000 | 15000 | null |
| 44 | part | ゼンマイ | 1 | 2000 | 2000 | 1 |

既存EstimateItem保存導線は維持されている。

## 4. 作成後のRepairLineItem件数・内容

作成後:

```txt
RepairLineItem count: 2
```

RepairLineItem:

| id | lineType | itemNameSnapshot | estimateDisplayNameSnapshot | b2bDisplayNameSnapshot | b2cDisplayNameSnapshot | quantity | unitPrice | amount | partsMasterId | pricingRuleId | relatedWorkLineItemId | sortOrder |
|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 5 | LABOR | オーバーホール | オーバーホール | オーバーホール | オーバーホール | 1 | 15000 | 15000 | null | null | null | 0 |
| 6 | PART | ゼンマイ | ゼンマイ | ゼンマイ | ゼンマイ | 1 | 2000 | 2000 | 1 | null | null | 1 |

価格表示flag:

| lineType | showPriceB2b | showPriceB2c |
|---|---|---|
| LABOR | false | false |
| PART | false | false |

## 5. EstimateItemとRepairLineItemの対応確認

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

## 6. relatedWorkLineItemIdがnullであることの確認

確認結果:

```txt
relatedWorkLineItemId values:
- null
- null
```

Task 107-21の方針どおり、初期二重書きでは部品行と技術料行の紐づけは行っていない。

## 7. 既存画面・帳票への影響

このTaskでは既存UI、帳票、PublicCase、LINE送信処理を変更していない。

Repair新規作成APIのレスポンスは `success: true` で返った。

EstimateItemは従来通り作成されているため、既存画面・帳票の読み先をRepairLineItemへ変更していない現段階では、表示導線への直接影響は出ない想定。

## 8. PDF Storage問題は別Task扱い

見積書・請求書PDF download failed は Task 107-19 で切り分け済み。

原因はRepairLineItem二重書きではなく、ローカル環境からSupabase Storage接続先へ到達できない環境問題である。

このTaskではPDF download failedを失敗扱いにしない。

## 9. 確認コマンド

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success
```

## 10. 結論

Repair新規作成APIを通したRepairLineItem二重書きは成功した。

確認できたこと:

```txt
EstimateItemは従来通り作成される
RepairLineItemも同じpayloadから保存される
EstimateItemとRepairLineItemの件数が一致する
labor -> LABOR に変換される
part -> PART に変換される
itemNameが各snapshot表示名へ保存される
amount = quantity * unitPrice で保存される
partsMasterIdが保存される
relatedWorkLineItemIdはnullで保存される
```

## 11. 次Task案

```txt
Task 107-23:
RepairLineItem二重書き後の読み取り導線を設計する。
```

候補:

```txt
Repair詳細画面でRepairLineItemを確認できる管理用表示を追加するか検討する
RepairLineItemからEstimateItemを生成する段階移行設計を行う
PublicCase下書き生成元をRepairLineItemにする設計へ進む
relatedWorkLineItemIdの紐づけ方式を設計する
```

既存帳票・共有ページは、まだEstimateItem snapshotを読む方針を維持する。

## 12. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
RepairEntryForm
帳票/PDF/LINE
PublicCase生成
見積表示の読み先
relatedWorkLineItemId紐づけ
```
