# Task 108-10AP: 外装PricingRule方針修正・ドリルダウン価格候補設計

## 目的

外装作業入力でも `PricingRule` を使い、内装と同じように価格候補を選択できる方針へ修正する。

今回は docs 設計・方針修正のみとし、schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL では、外装作業入力を `RepairLineItem` へ接続する設計を作成した。

108-10AM では、外装カテゴリ・外装部品名 seed 候補を整理した。

108-10AN では、`APPROVED` だった以下2件の外装部品名を seed 追加した。

- `cyclops_lens` / サイクロプスレンズ / `case_glass`
- `tang_buckle` / 尾錠 / `bracelet_band`

108-10AO では、外装処置・処置詳細 seed 候補を設計した。

ただし、108-10AL / 108-10AO 時点の「外装 PricingRule は初期に使わない」「外装技術料は手入力を基本」「PricingRule は将来の参考価格候補」という方針は 108-10AP で撤回する。

## 方針変更の内容

撤回する方針:

- 外装 PricingRule は不要
- 外装価格候補は不要
- 外装技術料は完全手入力のみ
- 外装 PricingRule は参考価格候補に留める

108-10AP 以降の方針:

- 外装も `PricingRule` を使う。
- 外装も内装と同じように価格候補を表示し、候補選択または手入力できるようにする。
- 外装の基本条件は `customerType + brandId + targetPartNameId + repairWorkActionId` とする。
- `customerType = null` fallback は禁止する。
- 価格違いは内装と同様、別候補として保持する。
- 実装は後続 Task で扱う。

## 外装ドリルダウン価格候補の基本設計

外装 LABOR 追加時の価格候補は、以下の順に絞り込む。

1. 顧客種別
2. ブランド
3. 外装部品名
4. 処置
5. 価格候補

顧客種別:

- B2B: `customerType = business`
- B2C: `customerType = individual`

基本条件:

- `brandId`
- `targetPartNameId`
- `repairWorkActionId`
- `customerType`

表示イメージ:

- ROLEX × ガラス × 交換 × B2B
- OMEGA × リューズ × 交換 × B2B
- SEIKO × ガラス × 交換 × B2C
- ROLEX × 尾錠 × 交換 × B2C

## 内装PricingRuleとの違い

内装では、movement maker / movement caliber / base caliber / watch caliber の優先順位が重要になる。

外装では、ムーブメント Cal を基本条件にしない。外装価格はおおむねブランド、外装部品名、処置、顧客種別で決まるため、`brandId + targetPartNameId + repairWorkActionId + customerType` を短期の基本条件とする。

外装でも `RepairLineItem` snapshot を表示の正本とする。`PricingRule` は価格候補であり、帳票 / 共有ページ / PublicCase へ直接表示する正本ではない。

## PricingRule条件案

### 短期案

現行 `PricingRule` の既存 field を最大限使う。

- `customerType`
- `brandId`
- `repairWorkNameId`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`

短期方針:

- 外装も `PricingRule` を使う。
- 外装作業名は「部品名 + 処置」から生成する。
- `repairWorkNameId` を使える場合は使う。
- 外装 `RepairWorkName` が未整備の場合は、`targetPartNameId + repairWorkActionId + suggestedWorkName` を使う。
- `brandId` は外装では基本条件とする。
- `customerType` は必須とする。
- `targetPartNameId` は外装部品名の `PartNameMaster.id` とする。
- `repairWorkActionId` は共有 `RepairWorkAction.id` とする。

### 中期案

必要になれば、以下の条件追加を検討する。

- `modelId`
- `ref`
- `detailLabel`
- `material`
- `size`
- `variant`
- `exteriorAttributeSnapshot`

今回 schema 変更はしない。現行 schema にない条件は中期検討として残す。

## 候補取得優先順位

### 完全一致

最優先:

- `customerType`
- `brandId`
- `targetPartNameId`
- `repairWorkActionId`

### ブランドなし fallback

許可候補:

- `customerType`
- `targetPartNameId`
- `repairWorkActionId`
- `brandId = null`

初期実装では、ブランド一致のみから始めてもよい。ブランドなし fallback を有効にする場合は、候補ラベルで「ブランド共通」などを明示し、ブランド一致候補より低い優先順位にする。

### 処置なし fallback

原則しない。

理由: ガラス交換、ガラス取付、ガラス研磨では価格の意味が違うため。

### 部品なし fallback

原則しない。

理由: リューズ交換とガラス交換では価格の意味が違うため。

### customerTypeなし fallback

禁止する。

理由:

- B2B/B2C 価格混在を防ぐ。
- `customerType = null` は旧データ / 不正データ扱い。
- 通常 dropdown に `customerType = null` 候補を表示しない。

## PricingRule保存方針

外装も将来的には `PricingRule` 保存対象にする。

保存 identity の短期案:

- `customerType`
- `brandId`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`

方針:

- `customerType` は必須。
- `brandId + targetPartNameId + repairWorkActionId + customerType` を基本条件にする。
- 価格違いは別候補として保持する。
- 既存の「同じ表示名でも価格違い候補は残す」方針を外装にも適用する。
- hand-edited price は候補再取得や構造 field 変更で自動上書きしない。
- 候補を手動選択した後も、別条件へ変わっただけで勝手に価格を置き換えない。

今回、保存実装はしない。

## UI方針

今回 UI 実装はしない。ただし、将来の外装 LABOR 追加 UI は以下を想定する。

1. 顧客種別を選択
2. ブランドを選択
3. 外装カテゴリを選択
4. 外装部品名を選択
5. 処置を選択
6. 価格候補を表示
7. 候補選択、または手入力
8. `RepairLineItem` へ snapshot 保存

UI不要ではない。後続 Task で扱う。

## 今回修正したdocs

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AL-design-external-work-repair-line-item-integration.md`
- `docs/ai-tasks/108-10AO-design-external-repair-action-detail-seed-candidates.md`

## 今回やらないこと

- schema変更
- migration追加
- seed実装
- UI実装
- API変更
- PricingRule実装変更
- RepairEntryForm変更
- PartsMaster検索変更
- 帳票 / PDF / LINE / 共有ページ / PublicCase変更
- 外装処置seed実装
- 処置詳細マスタ作成

## 後続Task

- 108-10AQ: 外装処置 seed実装
- 108-10AR: 外装PricingRule schema/API影響調査
- 108-10AS: 外装PricingRule候補取得設計
- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計
