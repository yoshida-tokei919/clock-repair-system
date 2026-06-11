# Task 108-9E: RepairLineItem adapter / input型へ構造化フィールドを通す設計

## 目的

Task 108-9C で `RepairLineItem` / `PricingRule` に追加した構造化作業入力フィールドを、既存の `EstimateItem` 導線を壊さずに `RepairLineItem` 側へ渡すための次実装を設計する。

この Task では実装しない。対象は調査と設計 docs 作成のみ。

優先する方針:

```txt
既存の EstimateItem 導線を壊さない
通常 Repair の帳票 / PDF / LINE / 共有ページ表示を変えない
RepairLineItem を将来の正式明細本体として育てる
部品行と技術料行は通常 Repair では別行のまま保持する
PublicCase / B2C 事例紹介用の集約表示とは混同しない
```

## 調査したファイル

```txt
docs/ai-tasks/108-9A-investigate-structured-internal-work-input.md
docs/ai-tasks/108-9B-design-structured-work-schema-diff.md
docs/ai-tasks/108-9C-implement-structured-work-schema-diff.md
docs/ai-tasks/108-9D-investigate-line-item-part-labor-flow.md
prisma/schema.prisma
src/lib/repair-line-items.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
src/actions/master-actions.ts
src/components/repairs/RepairEntryForm.tsx
```

## 現行 input型 / adapter の整理

`src/lib/repair-line-items.ts` の現行構造:

```txt
RepairLineItemInput
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
  showPriceB2b
  showPriceB2c
  sortOrder
  memo類

EstimateItemLikeInput
  type
  itemName / name
  unitPrice / price
  quantity
  partsMasterId
  pricingRuleId
  relatedWorkLineItemId
  表示名snapshot類
  grade / note2類
  memo類
```

`estimateItemsLikeToRepairLineItemInputs()` は `body.estimate.items[]` 相当を `RepairLineItemInput[]` へ変換する互換 adapter である。現行では `type` から `LABOR` / `PART` を判定し、`itemNameSnapshot` と各表示名 snapshot を生成し、`partsMasterId` / `pricingRuleId` を受け渡す。

不足している構造化作業フィールド:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

`replaceRepairLineItems()` は全置換方式で、現行では `relatedWorkLineItemId` を安定して紐づける設計にはなっていない。createMany 前に旧行を削除するため、同一 replace 内で新規 LABOR 行 id を PART 行へ安全に参照させるには別設計が必要である。

## 現行 API payload の整理

新規作成 API:

```txt
src/app/api/repairs/route.ts
```

更新 API:

```txt
src/app/api/repairs/[id]/route.ts
```

どちらも基本構造は同じ:

```txt
body.estimate.items[]
  -> 部品行は PartsMaster 同期
  -> EstimateItem 作成 / 置換
  -> estimateItemsLikeToRepairLineItemInputs()
  -> relatedWorkLineItemId: null を明示
  -> replaceRepairLineItems()
  -> labor 行から PricingRule の suggestedWorkName 自動作成 / 更新
```

EstimateItem 作成に使っている主な項目:

```txt
item.name
item.type
item.price
item.quantity
item.partsMasterId
```

RepairLineItem 作成に使っている主な項目:

```txt
item.name / item.itemName
item.type
item.price / item.unitPrice
item.quantity
item.partsMasterId
item.pricingRuleId
表示名snapshot類
grade / note2類
```

現行 API payload には、構造化作業入力フィールドはまだ乗っていない。

## 現行 UI payload の整理

`RepairEntryForm.tsx` の `LineItem` は、現行では以下を中心に持つ:

```txt
category
partType
name
price
cost
quantity
partRef
grade
note1
note2
cousinsNumber
stockQuantity
partsMasterId
```

保存 payload は `estimate.items` として送信される:

```txt
type: i.category.includes('part') ? 'part' : 'labor'
category
partType
name
price
cost
notes
grade
note1
note2
partRef
cousinsNumber
stockQuantity
partsMasterId
quantity
```

現行 UI には、以下を選ぶ state / 入力欄はまだない:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

