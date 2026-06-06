# Task 107-24: RepairLineItem二重書き後の既存導線回帰確認

## 1. 概要

RepairLineItem（案件明細）への二重書きが、新規Repair作成API・Repair更新APIの両方に入った後、既存導線への影響を確認した。

確認方針:

```txt
RepairLineItemは裏側に二重書きされるだけ
既存UI・帳票・共有ページ・PublicCaseの表示元はまだEstimateItem
```

このTaskではコード修正、schema変更、DB schema操作、seed変更は行っていない。

## 2. 確認対象Repair

今回の回帰確認用に、ローカルDBへ新規Repairを1件作成した。

```txt
repair.id: 22
inquiryNumber: Y-012
customer: ヨシダ時計修理工房
partnerRef: TASK-107-24-UPD
endUserName: 回帰確認
status: 見積中
```

時計情報:

```txt
brand: ROLEX
model: デイトジャスト
ref: 16233
caliber: 3135
serial: TEST-107-24
```

## 3. 新規Repair作成確認

実行:

```txt
POST /api/repairs
```

payload概要:

| type | name | quantity | price | partsMasterId |
|---|---|---:|---:|---:|
| labor | オーバーホール | 1 | 15000 | null |
| part | ゼンマイ | 1 | 2000 | 1 |

結果:

```txt
HTTP status: 200
success: true
created repair.id: 22
inquiryNumber: Y-012
status: 見積中
```

ステータス:

```txt
受付 + 明細あり -> 見積中
```

の既存自動遷移が動いた。

## 4. Repair更新確認

実行:

```txt
PATCH /api/repairs/22
```

更新内容:

| type | name | quantity | price | partsMasterId |
|---|---|---:|---:|---:|
| labor | オーバーホール | 1 | 16000 | null |
| part | ゼンマイ | 2 | 2000 | 1 |

結果:

```txt
HTTP status: 200
success: true
partnerRef: TASK-107-24-UPD
status: 見積中
```

## 5. EstimateItem保存確認

更新後EstimateItem:

| id | type | itemName | quantity | unitPrice | amount | partsMasterId |
|---:|---|---|---:|---:|---:|---:|
| 47 | labor | オーバーホール | 1 | 16000 | 16000 | null |
| 48 | part | ゼンマイ | 2 | 2000 | 4000 | 1 |

確認結果:

```txt
EstimateItem count: 2
既存EstimateItem保存導線は維持されている
```

## 6. RepairLineItem保存確認

更新後RepairLineItem:

| id | lineType | itemNameSnapshot | estimateDisplayNameSnapshot | b2bDisplayNameSnapshot | b2cDisplayNameSnapshot | quantity | unitPrice | amount | partsMasterId | pricingRuleId | relatedWorkLineItemId | sortOrder |
|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 9 | LABOR | オーバーホール | オーバーホール | オーバーホール | オーバーホール | 1 | 16000 | 16000 | null | null | null | 0 |
| 10 | PART | ゼンマイ | ゼンマイ | ゼンマイ | ゼンマイ | 2 | 2000 | 4000 | 1 | null | null | 1 |

確認結果:

```txt
RepairLineItem count: 2
EstimateItem count と一致
labor -> LABOR
part -> PART
amount = quantity * unitPrice
relatedWorkLineItemId は null
```

価格表示flag:

| lineType | showPriceB2b | showPriceB2c |
|---|---|---|
| LABOR | false | false |
| PART | false | false |

## 7. ステータス自動遷移確認

新規作成時:

```txt
body.status: 受付
estimate.itemsあり
保存後status: 見積中
```

RepairStatusLog:

| status | changedAt |
|---|---|
| 受付 | 2026-06-06T18:36:29.322Z |
| 見積中 | 2026-06-06T18:36:29.322Z |

確認結果:

```txt
受付 -> 見積中 の既存自動遷移は維持されている
RepairStatusLogも作成されている
```

未実行:

```txt
見積書LINE送信成功時 -> 承認待ち
```

理由:

