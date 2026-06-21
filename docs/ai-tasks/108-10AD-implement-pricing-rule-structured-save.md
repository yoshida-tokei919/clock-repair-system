# Task 108-10AD: PricingRule 構造field保存 実装

作成日: 2026-06-20

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

RepairLineItem 保存時に自動作成・更新される PricingRule へ、LABOR 行の作業構造 field を保存する。

今回は保存側のみの最小実装とし、候補検索、候補表示、金額自動反映、UI は変更しない。

## 現状

RepairEntryForm の LABOR 行では、作業カテゴリ / 対象部品 / 処置 / detail が `estimate.items` に入り、`estimateItemsLikeToRepairLineItemInputs` で RepairLineItem 用に正規化されている。

正規化後の RepairLineItemInput には以下がある。

- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabelSnapshot`
- `itemNameSnapshot`
- `unitPrice`
- `pricingRuleId`

一方、現行の Repair 新規作成 API / 更新 API の PricingRule 自動作成・更新は、`suggestedWorkName` / `brandId` / `modelId` / `caliberId` / `minPrice` / `maxPrice` のみを使い、構造 field を保存していなかった。

`RepairLineItem.repairWorkNameId` は現時点では schema に存在しないため、今回 PricingRule へ自動保存できる `repairWorkNameId` はない。

## 変更ファイル

- `src/lib/pricing-rules.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AD-implement-pricing-rule-structured-save.md`

## 実装内容

`src/lib/pricing-rules.ts` を追加し、`syncPricingRulesFromRepairLineItems` を実装した。

Repair 新規作成 API と Repair 更新 API は、EstimateItem 由来の生データではなく、正規化後の `repairLineItemInputs` から PricingRule を同期する。

同期の基本方針:

- LABOR 行のみ対象にする。
- `brandId` がない場合は同期しない。
- 価格は `unitPrice` から `minPrice` / `maxPrice` に保存する。
- `itemNameSnapshot` を `suggestedWorkName` として維持する。
- 既存の `pricingRuleId` がある場合は、その PricingRule を更新する。
- exact な構造 field まで一致する PricingRule があれば価格だけ更新する。
- 同名・同条件で構造 field が空の legacy PricingRule があれば、削除せず構造 field を補完更新する。
- exact / legacy のどちらもなければ、新規 PricingRule を作成する。

DB の業務 `@@unique` は追加していない。nullable field が多いため、同一判定はアプリ側 helper に閉じている。

## PricingRule へ保存する field

今回保存対象にした field:

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

`detailLabel` は `RepairLineItemInput.detailLabelSnapshot` から保存する。

`repairWorkNameId` は PricingRule schema には存在するが、RepairLineItem 側にまだ存在せず、今回の保存元にないため自動設定していない。既存 PricingRule を `pricingRuleId` で更新する場合も、既存の `repairWorkNameId` を不用意に null 上書きしない。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- DB データ
- RepairEntryForm UI
- getPricingRules
- 候補表示ロジック
- 金額自動反映ロジック
- RepairLineItem の DB schema
- PartsMaster 検索系
- getPartsMatched
- PartsSearchPanel
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase

## 注意点

- 既存の未分類 PricingRule は削除しない。
- 同名・同条件かつ構造 field が空の legacy PricingRule は、次回保存時に構造 field が補完される。
- `targetPartNameId` は LABOR 行の対象部品であり、PartNameMaster 由来。PART 行の `partsMasterId` とは別物。
- 今回は保存側のみなので、保存後すぐに候補表示や金額自動反映が変わるわけではない。
- 古い PricingRule 同期処理は実行されないようにし、新 helper を同期経路にした。

## 検証結果

以下を実行する。

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

結果は完了報告に記載する。

## 後続Task

- 108-10AE: getPricingRules の構造 field query / score 設計・実装
- 108-10AF: RepairEntryForm の候補表示・価格反映対応
- 108-10AG: 代表 PricingRule seed / 仮データ再生成の要否判断
- RepairLineItem に `repairWorkNameId` を持たせるかの再検討