`addItemCategory === "internal"` の候補取得では `getPricingRules()` を使い、`PricingRule.suggestedWorkName` をラベルとして技術料候補を表示している。`PricingRule` の新しい構造化条件はまだ検索条件として使われていない。

## 通常 Repair の表示方針

通常 Repair の帳票 / PDF / LINE / 共有ページでは、部品行と技術料行を分ける。

例:

```txt
交換部品    ゼンマイ    5,000円
交換技術料              10,000円
計                      15,000円
```

通常 Repair 表示では、以下のような 1 行集約にはしない:

```txt
ゼンマイ交換    15,000円
```

これは将来の PublicCase / B2C 事例紹介向けの集約表示候補であり、通常 Repair の見積 / 帳票表示とは別に設計する。

## 構造化フィールドを通す案 A: 既存 estimate item payload を拡張する

`body.estimate.items[]` に optional な構造化フィールドを追加し、EstimateItem 保存では無視し、RepairLineItem adapter だけが拾う。

追加候補:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

実装範囲:

```txt
RepairEntryForm の LineItem 型 / payload に optional 項目を追加
EstimateItemLikeInput に optional 項目を追加
estimateItemLikeToRepairLineItemInput() で LABOR 行へ転記
normalizeRepairLineItemInput() で正規化
toCreateInput() で RepairLineItem createMany data へ転記
API route は既存 body.estimate.items[] をそのまま使う
EstimateItem create / createMany は現行項目のみ維持
```

メリット:

```txt
既存 payload の延長で実装できる
API route の変更が小さい
既存の EstimateItem 保存処理を壊しにくい
RepairEntryForm 側は LineItem state の拡張だけで始められる
短期実装として安全
```

デメリット:

```txt
EstimateItem 用 payload に RepairLineItem 専用情報が混ざる
将来 RepairLineItem を正式明細本体へ移す時に payload 分離が必要
EstimateItem に保存されない項目が body.estimate.items[] に存在するため責務が曖昧になる
```

## 構造化フィールドを通す案 B: RepairLineItem 専用 payload を別に持つ

`body.repairLineItems[]` を新設し、EstimateItem は従来どおり `body.estimate.items[]`、RepairLineItem は `body.repairLineItems[]` から保存する。

想定 payload:

```txt
body.estimate.items[]
  -> 既存 EstimateItem 保存専用

body.repairLineItems[]
  -> lineType
  -> partsMasterId
  -> pricingRuleId
  -> repairWorkCategoryId
  -> repairWorkActionId
  -> targetPartNameId
  -> detailLabelSnapshot
  -> categoryNameSnapshot
  -> targetPartNameSnapshot
  -> actionNameSnapshot
  -> 表示名snapshot類
  -> quantity / unitPrice
```

メリット:

```txt
EstimateItem と RepairLineItem の責務を分けやすい
将来の正式明細本体への移行に自然
構造化入力が RepairLineItem 専用であることが payload 上も明確
```

デメリット:

```txt
初期実装の変更範囲が大きい
UI 側で二重 payload を管理する必要がある
既存保存処理との整合確認が増える
EstimateItem と RepairLineItem の行順 / 金額 / 部品同期のズレを防ぐ設計が必要
```

## 推奨方針

短期の次実装では案 A を推奨する。

理由:

```txt
今回の最優先は既存帳票 / 共有ページ / 保存処理を壊さないこと
現行保存導線は body.estimate.items[] から EstimateItem と RepairLineItem を二重保存する形で安定している
EstimateItem 保存側に新フィールドを渡さなければ既存 EstimateItem schema を壊さない
RepairLineItem adapter / input型の変更に閉じやすい
UI の構造化入力がまだ未実装なので、まず受け皿だけを安全に広げられる
```

中期では案 B へ移行する余地を残す。

```txt
RepairLineItem が正式明細本体になる段階
RepairLineItem -> EstimateItem 生成へ移行する段階
PublicCase / B2C 事例紹介用の work / part snapshot 生成を始める段階
```

この段階では `body.repairLineItems[]` を新設し、EstimateItem を帳票発行用 snapshot として生成する設計へ寄せる。

## 次実装 Task で触ってよい範囲

案 A の最小実装として触ってよい範囲:

