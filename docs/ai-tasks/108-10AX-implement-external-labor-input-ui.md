# Task 108-10AX: 外装修理技術料入力 UI 実装

作成日: 2026-07-01

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

`RepairEntryForm` の修理明細入力で、既存の `internal` 技術料と `part_external` 交換部品とは別に、外装修理技術料を入力できる `external_labor` モードを追加する。

外装修理技術料は `RepairLineItem.lineType = LABOR` として保存し、交換部品の `part_external` は引き続き `RepairLineItem.lineType = PART` として扱う。

## 背景

108-10AT から 108-10AV までで、外装 LABOR の入力設計、PricingRule 取得方針、外装 PricingRule 候補取得 helper が整理された。今回の実装では、保存スキーマや migration は変更せず、既存の `RepairLineItem` snapshot field と `PartNameMaster` / `RepairWorkAction` を使って最小の UI 接続を行った。

## 変更内容

- `RepairEntryForm` の明細追加カテゴリに `external_labor` を追加した。
- `external_labor` 選択時は LABOR 入力として扱い、作業カテゴリ、対象部品、処置、detail、単価、数量を入力できるようにした。
- `external_labor` の対象部品は `PartNameMaster.id` を `targetPartNameId` に保持する。型は既存 schema どおり `string`。
- `external_labor` の保存 payload は `type = labor` になり、`repairWorkCategoryId`、`repairWorkActionId`、`targetPartNameId`、各 snapshot を保持する。
- `part_external` は交換部品入力のまま維持し、PartsMaster 検索、発注連携、`lineType = PART` の流れを維持した。
- `getExternalRepairPricingRules` server action を追加し、既存 `getExternalPricingRules()` helper を UI から呼べるようにした。
- `external_labor` では、条件が揃った場合だけ外装 PricingRule 候補を表示し、候補選択または単一候補の自動反映で `itemName` / `unitPrice` に反映する。
- `syncPricingRulesFromRepairLineItems` は `external_labor` と `RepairWorkCategory.repairType = EXTERNAL` の LABOR 行をスキップする暫定ガードを追加した。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `src/actions/master-actions.ts`
- `src/lib/repair-line-items.ts`
- `src/lib/pricing-rules.ts`
- `docs/ai-tasks/108-10AX-implement-external-labor-input-ui.md`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`

## external_labor の最小仕様

- UI カテゴリ: `external_labor`
- 保存上の行種別: `lineType = LABOR`
- 対象部品 ID: `targetPartNameId: string | null`
- 対象部品参照元: `PartNameMaster`
- 処置 ID: `repairWorkActionId`
- 表示名: 対象部品 snapshot、処置 snapshot、detail snapshot から生成
- 数量: 既存 LABOR と同じ扱い。初期値は `1`
- PartsMaster: 使用しない
- `caliberId`: 使用しない

## part_external との分離

`part_external` は交換部品として扱うため、保存上は `lineType = PART` になる。PartsMaster 検索、在庫/発注連携、部品表示、部品検索パネルは既存どおり `part_external` 側だけに残した。

`external_labor` は外装技術料なので、PartsMaster 検索には接続しない。

## PricingRule 候補表示

実装済み。`external_labor` では `customerType`、`brandId`、`targetPartNameId`、`repairWorkActionId` が揃った場合に、`getExternalRepairPricingRules()` 経由で既存 `getExternalPricingRules()` を呼ぶ。

PricingRule 保存同期は今回実装していない。`syncPricingRulesFromRepairLineItems` には、外装 LABOR を内部 PricingRule として誤同期しないためのスキップガードのみ追加した。

## syncPricingRulesFromRepairLineItems への影響

既存の内部 LABOR 同期処理は維持した。

今回の実装では、`RepairLineItemInput.sourceCategory = external_labor` または `RepairWorkCategory.repairType = EXTERNAL` の LABOR 行は同期対象外にする。外装 PricingRule 保存同期は 108-10AW 以降の別 Task で扱う。

## 検証結果

- `npx tsc --noEmit --pretty false --incremental false`: pass
- `npx playwright test`: fail
  - 初回は sandbox 内で `spawn EPERM`。
  - escalation 後は 3 tests 実行。`/repairs` と `/repairs/new` が `/login?callbackUrl=...` に redirect され、既存 smoke test の URL/主要操作表示期待に合わず失敗。
  - 外装 LABOR 入力実装に対する assertion failure ではなく、認証前提の smoke test failure と判断。

## 今回触っていないもの

- schema
- migration
- seed
- PartsMaster 検索仕様
- 既存 `getPricingRules`
- `getExternalPricingRules` helper 本体
- PricingRule 保存同期の本実装
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- 顧客コメント表示

## 後続 Task

- 108-10AW: 外装 LABOR から PricingRule を保存/更新する専用同期 branch の実装
- 外装 detail / scope を将来 master 化するかの検討
- `RepairLineItem` に外装専用属性 field を追加するかの検討