```txt
見積書PDF download / Storage接続問題がTask 107-19 / 107-23で別件として残っているため。
LINE送信はPDF添付ではなく共有URL送信だが、今回の回帰確認では無理に実行しない。
```

## 8. 納品書表示確認

対象:

```txt
DeliveryNote.id: 4
slipNumber: YD-002
```

DB確認:

```txt
repairCount: 2
estimateItemCount: 3
totalAmount: 37000
taxAmount: 3700
```

ブラウザ確認:

```txt
URL: /documents/delivery/4
ログイン後にアクセス
body text:
  納品書: YD-002
  PDFをダウンロード
download link:
  delivery_YD-002.pdf
```

注意:

```txt
PlaywrightでのHTTP response statusは500だった。
ただし、画面本文とPDFダウンロード用blobリンクは生成されていた。
```

このため、納品書については「完全に正常」とは断定せず、以下のように扱う。

```txt
EstimateItem由来の納品書データ取得とPDFリンク生成は確認できた
HTTP 500の原因は別途確認余地あり
RepairLineItem二重書きが直接原因とは判断できない
```

## 9. 既存画面表示確認

ログイン後にPlaywrightで確認した。

Repair一覧:

```txt
URL: /repairs
status: 200
Y-012 / TASK-107-24-UPD が一覧に表示
顧客名、時計情報が表示
```

Repair詳細:

```txt
URL: /repairs/22
status: 200
修理番号: Y-012
受付 / 見積中 のステータス日付表示あり
顧客情報・時計情報タブを含む詳細画面が表示
```

未認証状態:

```txt
/repairs
/repairs/22
/documents/delivery/4
```

はいずれも `/api/auth/signin` へ307 redirectする。これは既存の認証導線。

## 10. 在庫変動の有無

検証開始時点:

```txt
partsMasterId: 1
nameJp: ゼンマイ
stockQuantity: 0
```

新規作成時:

```txt
required: 1
stock: 0
orderRequestId: 10
stockWarningsあり
```

更新後:

```txt
OrderRequest.id: 10
partsMasterId: 1
partNameJp: ゼンマイ
quantity: 2
status: pending
```

部品在庫:

```txt
partsMasterId: 1
stockQuantity: 0
```

確認結果:

```txt
在庫0のため在庫減算は発生しない
不足分のOrderRequestが作成され、更新時にquantity 2へ更新された
```

## 11. 見積書・請求書PDF Storage問題は別Task扱い

見積書・請求書PDF download failed は、Task 107-19 / 107-23でSupabase Storage接続問題として切り分け済み。

今回の回帰確認では失敗扱いにしない。

```txt
見積書・請求書PDF:
  Supabase project URLがDNS解決できない環境問題

納品書:
  Storage download方式ではない
  ただし今回のPlaywright確認ではHTTP 500を観測したため、別途確認余地あり
```

## 12. 確認コマンド結果

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success
```

## 13. 結論

RepairLineItem二重書き後も、主要な既存導線は維持されている。

確認できたこと:

```txt
新規Repair作成APIが成功する
Repair更新APIが成功する
EstimateItemが従来通り保存される
RepairLineItemも裏側に保存される
EstimateItemとRepairLineItemの件数・主要項目が一致する
受付 -> 見積中 の自動遷移が維持される
在庫0の部品ではOrderRequestが作成・更新される
Repair一覧とRepair詳細はログイン後に200で表示される
```

注意点:

```txt
納品書ページは本文とPDFダウンロードリンク生成を確認したが、HTTP status 500が返っている。
見積書・請求書PDFはSupabase Storage接続問題のため別Task扱い。
```

## 14. 次Task案

```txt
Task 107-25:
納品書ページ /documents/delivery/[id] のHTTP 500原因を調査する。
```

または、

```txt
Task 108-0:
RepairLineItemを前提に、作業マスタ接続前の読み取り導線設計へ進む。
```

ただし、既存帳票・共有ページはまだEstimateItem snapshotを読む方針を維持する。

## 15. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
RepairEntryForm
帳票/PDF/LINE
PublicCase生成
見積表示の読み先
RepairLineItemを画面表示元に変更
relatedWorkLineItemId紐づけ
```
