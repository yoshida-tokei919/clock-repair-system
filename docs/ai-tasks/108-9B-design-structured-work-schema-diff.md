# Task 108-9B: 構造化内装作業入力の schema差分設計

## 1. 目的

Task 108-9A の調査結果を踏まえ、通常Repairの内装作業入力を以下の構造で保存できるようにするためのschema差分を設計する。

```txt
カテゴリ + 対象部品 + 処置 + 詳細 + 価格
```

このTaskでは実装しない。`prisma/schema.prisma`、migration、seed、DB、API、UI、保存処理、PricingRule実装、RepairLineItem実装、EstimateItem実装、PublicCase実装は変更しない。

## 2. 前提

`RepairWorkName` の初期seedは作らない。

```txt
RepairWorkName
-> schemaは存在する
-> 初期seedは作らない
-> 部品名 x 処置 の全組み合わせも作らない
-> 将来の作業名テンプレート候補、レビュー済み候補、表示名テンプレート候補として扱う
```

入力の基本は以下とする。

```txt
RepairWorkCategory
+ PartNameMaster
+ RepairWorkAction
+ detail
+ price
-> RepairLineItem snapshot
```

`detail` は自由な作業名ではなく、対象部品より細かい作業箇所・要素の補足である。

帳票・共有ページ・PublicCaseには、マスタ現在値を直接表示しない。RepairLineItem / EstimateItem / PublicCaseに保存されたsnapshotを表示の正とする。

このTask、および次の実装Taskでは、明示された対象以外を変更しない。特に以下は、対象Taskで明示されていない限り変更禁止とする。

```txt
既存帳票表示
PDF表示
LINE送信内容
共有ページ表示
PublicCase表示
既存UI
既存API
既存保存処理
既存EstimateItem表示仕様
既存PricingRule.suggestedWorkName互換動作
```

構造化入力のschema差分は、既存表示・既存帳票・既存共有ページを壊さない形で段階導入する。

## 3. 現行schema整理

### RepairLineItem

`RepairLineItem` は通常Repairの案件明細本体。現行ではEstimateItem保存後に同じpayloadから二重書きされている。

現行schemaに実在する主な項目:

```txt
lineType
partsMasterId
pricingRuleId
relatedWorkLineItemId
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
gradeNameSnapshot
notesForCustomerSnapshot
quantity
unitPrice
amount
showPriceB2b
showPriceB2c
sortOrder
internalMemo
customerMemo
publicMemo
```

現行schemaに未存在:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
repairWorkNameId
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

### PricingRule

`PricingRule` は価格ルール。作業マスタ本体ではない。

現行schema:

```txt
brandId
modelId
caliberId
customerType
minPrice
maxPrice
suggestedWorkName
notes
```

`customerType` はschema上存在するが、現行 `getPricingRules(brandId, modelId, caliberId)` の候補取得条件には使われていない。現行の候補取得は `brandId` を必須にし、`modelId` / `caliberId` は一致またはnullを許す形で絞り込み、優先度順にsortしている。

Repair保存時のPricingRule自動作成・更新は、labor明細の `item.name` を `suggestedWorkName` として扱い、`brandId / modelId / caliberId` と価格を保存する。構造化されたカテゴリ・対象部品・処置・詳細はまだ保存していない。

