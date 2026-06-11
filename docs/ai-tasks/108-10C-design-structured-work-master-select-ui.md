# Task 108-10C: 構造化作業入力 UI のマスター選択化設計

## 目的

Task 108-10B で `RepairEntryForm` の技術料行に構造化作業入力の最小 UI 受け皿を追加した。現状は snapshot text 中心である。

現状:

```txt
作業カテゴリ: 手入力
対象部品: 手入力
処置: 手入力
detail: 手入力
```

この Task では、次段階として以下をマスター選択 UI に寄せるための調査と設計を行う。

```txt
作業カテゴリ
-> RepairWorkCategory から選択

対象部品
-> PartNameMaster から選択

処置
-> RepairWorkAction から選択

detail
-> 引き続き任意テキスト入力
```

この Task では実装しない。対象は docs 作成のみ。

## 調査ファイル

```txt
docs/ai-tasks/108-9A-investigate-structured-internal-work-input.md
docs/ai-tasks/108-9B-design-structured-work-schema-diff.md
docs/ai-tasks/108-9C-implement-structured-work-schema-diff.md
docs/ai-tasks/108-9E-design-repair-line-item-structured-input-flow.md
docs/ai-tasks/108-9F-implement-structured-fields-in-repair-line-item-adapter.md
docs/ai-tasks/108-10A-design-structured-work-input-ui.md
docs/ai-tasks/108-10B-implement-minimal-structured-work-input-ui.md
src/components/repairs/RepairEntryForm.tsx
src/actions/master-actions.ts
src/lib/repair-line-items.ts
src/lib/part-input-options.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
prisma/schema.prisma
prisma/seed.ts
```

## RepairWorkCategory model 確認

`RepairWorkCategory` は Prisma schema に存在する。

主な項目:

```txt
id Int
repairType RepairWorkType
parentId Int?
name String
displayName String
description String?
sortOrder Int
isActive Boolean
```

relation:

```txt
parent / children
workNames
repairLineItems
pricingRules
```

index / unique:

```txt
@@unique([repairType, parentId, name])
@@index([repairType])
@@index([parentId])
```

既存 seed:

```txt
prisma/seed.ts に INTERNAL の親カテゴリ 11 件あり
movement
quartz
power_winding
train_wheel
escapement
regulator
hand_setting
calendar
automatic_winding
chronograph
main_plate
```

注意:

```txt
seed の displayName は現状 mojibake している箇所がある
この Task では seed 修正しない
UI で使う前に表示名の整備が別途必要
```

UI で必要な値:

```txt
repairWorkCategoryId
categoryNameSnapshot
```

## RepairWorkAction model 確認

`RepairWorkAction` は Prisma schema に存在する。

主な項目:

```txt
id Int
name String @unique
displayName String
sortOrder Int
isActive Boolean
```

relation:

```txt
workNames
repairLineItems
pricingRules
```

既存 seed:

```txt
prisma/seed.ts に 12 件あり
exchange
repair
adjust
correction
polish
clean
oil
make
install
remove
hole_tightening
staking
```

想定表示:

```txt
交換
修理
調整
修正
研磨
洗浄
注油
製作
取付
除去
穴締め
かしめ
```

注意:

```txt
seed の displayName は現状 mojibake している箇所がある
この Task では seed 修正しない
UI で使う前に表示名の整備が別途必要
```

UI で必要な値:

```txt
repairWorkActionId
actionNameSnapshot
```

## PartNameMaster model 確認

`PartNameMaster` は Prisma schema に存在する。

主な項目:

```txt
id String @id @default(cuid())
key String @unique
categoryId String
partType String
nameJa String
nameEn String?
displayJa String?
displayEn String?
sortOrder Int
isActive Boolean
```

relation:

```txt
category PartCategoryMaster
parts PartsMaster[]
repairWorkNames
repairLineItems
pricingRules
```

index:

```txt
@@index([partType])
@@index([categoryId])
@@index([partType, categoryId])
@@index([partType, sortOrder])
```

UI で必要な値:

```txt
targetPartNameId
targetPartNameSnapshot
```

重要:

```txt
targetPartNameId は LABOR 行の「作業対象部品」
PART 行の partsMasterId とは別物
```

`src/lib/part-input-options.ts` には、現行 UI で使っている静的な部品カテゴリ / 部品名候補がある。

