# Task 108-10AG: exact high-confidence match 1件時の価格自動反映
作成日: 2026-06-22

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

RepairEntryForm の技術料入力で、作業カテゴリ / 対象部品 / 処置 / detail から高信頼一致の `PricingRule` が1件だけに絞れる場合に限り、価格欄へ自動反映する。
今回は最小実装であり、候補検索ロジックの大幅変更、UIデザイン変更、schema変更は行わない。

## 現状

108-10AD で RepairLineItem 保存時に `PricingRule` へ構造fieldが保存されるようになった。
108-10AE で `getPricingRules` が構造field / `customerType` を score / priority に使えるようになった。
108-10AF で RepairEntryForm から `getPricingRules` へ構造fieldを渡すようになった。

ただし、画面上では候補を手動クリックした場合だけ価格欄へ反映され、作業カテゴリ / 対象部品 / 処置を選んだだけでは価格欄は空のままだった。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AG-implement-pricing-rule-auto-fill-single-match.md`

## 実装内容

RepairEntryForm の技術料候補 `workOpts` に `PricingRule` の構造fieldを保持するようにした。
そのうえで、`workOpts` 更新後に高信頼一致候補を判定し、1件だけの場合に `newItemPrice` へ `minPrice` を自動反映する `useEffect` を追加した。

候補手動選択時の既存挙動は維持している。

## 高信頼一致条件

以下をすべて満たす候補だけを高信頼一致候補とする。

- `addItemCategory === "internal"`
- `newWorkCategoryId` が選択済み
- `newTargetPartNameId` が選択済み
- `newWorkActionId` が選択済み
- `PricingRule.repairWorkCategoryId` が `newWorkCategoryId` と一致
- `PricingRule.targetPartNameId` が `newTargetPartNameId` と一致
- `PricingRule.repairWorkActionId` が `newWorkActionId` と一致
- `newWorkDetailLabel` が入力されている場合だけ、`PricingRule.detailLabel` と一致
- `customerType` は exact match を優先する
- exact な `customerType` 候補がない場合だけ、rule 側 `customerType = null` の generic 候補を許容する
- 上記候補が1件だけ

構造field未分類の fallback 候補だけでは自動反映しない。
複数候補がある場合も自動反映しない。

## 手入力価格を上書きしないための制御

価格欄の手入力を検知する `newItemPriceManuallyEdited` を追加した。
ユーザーが価格欄を直接編集した場合は、それ以降の自動反映を止める。

また、候補を手動選択して価格が入った場合は、自動反映による上書き対象にしない。
自動反映済みの価格だけは、ユーザーが手入力していなければ次の高信頼1件に更新できる。

行追加後は入力欄とともに手入力フラグと自動反映元をリセットする。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- PricingRule 自動作成・更新処理
- `getPricingRules` の大幅変更
- 候補欄UIデザイン
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

- 候補表示に構造一致 / generic / Cal 種別などの meta を出すか判断する
- 高信頼一致の実データ確認後、generic 候補の扱いをさらに厳しくするか判断する
- 代表 PricingRule seed / 仮データ再生成を検討する
- `RepairLineItem.repairWorkNameId` 追加要否を判断する
