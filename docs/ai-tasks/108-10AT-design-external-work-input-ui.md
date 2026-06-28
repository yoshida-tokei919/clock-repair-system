# Task 108-10AT: 外装作業入力UI設計

## 目的

`RepairEntryForm` に、外装 LABOR（外装技術料行）を入力するための UI 方針を整理する。

今回は docs-only とし、schema / migration / seed / src / API / UI / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力は短期では既存 `RepairLineItem` に接続する方針にした。

108-10AP で、外装も内装と同様に `PricingRule` 候補選択式にする方針へ修正した。

108-10AR / 108-10AS で、外装 PricingRule 候補取得は内装の Cal fallback と分け、外装専用 helper `getExternalPricingRules()` を作る方針にした。

## 固定前提

外装 PricingRule の必須条件:

- `customerType`
- `brandId`
- `targetPartNameId`
- `repairWorkActionId`

外装 PricingRule の任意条件:

- `modelId`

外装 PricingRule で使わない条件:

- `caliberId`

`targetPartNameId` は `PartNameMaster` のIDであり、型は `number` とする。文字列 key が必要な場合は `targetPartNameKey` として別概念にする。

`customerType` は `business` / `individual` のどちらかを必須とし、フォーム側 filter だけでなく DB where に入れる。`customerType = null` fallback は禁止する。

`brandId` は必須とし、`brandId = null` fallback は行わない。

`modelId` は任意とし、ある場合はモデル専用価格を優先する。モデル専用価格がない場合、または `modelId` が未指定の場合は、`modelId = null` の同ブランド共通価格を候補にする。

## 現状確認

`RepairEntryForm` の入力モードは、現在は主に以下の2系統である。

- `internal`: 技術料。`RepairWorkCategory` / `PartNameMaster` / `RepairWorkAction` と `PricingRule` 候補を使う。
- `part_external`: 交換部品。`PartsMaster` 検索結果を使う。

既存の `LineItem.category` には `external` が存在するが、入力 UI の選択肢として外装 LABOR はまだ分離されていない。

内装 LABOR では、作業カテゴリ、対象部品名、処置、詳細、顧客区分、Cal 情報を使って `getPricingRules()` を呼び、候補を表示する。

`part_external` は PART 行であり、実部品、在庫、仕入先、価格、写真などを扱う `PartsMaster` 系である。外装 LABOR とは責務が違う。

## UI導線案

### 案A: `addItemCategory` に `external_labor` を追加する

推奨案。

入力UI上のモードとして `external_labor` を追加する。

```ts
type AddItemCategory =
  | "internal"
  | "external_labor"
  | "part_external";
```

保存 payload の `lineType` は `LABOR` とする。既存の `LineItem.category` は、短期では `external` に map するか、UI都合の `external_labor` を型へ追加するかを実装時に選ぶ。ただし `part_external` とは明確に分ける。

利点:

- 内装 LABOR、外装 LABOR、外装 PART の3系統が UI 上で明確になる。
- `part_external` に技術料を混ぜずに済む。
- 既存の内装 LABOR の価格候補 UI や手入力価格保護を流用しやすい。
- `getExternalPricingRules()` への分岐を局所化しやすい。

懸念:

- `addItemCategory` と `LineItem.category` の対応を実装時に決める必要がある。
- 外装カテゴリを `RepairWorkCategory` と `PartCategoryMaster` のどちらで表示するかを、初期実装で明確にする必要がある。

### 案B: `repairType` + `lineType` へ一般化する

概念的にはきれいな案。

例:

```ts
repairType: "INTERNAL" | "EXTERNAL";
lineType: "LABOR" | "PART";
```

利点:

- 内装/外装と LABOR/PART の直交関係を表現しやすい。
- 将来、外装 PART 以外の内装 PART や追加系統も扱いやすい。

懸念:

- 現行 `RepairEntryForm` の分岐や保存 payload を広く触る可能性がある。
- 短期実装としては変更範囲が大きい。

### 案C: `part_external` に技術料も混ぜる

非推奨。

`part_external` は `PartsMaster` を起点にした PART 行である。外装 LABOR は `PricingRule` と `PartNameMaster.targetPartNameId` を起点にした技術料行なので、同じモードに混ぜると検索軸、保存 snapshot、帳票表示、価格候補の意味が曖昧になる。

## 推奨結論

短期実装では、案Aの `external_labor` 入力モード追加を推奨する。

UI上は以下の3択に分ける。

- 内装技術料: `internal`
- 外装技術料: `external_labor`
- 外装交換部品: `part_external`

`external_labor` は `RepairLineItem.lineType = LABOR` として保存する。`part_external` は `RepairLineItem.lineType = PART` として保存する。

## `part_external` との違い

`external_labor`:

- LABOR 行
- `PricingRule` 候補選択式
- `targetPartNameId` は `PartNameMaster.id`
- `repairWorkActionId` は `RepairWorkAction.id`
- `PartsMaster` は使わない
- 技術料、加工費、仕上げ費などを表す

`part_external`:

- PART 行
- `PartsMaster` 検索を使う
- 実部品、在庫、仕入先、写真、部品価格を扱う
- `PricingRule` 技術料候補は使わない

## 入力項目

外装 LABOR の必須入力:

- 顧客区分: `customerType`
- ブランド: `brandId`
- 外装カテゴリ
- 対象部品名: `targetPartNameId`
- 処置: `repairWorkActionId`
- 価格候補、または手入力価格

外装 LABOR の任意入力:

- モデル: `modelId`
- 処置詳細: `detailLabel`
- 明細メモ

外装 LABOR で使わない入力:

- `caliberId`
- `partsMasterId`
- movement Cal / base Cal / watch Cal fallback

## ドリルダウン順

