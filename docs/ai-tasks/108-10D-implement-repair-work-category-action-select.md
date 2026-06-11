# Task 108-10D: RepairWorkCategory / RepairWorkAction select 化の最小実装

## 目的

Task 108-10B で追加した `RepairEntryForm` の構造化作業入力 UI は、snapshot text 中心だった。

この Task では範囲を小さく切り、以下だけを実装した。

```txt
作業カテゴリ
-> RepairWorkCategory select 化

処置
-> RepairWorkAction select 化

対象部品
-> 今回は手入力のまま

detail
-> 任意テキストのまま
```

## 変更ファイル

```txt
src/actions/master-actions.ts
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10D-implement-repair-work-category-action-select.md
```

## 実装内容

### 追加した master action

`src/actions/master-actions.ts` に以下を追加した。

```txt
getRepairWorkCategories()
getRepairWorkActions()
```

`getRepairWorkCategories()`:

```txt
RepairWorkCategory から取得
repairType = INTERNAL
isActive = true
sortOrder / displayName / name 順
select 用の最小形へ map
```

`getRepairWorkActions()`:

```txt
RepairWorkAction から取得
isActive = true
sortOrder / displayName / name 順
select 用の最小形へ map
```

返却値:

```ts
{
  id: number;
  name: string;
  key: string;
  sortOrder: number;
}
```

### RepairEntryForm での取得

`RepairEntryForm.tsx` で上記 action を import し、初期表示時に一度取得する。

```txt
repairWorkCategoryOptions
repairWorkActionOptions
```

取得に失敗した場合は、既存 UI を壊さないように空配列へフォールバックする。

### RepairWorkCategory select 化

108-10B で追加した折りたたみ補助欄の `作業カテゴリ` を text input から select に変更した。

選択時に `LineItem` / payload へ入る値:

```txt
repairWorkCategoryId
categoryNameSnapshot
```

### RepairWorkAction select 化

108-10B で追加した折りたたみ補助欄の `処置` を text input から select に変更した。

選択時に `LineItem` / payload へ入る値:

```txt
repairWorkActionId
actionNameSnapshot
```

## UI がどう変わったか

技術料選択時だけ表示される折りたたみ補助欄の中で、以下が select になった。

```txt
作業カテゴリ: select
処置: select
```

以下は今回も text input のまま。

```txt
対象部品
detail
```

交換部品選択時には構造化作業入力欄を表示しない方針を維持した。

## 対象部品を select 化していないこと

この Task では `PartNameMaster` の対象部品 select 化はしていない。

現行どおり:

```txt
targetPartNameId: null
targetPartNameSnapshot: 手入力テキスト
```

理由:

```txt
108-10D は作業カテゴリ / 処置だけの最小実装
PartNameMaster の取得と内装部品フィルタは次段階
PART 行の partsMasterId と LABOR 行の targetPartNameId を混同しないため
```

## payload へ追加 / 維持した field

作業カテゴリ select:

```txt
repairWorkCategoryId
categoryNameSnapshot
```

処置 select:

```txt
repairWorkActionId
actionNameSnapshot
```

対象部品は手入力のまま:

```txt
targetPartNameId: null
targetPartNameSnapshot
```

detail は任意テキストのまま:

```txt
detailLabelSnapshot
```

## EstimateItem 保存に影響していないこと

API route は変更していない。

`body.estimate.items[]` に optional field が乗るだけで、EstimateItem 保存 data には使われない。RepairLineItem adapter が拾う既存設計を維持した。

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
PartNameMaster select 化
対象部品 DB 取得
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
-> 承認付き 3000 は EADDRINUSE

npm run dev -- -p 3001
-> 承認付き実行では確認用 timeout まで実行
```

## 次 Task 案

### 108-10E

対象部品を `PartNameMaster` select 化する。

対象:

```txt
PartNameMaster 取得 action
内装部品フィルタ
targetPartNameId
targetPartNameSnapshot
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