```txt
src/lib/repair-line-items.ts
src/app/api/repairs/route.ts の payload 受け渡し確認箇所
src/app/api/repairs/[id]/route.ts の payload 受け渡し確認箇所
src/components/repairs/RepairEntryForm.tsx の LineItem 型 / payload 生成
docs/ai-tasks/*
```

API route は大きく書き換えない。既存の `estimateItemsLikeToRepairLineItemInputs(estimateItems)` 呼び出しを維持し、`estimateItems` に optional フィールドが入っていれば adapter が拾う形にする。

UI 本体は、次実装で構造化入力欄まで作らない場合は型と payload の受け皿だけに留める。構造化 UI の設計は別 Task とする。

## 次実装 Task で触らない範囲

```txt
帳票表示
PDF 表示
LINE 送信内容
共有ページ表示
PublicCase 表示
EstimateItem schema
PricingRule 検索ロジック
PricingRule.suggestedWorkName 互換動作
RepairWorkName seed
RepairWorkDetailMaster
schema
migration
seed
DB
```

## relatedWorkLineItemId を今回扱わない理由

`relatedWorkLineItemId` は部品行と技術料行を紐づける将来候補である。ただし現行の `replaceRepairLineItems()` は全置換後に `createMany` するため、同一保存処理内で新規作成される LABOR 行 id を PART 行へ安全に参照させることができない。

必要になる追加設計:

```txt
clientTempId の導入
二段階 insert
createMany ではなく create + id 回収
更新後の再マッピング
既存行との対応ルール
```

したがって、今回および次の最小実装では `relatedWorkLineItemId: null` 固定を維持する。

## EstimateItem 導線を壊さない方針

EstimateItem は当面、帳票 / PDF / LINE / 共有ページの表示元であり続ける。

次実装でも以下を守る:

```txt
EstimateItem に構造化作業フィールドを保存しない
EstimateItem create / createMany の項目を増やさない
EstimateItem を読む帳票 / PDF / LINE / 共有ページを変更しない
RepairLineItem 側だけに構造化情報を保存する
```

つまり、現行の流れは維持する:

```txt
RepairEntryForm payload
  -> EstimateItem
  -> RepairLineItem
```

将来の目標は以下だが、今回すぐには移行しない:

```txt
Repair
  -> RepairLineItem
  -> EstimateItem
  -> 帳票 / 共有ページ / 請求
```

## 通常 Repair と PublicCase / B2C 事例紹介を混同しない方針

通常 Repair:

```txt
業務上の明細を正確に分ける
部品行と技術料行を別行として保存 / 表示する
EstimateItem snapshot を表示の正とする
```

PublicCase / B2C 事例紹介:

```txt
公開向けに読みやすい単位へ変換する
必要なら部品 + 作業を集約した表示名を生成する
B2C では価格非表示を基本とする
B2B では公開許可された価格だけ表示する
```

したがって、`ゼンマイ交換 15,000円` のような集約表示は通常 Repair の帳票表示ではなく、PublicCase / B2C 事例紹介用の表示候補として別 Task で扱う。

## 変更していないもの

この Task では以下を変更していない:

```txt
schema
migration
seed
DB
API
UI
保存処理
帳票
PDF
LINE
共有ページ
PublicCase
EstimateItem
RepairLineItem
PricingRule
RepairWorkName seed
RepairWorkDetailMaster
```

## 次 Task 案

### 108-9F

RepairLineItem adapter / input型に構造化フィールドを通す最小実装。

対象:

```txt
src/lib/repair-line-items.ts
RepairLineItemInput
EstimateItemLikeInput
NormalizedRepairLineItemInput
estimateItemLikeToRepairLineItemInput()
normalizeRepairLineItemInput()
toCreateInput()
```

方針:

```txt
body.estimate.items[] の optional フィールドを adapter が拾う
EstimateItem 保存項目は変更しない
relatedWorkLineItemId は null 固定を維持
帳票 / PDF / LINE / 共有ページは触らない
```

### 108-10

RepairEntryForm の構造化作業入力 UI 設計。

対象:

```txt
RepairWorkCategory 選択
targetPartNameId / PartNameMaster 選択
RepairWorkAction 選択
detailLabel 入力 / 候補
表示名 preview
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