推奨する入力順:

1. 顧客区分を選ぶ。
2. ブランドを選ぶ。
3. モデルを任意で選ぶ。
4. 外装カテゴリを選ぶ。
5. 外装部品名を選ぶ。
6. 処置を選ぶ。
7. 処置詳細を任意で入力する。
8. `getExternalPricingRules()` で候補を取得する。
9. 候補価格を選ぶ、または価格を手入力する。
10. LABOR 明細として追加する。

外装カテゴリと部品名は、短期では既存 `PartCategoryMaster` / `PartNameMaster` の外装定義を使う。外装作業カテゴリとして `RepairWorkCategory.repairType = EXTERNAL` を使うかどうかは、後続実装で seed とUI要件を合わせて判断する。

## 外装PricingRule候補表示

候補取得条件:

- `customerType` がない場合は取得しない。
- `brandId` がない場合は取得しない。
- `targetPartNameId` がない場合は取得しない。
- `repairWorkActionId` がない場合は取得しない。

`modelId` がある場合:

- 第1候補: `customerType + brandId + modelId + targetPartNameId + repairWorkActionId`
- 第2候補: `customerType + brandId + modelId = null + targetPartNameId + repairWorkActionId`

`modelId` がない場合:

- `customerType + brandId + modelId = null + targetPartNameId + repairWorkActionId` の同ブランド共通価格だけを取得する。

候補ラベル:

- `モデル専用`
- `ブランド共通`
- `B2B`
- `B2C`

display dedupe は 108-10AS の方針どおり、`suggestedWorkName + minPrice` を基本にする。同一表示名、同一価格でモデル専用価格とブランド共通価格が重なる場合は、モデル専用価格を代表にする。同一表示名でも価格違いは別候補として残す。

手入力価格がある場合は、候補再取得で勝手に上書きしない。既存の `newItemPriceManuallyEdited` / `autoFilledPricingRuleIdRef` と同じ考え方を外装 LABOR にも適用する。

## 表示名方針

外装 LABOR の明細表示名は、対象部品名、処置、処置詳細から生成する。

例:

- ガラス交換
- サイクロプスレンズ接着
- ケース仕上げ
- ブレス簡易仕上げ
- 尾錠ロウ付け

B2B用表示名では、必要に応じて `技術料` を付ける。

例:

- ガラス交換技術料
- サイクロプスレンズ接着技術料
- ケース仕上げ技術料

仕上げ系など、業務上 `技術料` を付けない方が自然な表示がある場合は、後続Taskで例外方針を決める。

## RepairLineItem snapshot保存方針

外装 LABOR 追加時は、既存 `RepairLineItem` の snapshot field を使う。

保存候補:

- `lineType = LABOR`
- `pricingRuleId`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabelSnapshot`
- `itemNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`
- `unitPrice`
- `quantity`
- `amount`
- `showPriceB2b`
- `showPriceB2c`
- `sortOrder`

`targetPartNameId` は `PartNameMaster.id` であり、`PartsMaster.id` ではない。外装 LABOR では `partsMasterId` を保存しない。

外装属性 field、たとえば位置、素材、サイズ、色、バリエーション、作業範囲は今回の UI 設計では正式 field 化しない。必要になった場合は後続Taskで schema 変更の要否を検討する。

## schema変更要否

短期の外装 LABOR 入力 UI は、既存 `RepairLineItem` と既存 `PricingRule` field で開始できる見込みである。

初期実装では schema 変更なしを推奨する。

ただし、以下を正式に持たせる場合は後続で schema 変更を検討する。

- 外装 LABOR 専用の `lineCategory`
- 外装属性 field
- 外装作業カテゴリの保存粒度
- 外装用表示名生成ルールの永続化

## 最小実装案

1. `RepairEntryForm` の入力モードに `external_labor` を追加する。
2. 外装 LABOR 用に、外装カテゴリと外装部品名を選ぶ UI を追加する。
3. `RepairWorkAction` は内装/外装共有の action を使う。
4. `external_labor` 選択時だけ `getExternalPricingRules()` を呼ぶ。
5. `customerType` / `brandId` / `targetPartNameId` / `repairWorkActionId` が揃わない場合は候補取得しない。
6. `modelId` があればモデル専用価格とブランド共通価格を取得する。
7. `modelId` がなければブランド共通価格のみ取得する。
8. Cal fallback と PartsMaster 検索は外装 LABOR では使わない。
9. 選択した PricingRule から価格、表示名、snapshot を埋める。
10. 手入力価格は候補再取得で上書きしない。
11. 保存時は LABOR 行として `RepairLineItem` に送る。

## 今回やらないこと

- schema変更
- migration追加
- seed変更
- src変更
- API変更
- UI実装
- PricingRule実装変更
- RepairEntryForm変更
- PartsMaster検索変更
- 帳票 / PDF / LINE / 共有ページ / PublicCase変更

## 未決事項

- UI上の `external_labor` を `LineItem.category = external` に map するか、`LineItem.category` に `external_labor` を追加するか。
- 外装カテゴリのUIを `PartCategoryMaster` ベースにするか、`RepairWorkCategory.repairType = EXTERNAL` ベースにするか。
- 仕上げ系の表示名に `技術料` を付けるかどうか。
- 外装属性 field をいつ正式化するか。
- 外装 LABOR の候補が0件だった場合の手入力 UX。

## 後続Task

- 108-10AU: 外装PricingRule保存設計
- 108-10AV: 外装PricingRule候補取得実装
- 108-10AW: 外装PricingRule保存実装
- 108-10AX: 外装作業入力UI実装

## 検証結果

docs-only のため、TypeScript / Prisma / seed は実行していない。

変更対象はこの設計docと canonical guide の追記のみとする。