現行schemaに未存在:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
repairWorkNameId
movementCaliberId
baseMovementCaliberId
defaultPrice
```

### EstimateItem

`EstimateItem` は見積明細スナップショット。現行では見積書・納品書・共有ページ・請求集計の中心にもなっている。

現行schema:

```txt
estimateId
itemName
quantity
unitPrice
type
orderStatus
orderedAt
partsMasterId
createdAt
```

現行では `repairLineItemId` や構造化ID、B2B/B2C表示名snapshotは持っていない。

### RepairWorkName

`RepairWorkName` は作業名テンプレート候補。現行schemaには以下がある。

```txt
repairType
categoryId
targetPartNameId
actionId
detailLabel
standardName
b2bDisplayName
b2cDisplayName
source
reviewStatus
```

ただし、今回のschema差分設計では `RepairWorkName` を必須にしない。初期seedも作らない。

## 4. 追加候補フィールド表

### RepairLineItem

| model | field | type | nullable | relation | purpose | reason | priority | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RepairLineItem | repairWorkCategoryId | Int | yes | RepairWorkCategory.id | 作業カテゴリを案件明細へ保存する | カテゴリ検索・分類・PublicCase下書き生成の基礎になる | HIGH | relation名は実装時に既存relationと衝突しないよう調整 |
| RepairLineItem | repairWorkActionId | Int | yes | RepairWorkAction.id | 処置を案件明細へ保存する | 12処置で表記ゆれを抑え、集計・検索に使う | HIGH | actionLabel文字列ではなくID参照にする |
| RepairLineItem | targetPartNameId | String | yes | PartNameMaster.id | 対象部品を案件明細へ保存する | PartsMasterではなく標準部品名までを参照し、作業入力と部品在庫を分ける | HIGH | 部品選択が不要な作業もあるためnullable |
| RepairLineItem | detailLabelSnapshot | String | yes | none | 詳細ラベルをsnapshot保存する | detailは当面マスタ化せず、その時点の入力値を固定する | HIGH | 自由な作業名ではなく、対象部品より細かい箇所・要素 |
| RepairLineItem | categoryNameSnapshot | String | yes | none | カテゴリ名をsnapshot保存する | マスタ名変更後も過去明細の表示・検索補助を固定する | HIGH | 表示用コピー。ID参照とは別に持つ |
| RepairLineItem | targetPartNameSnapshot | String | yes | none | 対象部品名をsnapshot保存する | PartNameMaster表示名変更後も過去明細を固定する | HIGH | `PartNameMaster.nameJa` などから生成 |
| RepairLineItem | actionNameSnapshot | String | yes | none | 処置名をsnapshot保存する | RepairWorkAction表示名変更後も過去明細を固定する | HIGH | 例: 交換、修理、かしめ |
| RepairLineItem | repairWorkNameId | Int | yes | RepairWorkName.id | 作業名テンプレート候補を任意参照する | よく使う組み合わせやレビュー済み候補に紐づけられる | DEFER | 今回は必須にしない。大量seedもしない |
| RepairLineItem | workDisplayNameSnapshot | String | yes | none | 構造化入力から生成した社内標準作業名を固定する | `itemNameSnapshot` と表示用途を分けられる | MEDIUM | 既存 `itemNameSnapshot` で足りるか実装前に再確認 |

### PricingRule

| model | field | type | nullable | relation | purpose | reason | priority | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PricingRule | repairWorkCategoryId | Int | yes | RepairWorkCategory.id | 価格候補を作業カテゴリで絞る | `suggestedWorkName` 文字列依存を減らす | HIGH | 既存rule互換のためnullable |
| PricingRule | repairWorkActionId | Int | yes | RepairWorkAction.id | 価格候補を処置で絞る | 交換・修理・調整などの価格差を扱える | HIGH | 12処置を使う |
| PricingRule | targetPartNameId | String | yes | PartNameMaster.id | 価格候補を対象部品で絞る | ゼンマイ交換、ローター真かしめ等の価格候補に使える | HIGH | 部品なし作業のためnullable |
| PricingRule | detailLabel | String | yes | none | 詳細条件を価格ルールに持つ | 一番受けブッシュ修理などを区別できる | MEDIUM | 表記ゆれが出るため、正規化ルールが必要 |
| PricingRule | repairWorkNameId | Int | yes | RepairWorkName.id | テンプレート候補と価格を紐づける | よく使う作業名テンプレートができた後に有効 | DEFER | RepairWorkName seedなしのため今回は後回し推奨 |
| PricingRule | movementCaliberId | Int | yes | Caliber.id | 搭載ムーブメントCal条件で価格候補を絞る | 内装作業では外装モデルCalより実ムーブメント条件が重要になる場合がある | MEDIUM | 現行PricingRuleには未存在 |
| PricingRule | baseMovementCaliberId | Int | yes | Caliber.id | ベースムーブメントCal条件で価格候補を絞る | 互換ムーブメントや派生Calで価格候補を出しやすい | LOW | 初期実装では後回しでもよい |
| PricingRule | defaultPrice | Int | yes | none | 標準価格を明示する | min/maxが同額運用の場合の意味を分けられる | LOW | 既存 `minPrice/maxPrice` で当面代替可能 |
| PricingRule | customerType | String | yes | none | B2B/B2C別価格候補 | schema上既に存在するが現行取得条件には未使用 | HIGH | 新規追加ではなく取得条件への反映が必要 |

### EstimateItem

| model | field | type | nullable | relation | purpose | reason | priority | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EstimateItem | repairLineItemId | Int | yes | RepairLineItem.id | 見積明細の元案件明細を追跡する | RepairLineItemからEstimateItemを生成する段階で有用 | MEDIUM | 既存EstimateItemを壊さないためnullable |
| EstimateItem | estimateDisplayNameSnapshot | String | yes | none | 帳票表示名を明示的に保存する | 既存 `itemName` と役割を分けられる | LOW | 当面は `itemName` を帳票表示名として維持可能 |
| EstimateItem | b2bDisplayNameSnapshot | String | yes | none | B2B共有表示名を見積時点で固定する | 共有ページがEstimateItemを読む期間の安定化 | LOW | RepairLineItem側snapshotを正にするなら不要 |
| EstimateItem | b2cDisplayNameSnapshot | String | yes | none | B2C共有表示名を見積時点で固定する | B2C向け粗い表示名を固定できる | LOW | RepairLineItem側snapshotを正にするなら不要 |
| EstimateItem | repairWorkCategoryId | Int | yes | RepairWorkCategory.id | 見積明細へカテゴリIDを複製する | 見積単体で分析する場合に使える | DEFER | 構造化IDはRepairLineItem側を正にする方がよい |
| EstimateItem | repairWorkActionId | Int | yes | RepairWorkAction.id | 見積明細へ処置IDを複製する | 見積単体で分析する場合に使える | DEFER | 二重管理になりやすい |
| EstimateItem | targetPartNameId | String | yes | PartNameMaster.id | 見積明細へ対象部品IDを複製する | 見積単体で分析する場合に使える | DEFER | 二重管理になりやすい |
| EstimateItem | detailLabelSnapshot | String | yes | none | 見積明細へ詳細を複製する | 帳票で詳細表示が必要な場合に使える | DEFER | 基本はRepairLineItem snapshotから生成時にitemNameへ反映 |

## 5. 推奨するschema差分

次の実装Taskで優先するのは、RepairLineItemを構造化入力の受け皿にする差分である。

### HIGH: RepairLineItemへ追加推奨

```txt
repairWorkCategoryId Int?
repairWorkActionId Int?
targetPartNameId String?
detailLabelSnapshot String?
categoryNameSnapshot String?
targetPartNameSnapshot String?
actionNameSnapshot String?
```

理由:

```txt
RepairLineItemが通常Repairの正式な案件明細本体である
帳票・共有ページ・PublicCaseへ渡す前の正データになる
マスタ変更後も過去明細を固定できる
RepairWorkName seedなしでも構造化入力を保存できる
```

### HIGH: PricingRuleへ追加推奨

```txt
repairWorkCategoryId Int?
repairWorkActionId Int?
targetPartNameId String?
detailLabel String?
```

さらに、既存 `customerType` を候補取得条件として使う設計を次工程で検討する。

理由:

```txt
価格候補を suggestedWorkName 文字列だけに依存しない
カテゴリ・対象部品・処置・詳細から候補価格を出せる
既存PricingRuleは価格ルールとして残せる
```

### MEDIUM: PricingRuleへ追加検討

```txt
movementCaliberId Int?
baseMovementCaliberId Int?
```

内装作業では搭載ムーブメント条件が重要になるが、初期schema差分では `brandId / modelId / caliberId` との関係整理が必要。次の実装で同時に入れるかは慎重に判断する。

### MEDIUM: EstimateItemへ追加検討

```txt
repairLineItemId Int?
```

EstimateItemは見積発行時点のスナップショットであり、構造化IDをすべて複製する必要は低い。まずは `RepairLineItem` 側に構造化情報と表示名snapshotを保存し、EstimateItemには帳票表示に必要な `itemName / unitPrice / quantity` を維持する案が安全。

将来 `RepairLineItem -> EstimateItem` 生成へ完全移行する段階で、元明細追跡用に `repairLineItemId` を追加する価値がある。

### DEFER: 今回は追加しない推奨

```txt
RepairLineItem.repairWorkNameId
PricingRule.repairWorkNameId
EstimateItemの構造化ID一式
```

理由:

```txt
RepairWorkName seedを作らないため必須参照にできない
部品名 x 処置の全組み合わせを避ける方針と衝突しやすい
初期はカテゴリ・対象部品・処置・detailから直接snapshot生成する方が軽い
```

## 6. snapshot保存方針

### RepairLineItemに持たせる

```txt
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
detailLabelSnapshot
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
```

RepairLineItemは通常Repairの案件明細本体なので、入力時点の構造化値と表示名をここに固定する。

### EstimateItemに持たせる

当面は既存の `itemName / unitPrice / quantity / type / partsMasterId` を維持する。

見積書・納品書・請求書で必要なのは基本的に確定表示名と価格であるため、構造化IDはRepairLineItem側を正にする。EstimateItemへ構造化IDを全複製するのは後回しにする。

### PublicCaseへ渡す

PublicCaseは公開用スナップショット。生成時にはRepairLineItemのsnapshotから、公開用のWorkItem / PartItemへコピーする。

```txt
B2B
-> b2bDisplayNameSnapshot
-> showPriceB2b=true かつ正の価格のみ表示

