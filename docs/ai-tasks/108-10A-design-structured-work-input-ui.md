# Task 108-10A: RepairEntryForm 構造化作業入力 UI 設計

## 目的

Task 108-9C から 108-9F までで、`RepairLineItem` 側には構造化作業入力フィールドを保存できる受け皿ができた。

追加済みフィールド:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

この Task では、次に `RepairEntryForm` の技術料入力 UI へ構造化入力をどう差し込むかを調査し、設計する。実装はしない。対象は docs 作成のみ。

## 調査ファイル

```txt
docs/ai-tasks/108-9A-investigate-structured-internal-work-input.md
docs/ai-tasks/108-9B-design-structured-work-schema-diff.md
docs/ai-tasks/108-9C-implement-structured-work-schema-diff.md
docs/ai-tasks/108-9D-investigate-line-item-part-labor-flow.md
docs/ai-tasks/108-9E-design-repair-line-item-structured-input-flow.md
docs/ai-tasks/108-9F-implement-structured-fields-in-repair-line-item-adapter.md
src/components/repairs/RepairEntryForm.tsx
src/lib/repair-line-items.ts
src/actions/master-actions.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
prisma/schema.prisma
```

## 現行 RepairEntryForm の明細入力構造

`RepairEntryForm.tsx` の `LineItem` は、現在は技術料行と部品行を同じ配列で扱う。

主な項目:

```txt
id
category
partType
name
price
cost
quantity
partRef
spec
grade
note1
note2
cousinsNumber
stockQuantity
supplierName
status
partsMasterId
```

`lineItems` は `initialData.estimate.items` から復元される。技術料行は `itemName` / `unitPrice` / `quantity` を中心に復元され、部品行は `partsMaster` から grade / note2 / refs などを補う。

現在の保存 payload は `body.estimate.items[]` に以下を送る。

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

108-9F の adapter は、ここに optional な構造化フィールドが乗っていれば `RepairLineItem` へ保存できる。ただし現行 UI はまだそれらを作っていない。

## 現行 技術料行の入力フロー

技術料を選ぶ条件:

```txt
addItemCategory === "internal"
```

候補取得:

```txt
brand / model / caliber / movementCaliber / baseMovementCaliber
-> getPricingRules(brandId, modelId, pricingCaliberId)
-> workOpts
```

候補表示:

```txt
label: PricingRule.suggestedWorkName
value: PricingRule.suggestedWorkName
price: PricingRule.minPrice
```

追加時:

```txt
newItemName
newItemPrice
newItemQty
newItemSpec
-> LineItem
-> lineItems へ追加
```

現行では `PricingRule` に追加された以下の構造化条件は、UI の候補取得にも表示にも使っていない。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
```

また `selectedWorkOption` は技術料候補にも使われているが、現行の技術料候補には `pricingRuleId` も構造化フィールドも含めていない。

## 現行 部品行の入力フロー

部品を選ぶ条件:

```txt
addItemCategory === "part_external"
```

部品入力では以下を使う。

```txt
PartCategoryMaster 相当のローカル選択肢
PartNameMaster 相当のローカル選択肢
getPartsMatched()
PartsMaster
```

候補から入る主な項目:

```txt
partsMasterId
name
price
cost
grade
note1
note2
partRef
cousinsNumber
stockQuantity
supplierName
partType
```

部品行は `PartsMaster` 中心であり、今回の構造化作業入力とは分ける。`targetPartNameId` は LABOR 行が「作業対象部品」を示すために使うもので、PART 行の `partsMasterId` とは役割が違う。

## 保存 payload の現状

API route は現行どおり `body.estimate.items[]` を受け取り、EstimateItem 保存と RepairLineItem 保存の両方に使う。

```txt
body.estimate.items[]
  -> EstimateItem 保存
  -> estimateItemsLikeToRepairLineItemInputs()
  -> RepairLineItem 保存
