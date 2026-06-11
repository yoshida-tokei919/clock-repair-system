# Task 108-9F: RepairLineItem adapter / input型に構造化フィールドを通す最小実装

## 目的

Task 108-9E の短期方針に従い、既存の `body.estimate.items[]` 導線を維持したまま、`RepairLineItem` 保存用 adapter / input型へ構造化作業フィールドを optional で通せるようにした。

この Task では、EstimateItem 保存、帳票、PDF、LINE、共有ページ、PublicCase、PricingRule 検索、schema、migration、seed、DB は変更しない。

## 変更ファイル

```txt
src/lib/repair-line-items.ts
docs/ai-tasks/108-9F-implement-structured-fields-in-repair-line-item-adapter.md
```

## 実装内容

`src/lib/repair-line-items.ts` の以下を拡張した。

```txt
RepairLineItemInput
EstimateItemLikeInput
NormalizedRepairLineItemInput
estimateItemLikeToRepairLineItemInput()
normalizeRepairLineItemInput()
toCreateInput()
```

既存 API routes の `estimateItemsLikeToRepairLineItemInputs(estimateItems)` 呼び出しは維持した。`estimateItems` に optional フィールドが含まれる場合だけ adapter が拾い、なければ従来どおり null / undefined 相当として扱う。

## 追加で通した構造化フィールド

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

input 型の目安:

```ts
repairWorkCategoryId?: number | null
repairWorkActionId?: number | null
targetPartNameId?: string | null
detailLabelSnapshot?: string | null
categoryNameSnapshot?: string | null
targetPartNameSnapshot?: string | null
actionNameSnapshot?: string | null
```

`EstimateItemLikeInput` では既存の `partsMasterId` / `pricingRuleId` と同じく ID 値に文字列が混ざっても受けられるよう、`repairWorkCategoryId` / `repairWorkActionId` は `number | string | null` を受ける。

## 正規化

`normalizeRepairLineItemInput()` で以下のように正規化する。

```txt
repairWorkCategoryId -> positive int or null
repairWorkActionId   -> positive int or null
targetPartNameId     -> trim 後、空なら null
snapshot 文字列       -> trim / 空白正規化後、空なら null
```

既存の以下の挙動は変更していない。

```txt
lineType 判定
itemNameSnapshot 生成
estimateDisplayNameSnapshot 生成
b2bDisplayNameSnapshot 生成
b2cDisplayNameSnapshot 生成
partsMasterId 受け渡し
pricingRuleId 受け渡し
quantity / unitPrice / amount 計算
showPriceB2b / showPriceB2c
memo 類
```

## createMany data への転記

`toCreateInput()` で Prisma `RepairLineItemCreateManyInput` に以下を転記する。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

## EstimateItem 保存に影響していないこと

この Task では API route の EstimateItem 作成 data に新フィールドを混ぜていない。

EstimateItem 保存で引き続き使う主な項目:

```txt
itemName
type
unitPrice
quantity
partsMasterId
```

構造化作業フィールドは `RepairLineItem` adapter だけが拾う。EstimateItem schema も変更していない。

## relatedWorkLineItemId を触っていないこと

`relatedWorkLineItemId` は現行どおりの扱いを維持した。

```txt
relatedWorkLineItemId は今回の実装対象外
API route 側の relatedWorkLineItemId: null 明示は維持
部品行と技術料行の自動紐づけは別 Task
```

理由:

```txt
replaceRepairLineItems() は全置換方式
createMany 前に旧行を削除する
同一 replace 内で新規 LABOR 行 id を PART 行へ安全に参照させるには別設計が必要
client temp id / 二段階 insert / 再マッピングなどが必要
```

## 通常 Repair と PublicCase / B2C 事例紹介を混同していないこと

通常 Repair では、部品行と技術料行を別行のまま扱う。

```txt
交換部品    ゼンマイ    5,000円
交換技術料              10,000円
計                      15,000円
```

この Task では以下のような集約表示には変更していない。

```txt
ゼンマイ交換    15,000円
```

これは将来の PublicCase / B2C 事例紹介向け表示候補であり、今回の対象外。

## 変更していないもの

```txt
schema
migration
seed
DB
帳票
PDF
LINE
共有ページ
PublicCase
EstimateItem schema
EstimateItem 保存項目
PricingRule 検索ロジック
PricingRule.suggestedWorkName 互換動作
RepairWorkName seed
RepairWorkDetailMaster
RepairEntryForm の見た目
構造化作業入力 UI
relatedWorkLineItemId 紐づけ
```

## 検証結果

実行結果:

```powershell
npx prisma validate
-> success

npx prisma generate
-> success

npx tsc --noEmit --pretty false --incremental false
-> success
```

既存の `src/lib/repair-line-items.ts` 向けユニットテストは見つからなかったため、新規テスト基盤は作成していない。

## 次 Task 案

### 108-10

RepairEntryForm の構造化作業入力 UI 設計 / 実装。

対象:

```txt
RepairWorkCategory 選択
targetPartNameId / PartNameMaster 選択
RepairWorkAction 選択
detailLabel 入力 / 候補
表示名 preview
LineItem state / payload への optional フィールド追加
```

### 108-11

PricingRule 候補取得に構造化条件を追加する設計。

対象:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
customerType
既存 suggestedWorkName 互換
```

### 108-12

部品行と技術料行の `relatedWorkLineItemId` 紐づけ設計。

対象:

```txt
clientTempId
二段階 insert
LABOR / PART 行対応ルール
replaceRepairLineItems() の再設計
```

### 108-13

PublicCase / B2C 事例紹介向けの集約表示設計。

対象:

```txt
部品 + 作業の公開向け表示名
B2C 価格非表示
B2B 価格表示制御
通常 Repair 表示との分離
```