B2C
-> b2cDisplayNameSnapshot
-> 価格非表示固定
```

PublicCase表示時にRepairWorkCategory / RepairWorkAction / PartNameMaster / RepairWorkNameを後読みしない。

## 7. RepairWorkNameの扱い

今回も `RepairWorkName` は触らない。

```txt
RepairWorkName seedは作らない
部品名 x 処置の全組み合わせは作らない
RepairLineItem.repairWorkNameIdは今回の必須差分にしない
PricingRule.repairWorkNameIdも今回の必須差分にしない
```

将来的には、次の用途に限定して使う。

```txt
よく使う組み合わせ
レビュー済みユーザー入力
表示名テンプレート
PricingRuleとの任意接続
```

## 8. 今回追加しないもの

```txt
RepairWorkName seed
RepairWorkDetailMaster
部品名 x 処置の全組み合わせ
FMP専用救済ルール
PublicCase実装変更
外装detail設計
EstimateItemへの構造化ID全複製
RepairLineItem / PricingRule / EstimateItemの実装変更
```

detail は当面snapshot文字列として扱う。外装設計などでdetail候補が増え、表記ゆれや検索要件が明確になった場合のみ、将来的にdetail候補マスタ化を検討する。

## 9. migration時の注意

将来migrationを作る場合は以下を守る。

```txt
nullableで追加する
既存RepairLineItem / EstimateItem / PricingRuleを壊さない
既存帳票表示を変えない
既存PricingRule.suggestedWorkNameを残す
RepairWorkNameを必須にしない
既存RepairLineItemの二重書き導線を壊さない
ローカルDBでのみ検証する
本番/リモートDBには触らない
```

relation追加時は、既存model側のback relation名とindex名を明示し、Prismaのrelation名衝突を避ける。

`PartNameMaster.id` は現行schema上 `String @id @default(cuid())` なので、`targetPartNameId` は `String?` にする。`RepairWorkCategory.id` / `RepairWorkAction.id` / `RepairWorkName.id` は `Int` なので、それぞれ `Int?` にする。

## 10. 次Task案

### Task 108-9C

RepairLineItem / PricingRule schema差分実装。

優先候補:

```txt
RepairLineItem:
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot

PricingRule:
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
```

### Task 108-9D

構造化作業入力UI設計。

```txt
カテゴリ選択
対象部品選択
処置選択
detail入力
価格入力
表示名プレビュー
```

### Task 108-9E

構造化入力から表示名snapshotを生成する設計。

```txt
targetPartName + detail + action
estimateDisplayName
b2bDisplayName
b2cDisplayName
PublicCase向け表示名
```

## 11. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
prisma/schema.prisma
migration
seed
DB
API
UI
RepairEntryForm
保存処理
PricingRule実装
RepairLineItem実装
EstimateItem実装
PublicCase
RepairWorkName seed
```