```txt
getPartCategoriesByType(partType)
getPartNamesByCategory(categoryKey)
getPartNameOptionByKey(key)
searchPartNameOptions(keyword, partType)
```

これらは `PartNameMaster` の DB 読み取りではなく、フロント側の静的候補である。短期実装ではこの静的候補を使う案もあり得るが、`targetPartNameId` は Prisma の `PartNameMaster.id` であるため、最終的には DB master 取得に寄せる必要がある。

## 既存 master action 確認

`src/actions/master-actions.ts` にある関連 action:

```txt
getPricingRules()
getPartsMatched()
getBrands()
getModels()
getCalibers()
getCalibersForModel()
getCalibersForRef()
```

現状、以下の専用 action は見つからない。

```txt
RepairWorkCategory 一覧取得
RepairWorkAction 一覧取得
PartNameMaster 一覧取得
PartCategoryMaster 一覧取得
```

したがって、108-10D で master select 化する場合は、専用 server action を追加する設計が自然である。

追加候補:

```txt
getRepairWorkCategories(repairType?: RepairWorkType)
getRepairWorkActions()
getPartNameMasters(partType?: string, categoryId?: string)
getPartCategoryMasters(partType?: string)
```

返却値の目安:

```ts
type SelectOption = {
  id: number | string
  key?: string
  label: string
  value: string
  sortOrder?: number
}
```

filter:

```txt
isActive = true
RepairWorkCategory は repairType = INTERNAL を基本
PartNameMaster は短期では partType = part_internal を基本
sortOrder asc, display/name asc
```

## UI 選択化案

108-10B の折りたたみ補助欄を、以下のように select 化する。

現状:

```txt
[＋ 詳細な作業分類を入力する]

作業カテゴリ: [手入力]
対象部品: [手入力]
処置: [手入力]
detail: [任意入力]
```

次段階案:

```txt
[＋ 詳細な作業分類を入力する]

作業カテゴリ:
[ ゼンマイ周り ▼ ]

対象部品:
[ ゼンマイ ▼ ]

処置:
[ 交換 ▼ ]

detail:
[ ブッシュ / ピン / 穴 など ]
```

保存される値:

```txt
repairWorkCategoryId
categoryNameSnapshot

targetPartNameId
targetPartNameSnapshot

repairWorkActionId
actionNameSnapshot

detailLabelSnapshot
```

ID は master id を保存し、snapshot は選択時点の表示名を保存する。master 表示名が後で変わっても、過去の RepairLineItem 表示補助情報は固定できる。

## 対象部品候補の出し方 比較

### 案 A: PartNameMaster 全体から選択

```txt
PartNameMaster の active 全件
または keyword 検索で選択
```

メリット:

```txt
実装が単純
作業カテゴリとの対応マスタが不要
外装 / 内装をまたいだ作業にも広げやすい
```

デメリット:

```txt
候補が多くなりやすい
外装 / 内装が混ざる可能性がある
作業カテゴリとの関係が弱い
入力ミスや選択迷いが増える
```

### 案 B: 内装部品だけに絞る

```txt
PartNameMaster.partType = part_internal
または現行 part-input-options の part_internal 相当
```

メリット:

```txt
今回の内部作業入力に合う
候補が減る
108 系の RepairWorkCategory / RepairLineItem 方針と相性が良い
```

デメリット:

```txt
内装判定に使う項目を明確にする必要がある
外装系技術料を扱う場合に拡張が必要
PartNameMaster 側の seed / DB 整備状況に依存する
```

### 案 C: 作業カテゴリに応じて対象部品候補を絞る

例:

```txt
作業カテゴリ: ゼンマイ周り
-> ゼンマイ / 香箱 / 一番受け など
```

メリット:

```txt
入力しやすい
候補の見当違いを防ぎやすい
将来の PricingRule 構造化検索に向く
```

デメリット:

```txt
カテゴリと部品の対応マスタが必要になる可能性がある
現時点では過剰実装になりやすい
対応関係のメンテナンスが必要
```

## 対象部品候補の推奨案

短期は案 B を推奨する。

```txt
PartNameMaster の内装部品だけに絞る
候補が足りない場合は現行 part-input-options の part_internal 候補を参考にする
カテゴリ連動フィルタはまだ作らない
```

