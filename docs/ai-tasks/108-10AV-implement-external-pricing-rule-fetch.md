# Task 108-10AV: 外装PricingRule候補取得実装

## 目的

外装LABOR向けの価格候補取得 helper として、`getExternalPricingRules()` を実装する。

内装の Cal fallback 中心の `getPricingRules()` とは検索軸を分け、外装では顧客区分、ブランド、対象部品名、処置を必須条件として候補を取得する。

## 背景

108-10AR / 108-10AS で、外装PricingRule候補取得は内装の `getPricingRules()` をそのまま拡張せず、外装専用 helper を作る方針にした。

108-10AT では外装LABOR入力UIの設計、108-10AU では外装PricingRule保存方針を整理した。今回のTaskではUI/API/保存処理には接続せず、取得 helper のみを先行実装した。

## 実装内容

`src/lib/pricing-rules.ts` に以下を追加した。

- `ExternalPricingRuleCustomerType`
- `GetExternalPricingRulesParams`
- `getExternalPricingRules()`
- 外装専用の `customerType` 正規化
- 外装候補の優先順位 sort
- `suggestedWorkName + minPrice` の display dedupe

引数は現行schemaに合わせ、`targetPartNameId` を `String` の `PartNameMaster.id` として扱う。

```ts
type GetExternalPricingRulesParams = {
  customerType: "business" | "individual";
  brandId: number;
  modelId?: number | null;
  targetPartNameId: string;
  repairWorkActionId: number;
};
```

## DB where

必須条件:

- `customerType`
- `brandId`
- `targetPartNameId`
- `repairWorkActionId`

`modelId` がある場合:

- `modelId = 指定値`
- `modelId = null`

`modelId` がない場合:

- `modelId = null`

外装候補取得では `caliberId` を where に入れない。`brandId = null`、`customerType = null`、`targetPartNameId = null`、`repairWorkActionId = null` の fallback も行わない。

必須条件が欠ける場合や `customerType` が `business` / `individual` 以外の場合は、例外を投げずに `[]` を返す。

## 候補優先順位

取得後の並び順は helper 内で安定化する。

1. `modelId` 完全一致
2. `modelId = null`
3. `minPrice` 昇順
4. `updatedAt` 降順
5. `createdAt` 降順
6. `id` 昇順

## display dedupe

`suggestedWorkName + minPrice` が同じ候補は1件にまとめる。

モデル専用価格とブランド共通価格が同一表示名・同一価格で重複する場合は、モデル専用価格を代表として残す。価格が異なる候補は別候補として残す。

## candidate label

今回の helper は返却shapeを壊さず、`PricingRule[]` を返す。UIで必要になる候補ラベルは、後続Taskで `modelId` と `customerType` を見て表示用metaとして生成する想定とする。

## 変更ファイル

- `src/lib/pricing-rules.ts`
- `docs/ai-tasks/108-10AV-implement-external-pricing-rule-fetch.md`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`

## 既存処理への影響

既存の `src/actions/master-actions.ts` の `getPricingRules()` は変更していない。

内装の movement Cal / base Cal / watch Cal fallback、既存のRepairEntryForm候補取得、API、保存処理、帳票、共有ページ、PublicCase には接続していない。

## 触っていないもの

- schema
- migration
- seed
- API
- UI
- RepairEntryForm
- RepairLineItem保存
- PricingRule保存 / sync
- PartsMaster検索
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase

## 検証結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功
- Playwright画面確認: 未実行。今回の変更はUI未接続の helper / docs のみ。

## 後続Task

- 108-10AW: 外装PricingRule保存実装
- 108-10AX: 外装作業入力UI実装
- 108-10AY: 外装PricingRule保存後の重複候補表示検証