```

108-9F により、`body.estimate.items[]` に以下が optional で含まれていれば、EstimateItem 保存では使われず、RepairLineItem adapter だけが拾える。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

したがって、108-10B の最小実装では API route を大きく変えず、RepairEntryForm の `LineItem` 型と保存 payload に optional field を乗せるだけで通せる。

## 構造化入力の対象

対象は主に LABOR / 技術料行である。

LABOR 行に持たせたい項目:

```txt
repairWorkCategoryId
  -> 作業カテゴリ

targetPartNameId
  -> 対象部品

repairWorkActionId
  -> 処置

detailLabelSnapshot
  -> 対象部品より細かい箇所 / 要素

categoryNameSnapshot
  -> 入力時点の作業カテゴリ表示名

targetPartNameSnapshot
  -> 入力時点の対象部品表示名

actionNameSnapshot
  -> 入力時点の処置表示名
```

重要な前提:

```txt
detail は自由な作業名ではない
detail は対象部品より細かい箇所 / 要素
RepairWorkName seed は作らない
RepairWorkDetailMaster は作らない
```

PART 行は `PartsMaster` 中心であり、今回の構造化作業入力とは分離する。ただし将来 `relatedWorkLineItemId` を設計する時に、PART 行と LABOR 行を紐づける余地は残す。

## 通常 Repair と PublicCase / B2C を混同しない方針

通常 Repair では、部品行と技術料行を別行として扱う。

```txt
交換部品    ゼンマイ    5,000円
交換技術料              10,000円
計                      15,000円
```

この UI 設計でも、通常 Repair の帳票を以下のような 1 行集約には変えない。

```txt
ゼンマイ交換    15,000円
```

これは将来の PublicCase / B2C 事例紹介向け集約表示候補であり、通常 Repair の入力 UI / 帳票表示とは別 Task で扱う。

## UI 案 A: 現行の技術料入力欄に構造化欄を追加する

現行の「技術料」入力欄の近くに、以下の選択 / 入力欄を追加する。

```txt
作業カテゴリ
対象部品
処置
detail
表示名
価格
```

例:

```txt
技術料
作業カテゴリ: [ゼンマイ周り]
対象部品: [ゼンマイ]
処置: [交換]
detail: [任意入力]
表示名: [交換技術料]
価格: [10000]
```

メリット:

```txt
現行 UI の延長で理解しやすい
実装範囲を比較的小さくできる
body.estimate.items[] へ optional field を乗せやすい
PricingRule.suggestedWorkName と共存しやすい
```

デメリット:

```txt
入力行が横に長くなりやすい
既存のコンパクトな明細追加 UI が重くなる
作業カテゴリ / 対象部品 / 処置の選択肢取得が必要
```

## UI 案 B: 技術料候補選択の前に構造化選択を置く

候補選択の順序を以下に寄せる。

```txt
作業カテゴリ
-> 対象部品
-> 処置
-> detail
-> PricingRule 候補
-> 表示名 / 価格
```

メリット:

```txt
将来の PricingRule 構造化検索と相性が良い
作業入力の意味が明確になる
RepairLineItem を正式明細本体へ育てやすい
```

デメリット:

```txt
現行 PricingRule.suggestedWorkName 候補との接続設計が必要
UI 変更が大きい
実装段階が増える
既存作業者の入力速度に影響しやすい
```

## UI 案 C: 最初は hidden / optional field の受け皿だけ持たせる

見た目は現行 UI をほぼ維持し、`LineItem` 型と payload だけを拡張する。将来の UI で選択した値を入れられる場所を先に作る。

例:

```txt
LineItem に optional field を追加
保存 payload に optional field を追加
現行の作業名 / 価格入力 UI は維持
構造化選択 UI は別 Task
```

メリット:

```txt
既存 UI を壊すリスクが最小
帳票 / PDF / LINE / 共有ページへの影響がない
108-9F の adapter と接続確認しやすい
段階実装しやすい
```

デメリット:

```txt
ユーザーがまだ構造化入力できない
保存される structured field は、外部から値が入る場合に限られる
効果は限定的
```

## 推奨方針

108-10B の次実装では、案 C を土台にしつつ、技術料行だけに限定した小さな案 A へ進める方針を推奨する。

段階:

```txt
1. LineItem 型へ optional 構造化フィールドを追加
2. 保存 payload の body.estimate.items[] へ optional 構造化フィールドを追加
3. 技術料行だけに構造化入力 state を持たせる
4. 最初の UI は折りたたみ / 補助欄として小さく追加する
5. PricingRule.suggestedWorkName の候補選択は維持する
```

理由:

```txt
既存 UI を壊さない
既存帳票 / PDF / LINE / 共有ページへ影響しない
108-9F の adapter をそのまま使える
PricingRule.suggestedWorkName と共存できる
将来の PricingRule 構造化検索へ進みやすい
PublicCase / B2C 集約表示へ進むための元データを増やせる
```

108-10B では UI を大きく作り替えず、技術料行にだけ以下を optional で持たせるところまでを最小実装とするのが安全。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

## 108-10B で触ってよい想定範囲

```txt
src/components/repairs/RepairEntryForm.tsx
LineItem 型
技術料行の入力 state
body.estimate.items[] への optional フィールド追加
必要最小限の master action 読み取り確認
docs/ai-tasks/*
```

注意:

```txt
見た目変更は最小限
技術料行 / LABOR 行に限定
部品行 / PART 行の PartsMaster 中心設計は維持
EstimateItem 保存では新 field を使わない
```

## 108-10B で触らない範囲

```txt
schema
migration
seed
DB
API の大幅変更
RepairLineItem adapter の大幅変更
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

## 明確にする前提

1. 構造化入力は LABOR 行中心である。

2. PART 行は PartsMaster 中心で、今回の構造化作業入力とは分ける。

3. EstimateItem 表示 / 帳票表示は変えない。

4. `body.estimate.items[]` に optional field として乗せるだけで、EstimateItem 保存では使わない。

5. `PricingRule.suggestedWorkName` は当面残す。

6. `RepairWorkName` seed は作らない。

7. `detail` は対象部品より細かい箇所 / 要素であり、自由な作業名ではない。

8. `relatedWorkLineItemId` は今回扱わない。

9. PublicCase / B2C 事例紹介の集約表示は別 Task で扱う。

## 変更していないもの

この Task では以下を変更していない。

```txt
schema
migration
seed
DB
API
保存処理
RepairEntryForm
UI
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

### 108-10B

RepairEntryForm に構造化作業入力の最小受け皿を実装する。

対象:

```txt
LineItem 型へ optional field 追加
技術料入力 state へ optional field 追加
body.estimate.items[] へ optional field 追加
既存 UI を壊さない範囲で小さな補助欄を追加
```

### 108-10C

RepairWorkCategory / RepairWorkAction / PartNameMaster を UI で選択するための master action 設計 / 実装。

対象:

```txt
作業カテゴリ候補取得
処置候補取得
対象部品候補取得
snapshot 表示名生成
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
## UI ワイヤーフレーム案

108-10B で実装する前に、RepairEntryForm 上で構造化作業入力がどのように見えるかを簡易ワイヤーフレームとして整理する。

このセクションも設計 docs のみであり、コード変更は行わない。

### 1. 現行 UI の簡易イメージ

現行の技術料入力は、種別で「技術料」を選び、既存の `PricingRule.suggestedWorkName` 由来の作業候補または手入力の作業名、数量、単価を入れて明細に追加する。

```txt
[明細追加]

種別:
[ 技術料 ▼ ]

作業名 / 候補:
[ オーバーホール ▼ ]

備考 / 仕様:
[                         ]

数量:
[ 1 ]

単価:
[ 30000 ]

[明細に追加]
```

現行の交換部品入力は、種別で「交換部品」を選び、部品カテゴリ / 部品名から候補を絞り、`PartsMaster` 由来の grade / note2 / price などを使って明細に追加する。

```txt
[明細追加]

種別:
[ 交換部品 ▼ ]

部品入力種別:
[ 外装部品 / 内装部品 ▼ ]

部品カテゴリ:
[ 内装部品 ▼ ]

部品名:
[ ゼンマイ ▼ ]

グレード:
[ 純正 / FIT / 合わせ など ]

備考 / 仕様:
[                         ]

数量:
[ 1 ]

単価:
[ 5000 ]

[明細に追加]
```

### 2. 108-10B 最小実装 UI 案

108-10B では、技術料行だけに小さく構造化入力欄を追加する。既存の作業候補、作業名、価格入力は残し、構造化欄は任意の補助欄として扱う。

重要な方針:

```txt
既存の PricingRule.suggestedWorkName 候補欄は残す
既存の作業名 / 価格入力は残す
構造化欄は補助欄として追加する
部品行には出さない
帳票表示は変えない
EstimateItem 保存には使わない
RepairLineItem 側だけに optional field として渡す
```

疑似画面:

```txt
[明細追加]

種別:
[ 技術料 ▼ ]

作業候補:
[ 交換技術料 ▼ ]  ※既存 PricingRule.suggestedWorkName

--- 構造化入力（任意） ---
作業カテゴリ:
[ ゼンマイ周り ▼ ]

対象部品:
[ ゼンマイ ▼ ]

処置:
[ 交換 ▼ ]

detail:
[                      ] 例: ブッシュ / ピン / 穴 / カシメ部
------------------------

表示名:
[ 交換技術料 ]

備考 / 仕様:
[                         ]

数量:
[ 1 ]

単価:
[ 10000 ]

[明細に追加]
```

この最小案では、構造化入力は LABOR 行の補助情報であり、通常 Repair の明細表示名や帳票表示名を置き換えない。

### 3. 折りたたみ案

画面が長くなりすぎるため、構造化入力欄は初期状態では折りたたみでもよい。スマホ / PC の両方を考えると、108-10B の推奨は「折りたたみ補助欄」とする。

初期状態:

```txt
[明細追加]

種別: [ 技術料 ▼ ]
作業候補: [ 交換技術料 ▼ ]
表示名: [ 交換技術料 ]
単価: [ 10000 ]

[＋ 詳細な作業分類を入力する]
```

展開後:

```txt
[明細追加]

種別: [ 技術料 ▼ ]
作業候補: [ 交換技術料 ▼ ]
表示名: [ 交換技術料 ]
単価: [ 10000 ]

[− 詳細な作業分類を閉じる]

  作業カテゴリ:
  [ ゼンマイ周り ▼ ]

  対象部品:
  [ ゼンマイ ▼ ]

  処置:
  [ 交換 ▼ ]

  detail:
  [ 任意入力                      ]

[明細に追加]
```

折りたたみ補助欄にする理由:

```txt
既存の入力速度を落としにくい
構造化入力が不要な作業では画面を圧迫しない
スマホ幅で明細追加エリアが長くなりすぎない
将来の master 候補取得や PricingRule 構造化検索を段階的に足せる
```

### 4. 明細一覧に追加された後の表示

通常 Repair の明細一覧では、構造化入力を行っても従来どおり部品行と技術料行を分けて表示する。

```txt
技術料    交換技術料      10,000円
交換部品  ゼンマイ         5,000円
```

構造化入力したからといって、通常 Repair の明細一覧、帳票、PDF、LINE、共有ページを以下のような 1 行集約にはしない。

```txt
ゼンマイ交換    15,000円
```

この集約表示は PublicCase / B2C 事例紹介用の将来 Task で扱う。通常 Repair では、業務上の明細として技術料行と部品行を分ける方針を維持する。

### 5. 108-10B で実装する UI 範囲

108-10B で実装してよい:

```txt
技術料選択時だけ、構造化入力用の任意欄を表示
LineItem 型へ optional field 追加
body.estimate.items[] へ optional field 追加
既存の作業候補 / 表示名 / 価格欄は維持
構造化入力欄は折りたたみ補助欄として追加
RepairLineItem 側へ optional field として渡す
```

108-10B で実装しない:

```txt
部品行への構造化作業入力
PricingRule 検索条件の変更
帳票表示変更
PDF 表示変更
LINE 送信内容変更
共有ページ表示変更
PublicCase 表示変更
relatedWorkLineItemId 紐づけ
RepairWorkName seed
RepairWorkDetailMaster
```
