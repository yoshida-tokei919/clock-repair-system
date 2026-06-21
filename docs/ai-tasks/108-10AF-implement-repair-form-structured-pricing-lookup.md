# Task 108-10AF: RepairEntryForm から構造fieldを getPricingRules へ渡す
作成日: 2026-06-21

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

108-10AE で `getPricingRules` が構造field / `customerType` を score / priority に使えるようになったため、RepairEntryForm の技術料候補取得から現在選択中の構造fieldを渡す。
今回は候補の並び順へ反映する最小実装であり、金額自動反映は行わない。

## 現状

RepairEntryForm の技術料候補取得は 108-10X の Cal 優先順に従い、movement Cal / base Cal / watch Cal / Cal なしで `getPricingRules` を複数回呼んでいた。
ただし `newWorkCategoryId` / `newTargetPartNameId` / `newWorkActionId` / `newWorkDetailLabel` は `getPricingRules` に渡していなかったため、作業カテゴリ、対象部品、処置、detail を選んでも候補順位へ反映されていなかった。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AF-implement-repair-form-structured-pricing-lookup.md`

## 実装内容

RepairEntryForm の `addItemCategory === "internal"` の候補取得で、`getPricingRules` の4引数目へ lookup options を渡すようにした。
構造field変更時にも候補順位が更新されるよう、既存の候補取得 `useEffect` の依存配列へ必要な入力状態を追加した。

## getPricingRules へ渡すようにした field

- `repairWorkCategoryId`: `newWorkCategoryId` を number 化した値、未選択時は `null`
- `targetPartNameId`: `newTargetPartNameId`、未選択時は `null`
- `repairWorkActionId`: `newWorkActionId` を number 化した値、未選択時は `null`
- `detailLabel`: `newWorkDetailLabel` を空白正規化した値、空なら `null`
- `customerType`: `isB2B ? "business" : "individual"`

`repairWorkNameId` は現時点で RepairEntryForm から安定して渡せないため、今回も渡していない。

## Cal 優先取得との関係

108-10X の Cal 優先順は維持した。

1. movement Cal
2. base Cal
3. watch Cal
4. Cal なし

各 Cal グループの取得時に同じ lookup options を渡す。
取得後は従来どおり `PricingRule.id` で重複排除し、各グループ内では 108-10AE の score / priority による並び順を使う。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- PricingRule 自動作成・更新処理
- `getPricingRules` 本体の大幅変更
- RepairEntryForm の見た目
- 候補選択時の金額反映仕様
- 構造field選択だけでの金額自動反映
- exact match 1件時の自動入力
- RepairLineItem DB schema
- PartsMaster 検索系
- `getPartsMatched`
- PartsSearchPanel
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 検証結果

以下を実行する。

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

結果は完了報告に記載する。

## 後続Task

- exact match 1件時の金額自動反映を行うか判断する
- 候補表示に構造一致 / fallback / Cal 種別などの meta を出すか判断する
- 代表 PricingRule seed / 仮データ再生成を検討する
- `RepairLineItem.repairWorkNameId` を追加する必要があるか判断する
