# Task 108-10AE: getPricingRules 構造field / customerType 対応
作成日: 2026-06-21

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

108-10AD で `PricingRule` に保存されるようになった LABOR 行の構造fieldを、価格候補取得側の並び替えに使えるようにする。
今回は候補取得ロジックの最小実装であり、RepairEntryForm UI 連携、構造field変更時の再取得、金額自動反映は対象外とする。

## 現状

`getPricingRules` は `brandId` / `modelId` / `caliberId` を中心に候補を取得し、model / caliber の一致度で並び替えていた。
108-10AD 後は `PricingRule` に `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` が入るようになったが、取得側ではまだこれらを評価していなかった。

RepairEntryForm では 108-10X の Cal 優先順に従い、movement Cal / base Cal / watch Cal / Cal なしで `getPricingRules` を複数回呼び、`PricingRule.id` で重複排除している。

## 変更ファイル

- `src/actions/master-actions.ts`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AE-implement-pricing-rule-structured-lookup.md`

## 実装内容

`getPricingRules` の4引数目に optional な lookup options を追加した。
既存の `getPricingRules(brandId, modelId, caliberId)` 呼び出しはそのまま動作する。

取得条件は既存の brand / model / caliber ベースを維持し、構造fieldで exact filter はしない。
取得した候補に対して score を計算し、既存の model / caliber 優先度に customerType と構造fieldの一致度を加える。

## 追加した引数

`PricingRuleLookupOptions`:

- `repairWorkNameId?: number | null`
- `repairWorkCategoryId?: number | null`
- `targetPartNameId?: string | null`
- `repairWorkActionId?: number | null`
- `detailLabel?: string | null`
- `customerType?: string | null`

`repairWorkNameId` は現時点で呼び出し側から渡されていないが、schema 側の field に合わせて optional として受け取れるようにした。

## score / priority 方針

既存の score は維持する。

- `caliberId` 完全一致: 高評価
- `modelId` 完全一致: 評価
- Cal / model が指定されていない、または PricingRule 側が未設定: fallback

追加した構造fieldは、引数が渡された場合だけ score に反映する。

- `repairWorkNameId` 完全一致を高評価し、null は fallback として残す
- `repairWorkCategoryId` 完全一致を評価し、null は fallback として残す
- `targetPartNameId` 完全一致を評価し、null は fallback として残す
- `repairWorkActionId` 完全一致を評価し、null は fallback として残す
- 不一致は候補から除外せず、軽い penalty とする

このため、構造fieldが null の既存 PricingRule も候補から完全には消えない。

## customerType 方針

`customerType` は完全一致を generic/null より優先する。
ただし今回の最小実装では exact filter にせず、既存候補を残したうえで score によって優先順位を調整する。

## detailLabel 方針

`detailLabel` は空白を正規化して比較する。
完全一致を高評価し、PricingRule 側が未設定の場合は fallback として残す。
異なる detailLabel は候補から除外せず、軽い penalty とする。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- PricingRule 自動作成・更新処理
- RepairEntryForm UI
- 構造field変更時の候補再取得
- 金額自動反映
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

- 108-10AF: RepairEntryForm から構造field / customerType を `getPricingRules` に渡す
- 108-10AF 以降: 構造field変更時の候補再取得
- 108-10AF 以降: 候補選択時または候補確定時の金額反映 UX 整理
- 必要に応じて代表 PricingRule seed / 仮データ再生成の検討