理由:

```txt
今回の対象は主に内部作業 / 技術料行
PART 行の partsMasterId と混同しにくい
候補数を抑えられる
新しいカテゴリ-対象部品対応 schema を作らずに済む
```

中期では案 C を検討する。

```txt
RepairWorkCategory と PartNameMaster の対応ルールを作る
作業カテゴリ選択後に対象部品候補を絞る
PricingRule 構造化検索にもつなげる
```

長期では、必要なら中間マスタを検討する。

```txt
RepairWorkCategoryTargetPart
repairWorkCategoryId
partNameMasterId
sortOrder
isActive
```

ただし、この Task では新規 schema は作らない。

## RepairWorkCategory と PartNameMaster の関係

短期:

```txt
作業カテゴリ選択と対象部品選択は独立でよい
対象部品は内装部品に絞る
```

中期:

```txt
作業カテゴリに応じた対象部品候補フィルタを検討する
まずは設定ファイル / 定数 / server action 内の簡易対応でもよい
```

長期:

```txt
必要なら RepairWorkCategoryTargetPart のような中間マスタを設計する
ただし schema 追加は別 Task
```

## detail の扱い

`detailLabelSnapshot` は引き続き任意テキスト入力とする。

意味:

```txt
対象部品より細かい箇所 / 要素
```

例:

```txt
ブッシュ
ピン
穴
受け穴
カシメ部
軸穴
```

禁止する解釈:

```txt
オーバーホール
ゼンマイ交換
分解掃除
交換技術料
```

`RepairWorkDetailMaster` は作らない方針を維持する。detail は snapshot text で十分とし、候補化 / master 化は将来必要が明確になった場合だけ検討する。

## PricingRule との関係

この Task では PricingRule 検索条件を変更しない。

ただし、108-11 で以下を PricingRule 候補取得に使う前提として、108-10D では UI 選択値を正しく payload に乗せる必要がある。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
customerType
```

維持すること:

```txt
PricingRule.suggestedWorkName は当面維持
既存候補取得は壊さない
構造化検索は別 Task
```

## 通常 Repair と PublicCase / B2C を混同しない

通常 Repair:

```txt
技術料    交換技術料      10,000円
交換部品  ゼンマイ         5,000円
```

PublicCase / B2C 事例紹介:

```txt
ゼンマイ交換
```

この Task では、通常 Repair の明細表示 / 帳票表示は変えない。構造化入力は RepairLineItem の補助情報であり、通常 Repair の部品行と技術料行を集約するためのものではない。

## 108-10D 実装 Task 案

108-10D で触ってよい可能性がある範囲:

```txt
src/components/repairs/RepairEntryForm.tsx
src/actions/master-actions.ts
必要な型定義
docs/ai-tasks/*
```

108-10D で触らない範囲:

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
PricingRule 検索ロジック
RepairWorkName seed
RepairWorkDetailMaster
relatedWorkLineItemId
```

108-10D の基本目標:

```txt
作業カテゴリ select 化
対象部品 select 化
処置 select 化
detail は任意テキストのまま
ID + snapshot を body.estimate.items[] に乗せる
```

108-10D の実装分割案:

```txt
1. getRepairWorkCategories / getRepairWorkActions を追加し、作業カテゴリと処置だけ select 化
2. PartNameMaster 取得 action を追加し、対象部品を内装部品だけ select 化
3. snapshot と ID の payload 連携を確認
```

対象部品候補の DB 取得が大きくなる場合は、108-10D をさらに分割してよい。

## 変更していないもの

この Task では以下を変更していない。

```txt
schema
migration
seed
DB
API
保存処理
RepairEntryForm 実装
RepairLineItem adapter
帳票
PDF
LINE
共有ページ
PublicCase
EstimateItem schema
PricingRule 検索ロジック
PricingRule.suggestedWorkName 互換動作
RepairWorkName seed
RepairWorkDetailMaster
relatedWorkLineItemId
```

## 次 Task 案

### 108-10D

構造化作業入力 UI を master select 化する最小実装。

対象:

```txt
RepairWorkCategory select
RepairWorkAction select
PartNameMaster select
detail は任意テキスト
ID + snapshot payload
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

### 108-13

PublicCase / B2C 事例紹介向けの集約表示設計。
