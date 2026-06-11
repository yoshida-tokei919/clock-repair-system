# Task 108-10B: RepairEntryForm 構造化作業入力 UI の最小受け皿実装

## 目的

108-10A の設計に従い、`RepairEntryForm` に構造化作業入力の最小 UI 受け皿を追加した。

優先した方針:

```txt
既存の技術料入力を維持する
既存の PricingRule.suggestedWorkName 候補を維持する
技術料 / LABOR 行だけに構造化入力欄を追加する
構造化入力欄は任意入力にする
部品行 / PART 行には出さない
body.estimate.items[] に optional field として乗せる
EstimateItem 保存では使わない
RepairLineItem adapter が拾う
帳票 / PDF / LINE / 共有ページ / PublicCase は触らない
```

## 変更ファイル

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10B-implement-minimal-structured-work-input-ui.md
```

## 実装内容

`RepairEntryForm.tsx` の `LineItem` に以下の optional field を追加した。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

技術料入力欄に、折りたたみ式の補助欄を追加した。

```txt
詳細な作業分類を入力する
  作業カテゴリ
  対象部品
  処置
  detail
```

この補助欄は `addItemCategory === "internal"`、つまり技術料選択時だけ表示する。交換部品選択時には表示しない。

## UI 方針

108-10A の「折りたたみ補助欄」案を採用した。

初期状態では既存の入力導線を大きく変えない。

```txt
種別: 技術料
作業名 / 候補
備考 / 仕様
仕入
単価
数量
明細に追加
```

必要な場合だけ、折りたたみを開いて構造化情報を補足する。

```txt
作業カテゴリ
対象部品
処置
detail
```

## LineItem に追加した field

```ts
repairWorkCategoryId?: number | null
repairWorkActionId?: number | null
targetPartNameId?: string | null
detailLabelSnapshot?: string | null
categoryNameSnapshot?: string | null
targetPartNameSnapshot?: string | null
actionNameSnapshot?: string | null
```

## 保存 payload へ追加した field

`body.estimate.items[]` に以下を optional field として追加した。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

部品行ではすべて `null` として送る。技術料行では `LineItem` に入っている値を送る。

## master select 化について

この Task では master select 化はしていない。

採用した最小実装:

```txt
snapshot 系の任意テキスト入力を通す
ID 系は null のままでもよい
```

理由:

```txt
既存 UI を壊さないことを優先
master action / 候補取得設計を無理に広げない
108-9F の adapter へ optional field が通ることを先に確認する
```

将来、master action が整理できた段階で以下を select 化する。

```txt
repairWorkCategoryId / categoryNameSnapshot
targetPartNameId / targetPartNameSnapshot
repairWorkActionId / actionNameSnapshot
```

## EstimateItem 保存に影響していないこと

API route の EstimateItem 作成 data は変更していない。

今回追加した field は `body.estimate.items[]` に乗るが、EstimateItem 保存では使われない。`estimateItemsLikeToRepairLineItemInputs()` を通じて RepairLineItem adapter だけが拾う。

## PricingRule.suggestedWorkName を維持したこと

既存の `PricingRule.suggestedWorkName` 候補欄と価格反映は維持した。

この Task では以下をしていない。

```txt
PricingRule 検索条件への構造化 field 追加
PricingRule 候補表示の大幅変更
suggestedWorkName 廃止
PricingRule 自動作成ロジック変更
```

## 部品行に出していないこと

構造化作業入力欄は技術料選択時だけ表示する。

交換部品行は引き続き `PartsMaster` 中心で扱う。

```txt
partsMasterId
grade
note1
note2
partRef
cousinsNumber
stockQuantity
```

`targetPartNameId` は LABOR 行の「作業対象部品」を示すための項目であり、PART 行の `partsMasterId` とは分けて扱う。

## relatedWorkLineItemId を触っていないこと

この Task では部品行と技術料行を紐づけていない。

```txt
relatedWorkLineItemId は現行どおり
自動紐づけなし
client temp id なし
二段階 insert なし
replaceRepairLineItems() 再設計なし
```

## 通常 Repair と PublicCase / B2C を混同していないこと

通常 Repair では部品行と技術料行を分ける。

```txt
技術料    交換技術料      10,000円
交換部品  ゼンマイ         5,000円
```

この Task では以下のような 1 行集約にはしない。

```txt
ゼンマイ交換    15,000円
```

これは将来の PublicCase / B2C 事例紹介用 Task で扱う。

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
EstimateItem 保存処理
PricingRule 検索ロジック
PricingRule.suggestedWorkName 互換動作
RepairWorkName seed
RepairWorkDetailMaster
relatedWorkLineItemId 紐づけ
RepairLineItem adapter の大幅変更
API route の大幅変更
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

画面起動確認:

```powershell
npm run dev -- -p 3000
-> sandbox 内では spawn EPERM
-> 承認付き実行では EPERM は解消し、確認用 timeout まで実行
```

## 次 Task 案

### 108-10C

構造化作業入力を master select 化する。

対象:

```txt
RepairWorkCategory 候補取得
RepairWorkAction 候補取得
PartNameMaster 候補取得
ID と snapshot の同時保存
```

### 108-11

PricingRule 候補取得に構造化条件を追加する。

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
