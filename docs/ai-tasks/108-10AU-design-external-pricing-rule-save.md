# Task 108-10AU: 外装PricingRule保存設計

## 目的

外装 LABOR（外装技術料行）を保存したときに、`RepairLineItem` から `PricingRule` へどう作成 / 更新するかを設計する。

今回は docs 設計のみとし、schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力を `RepairLineItem` へ接続する方針を作成した。

108-10AP で、外装も `PricingRule` 候補選択式にする方針へ変更した。

108-10AR で、外装 PricingRule は短期なら schema 変更なしで開始できる見込みと確認した。

108-10AS で、外装候補取得は内装の Cal fallback と分け、外装専用 `getExternalPricingRules()` を作る方針にした。

108-10AT で、外装 LABOR は `part_external` に混ぜず、`external_labor` 入力モードとして分ける方針にした。

## 固定前提

外装 PricingRule 保存時の必須条件:

- `customerType`
- `brandId`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`

外装 PricingRule 保存時の任意条件:

- `modelId`
- `maxPrice`
- `notes`
- `detailLabel`

外装 PricingRule 保存で使わない条件:

- `caliberId`
- movement Cal
- base Cal
- PartsMaster ID

`customerType` は `business` / `individual` のみ許可する。`customerType = null`、`generic`、`unclassified`、B2B/B2C以外は保存対象外にする。

外装 PricingRule は `brandId` 必須とする。`brandId = null` の汎用外装価格ルールは作らない。

`modelId` は任意とする。案件に `modelId` があればモデル専用価格として保存し、案件に `modelId` がなければ `modelId = null` の同ブランド共通価格として保存する。

`targetPartNameId` は `PartNameMaster.id` であり、`PartsMaster.id` ではない。現行 schema では `PartNameMaster.id` / `PricingRule.targetPartNameId` / `RepairLineItem.targetPartNameId` は `String` である。後続実装では現行 schema 型に合わせる必要がある。文字列 key を扱う場合は `targetPartNameKey` として別概念にする。

`repairWorkActionId` は必須とする。処置なし fallback / 処置なし保存は行わない。

## 現在の保存処理確認

### RepairLineItem保存経路

`RepairEntryForm` は保存時に `payload.estimate.items` を作る。

- `i.category.includes('part')` の場合は `type = part`
- それ以外は `type = labor`

PART 行では、`repairWorkCategoryId` / `repairWorkActionId` / `targetPartNameId` / `detailLabelSnapshot` などの構造 field を null にする。

LABOR 行では、上記の構造 field を payload に残す。

Repair create / update API では、`estimateItemsLikeToRepairLineItemInputs()` で `RepairLineItemInput[]` に変換し、`replaceRepairLineItems()` で `RepairLineItem` を replace 保存する。

その後、`syncPricingRulesFromRepairLineItems()` を呼ぶ。

### create API

`src/app/api/repairs/route.ts` では、見積明細保存後に以下を実行する。

```ts
const repairLineItemInputs = estimateItemsLikeToRepairLineItemInputs(estimateItems).map((item) => ({
  ...item,
  relatedWorkLineItemId: null,
}));

await replaceRepairLineItems(repair.id, repairLineItemInputs, tx);

await syncPricingRulesFromRepairLineItems(tx, {
  brandId: brand.id,
  modelId,
  caliberId,
  customerType: requireCustomerType(customer.type),
  items: repairLineItemInputs,
});
```

### update API

`src/app/api/repairs/[id]/route.ts` でも、見積明細保存後に同様に `replaceRepairLineItems()` と `syncPricingRulesFromRepairLineItems()` を呼ぶ。

```ts
await syncPricingRulesFromRepairLineItems(tx, {
  brandId,
  modelId,
  caliberId,
  customerType,
  items: repairLineItemInputs,
});
```

### syncPricingRulesFromRepairLineItems の現在挙動

`src/lib/pricing-rules.ts` の現行挙動:

- `brandId` が正の数でなければ同期を skip。
- `customerType` を `business` / `individual` に正規化できなければ throw。
- `item.lineType !== "LABOR"` は skip。
- `suggestedWorkName` は `item.itemNameSnapshot`。
- `price` は `item.unitPrice` を non-negative integer に正規化。
- `minPrice = price`、`maxPrice = price`。
- `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabelSnapshot` を `PricingRule` へ保存する。
- `repairWorkNameId` は常に `null`。
- `pricingRuleId` がある場合でも、既存 rule の `customerType` と `minPrice/maxPrice` が一致する場合だけ update する。
- 完全一致 identity を `findFirst` し、あれば update、なければ legacy identity を探し、なければ create する。

### 現在の identity key

現行の完全一致 identity:

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `repairWorkNameId = null`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

現行の legacy identity:

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `repairWorkNameId = null`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- 構造 field はすべて null

### 現在の注意点

現行同期関数は `lineType = LABOR` をすべて PricingRule 保存対象にする。内装 LABOR と外装 LABOR を判定する branch はまだない。

現行同期関数は API から渡された `caliberId` をそのまま `PricingRule.caliberId` に保存する。外装 LABOR では `caliberId` を使わないため、後続実装では外装 branch で `caliberId = null` に寄せる必要がある。

現行同期関数は `unitPrice = 0` でも `minPrice = 0` として保存し得る。外装 PricingRule 保存では、0円 / 空欄 / 未確定価格は保存対象外にする方針を追加する。

## 外装保存対象の判定設計

外装 LABOR だけを PricingRule 保存対象にする。

保存対象条件:

- `lineType = LABOR`
- 外装 LABOR と判定できる
- `customerType` が `business` / `individual`
- `brandId` がある
- `targetPartNameId` がある
- `repairWorkActionId` がある
- `suggestedWorkName` を作れる
- `unitPrice > 0`

外装 LABOR 判定の短期候補:

- UI 入力モードが `external_labor`
- `LineItem.category = external` または `external_labor` 相当
- `repairWorkCategoryId` から `RepairWorkCategory.repairType = EXTERNAL` を確認できる
- 外装カテゴリ / 外装部品名 UI から作った snapshot を持つ

短期実装では、`RepairLineItem` 自体に `repairType` がないため、以下のどちらかを選ぶ必要がある。

1. UI / payload 側で外装 LABOR と分かる mode 情報を同期関数へ渡す。
2. 同期関数側で `repairWorkCategoryId` を参照し、`RepairWorkCategory.repairType = EXTERNAL` を確認する。

既存内装への影響を避けるため、推奨は同期関数に外装専用 branch を追加し、外装判定できる行だけを外装保存条件で処理すること。

除外条件:

- `lineType = PART`
- `part_external`
- `partsMasterId` 由来の交換部品行
- 内装 LABOR
- `customerType` なし
- `brandId` なし
- `targetPartNameId` なし
- `repairWorkActionId` なし
- `unitPrice <= 0`
- `caliberId` しか条件がないもの

## identity key（一意判定条件）設計

外装 PricingRule の推奨 identity:

- `customerType`
- `brandId`
- `modelId`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `detailLabel`
- `caliberId = null`

価格違いを別候補として残すため、`minPrice` / `maxPrice` は identity に含める。

同じ条件・同じ作業名・同じ価格は完全重複として増やさない。

同じ条件・同じ作業名でも価格が違う場合は、別候補として残す。

`modelId` あり / `modelId = null` は別候補として扱う。

`customerType = business` / `customerType = individual` は別候補として扱う。

`brandId` 違いは別候補として扱う。

現行 schema には `PricingRule` の unique 制約がないため、DB upsert ではなくアプリ側の `findFirst -> update/create` を続ける。完全重複を避けるため、`orderBy: { id: "asc" }` で最古の既存 rule を代表として update する。重複整理や unique 制約追加は後続Taskで別途検討する。

## suggestedWorkName（候補作業名）生成設計

保存時の `suggestedWorkName` は、原則として `RepairLineItem.itemNameSnapshot` を使う。

理由:

- `RepairLineItem` が帳票 / 共有ページ / PublicCase 前段の snapshot 正本である。
- UI で候補選択または手入力した最終的な作業名を保持できる。
- `PartNameMaster` や `RepairWorkAction` の後変更に影響されない。

外装 LABOR 追加時に `itemNameSnapshot` を作る標準生成方針:

```txt
targetPartNameSnapshot + detailLabelSnapshot + actionNameSnapshot
```

例:

- ガラス交換
- サイクロプスレンズ接着
- リューズ折れ込み巻芯除去
- ケース仕上げ
- ブレスレット簡易仕上げ
- 尾錠ロウ付け

B2B 表示名では `技術料` を付けてもよいが、`PricingRule.suggestedWorkName` は候補名として使うため、短期では `itemNameSnapshot` と一致させることを推奨する。

`detailLabel` は、同じ部品・同じ処置でも価格が変わる場合があるため、保存 identity に含める。`suggestedWorkName` に detail を含めるかは表示名生成側で決めるが、`detailLabel` field にも保存して検索・重複判定に使えるようにする。

## price（金額）保存設計

外装 LABOR では、`quantity = 1` の技術料行を基本とし、`unitPrice` を `minPrice` に保存する。

推奨:

- `unitPrice > 0` の場合だけ保存対象。
- `minPrice = unitPrice`。
- `maxPrice = unitPrice`。
- `quantity = 1` を標準とする。
- `quantity != 1` の LABOR 行は、初期実装では保存対象外にするか、`unitPrice` 基準で保存する。ただし docs 方針としては保存対象外を推奨する。
- `amount` は数量込みの小計であり、PricingRule 候補価格には使わない。
- 0円 / 空欄 / 未確定価格は保存対象外。

税の扱い:

- 既存 `PricingRule.minPrice/maxPrice` と同じく、フォーム上の技術料単価と同じ税抜価格として扱う。
- 税込総額や `Estimate.totalAmount` は PricingRule 保存に使わない。

## modelId（モデルID）あり/なし保存設計

案件に `modelId` がある場合:

- モデル専用価格として `modelId = 案件modelId` で保存する。

案件に `modelId` がない場合:

- 同ブランド共通価格として `modelId = null` で保存する。

初期実装では、ユーザーが意図的に「この価格をブランド共通として保存」する UI は作らない。保存方針は「案件の `modelId` があればモデル専用、なければブランド共通」で開始する。

将来、モデル専用価格が増えすぎる、または同ブランド共通価格として育てたい運用が必要になった場合に、`ブランド共通価格として保存` のチェックを検討する。

## customerType（顧客区分）保存設計

保存時の customerType は修理案件の `Customer.type`、または `RepairEntryForm` の `customerTypeSelection` から確定した `business` / `individual` を使う。

create / update API では、現行通り `requireCustomerType()` で `business` / `individual` 以外をエラーにする。

外装 PricingRule 保存でも以下を維持する。

- `business` / `individual` 以外は保存しない。
- `customerType = null` の PricingRule は作らない。
- B2B/B2C の価格は別候補として扱う。
- `pricingRuleId` 指定時も、既存 rule の `customerType` が違う場合は上書きしない。

## 既存内装PricingRule保存への影響

内装 LABOR の既存保存条件は維持する。

内装:

- Cal 中心の既存保存条件を維持する。
- API から渡る `caliberId` を使う。
- `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` も保存する。
- `customerType` は必須。
- 価格違いは別候補として残す。

外装:

- 外装専用 branch で扱う。
- `caliberId` は常に null にする。
- `customerType` / `brandId` / `modelId` / `targetPartNameId` / `repairWorkActionId` を保存条件にする。
- `part_external` / PART 行 / PartsMaster 行は保存対象外。

共通処理化しすぎると、内装の Cal fallback / 保存条件と外装の brand-model-part-action 条件が混ざるため、後続実装では `syncInternalPricingRuleFromLineItem` と `syncExternalPricingRuleFromLineItem` のように小さく分けることを推奨する。

帳票 / PDF / LINE / 共有ページ / PublicCase は `RepairLineItem` / `EstimateItem` snapshot を表示元にしており、PricingRule 保存 branch の追加では直接変更しない。

## schema変更要否

短期実装では schema 変更なしで開始できる見込み。

既存 `PricingRule` にある field:

- `customerType`
- `brandId`
- `modelId`
- `caliberId`
- `targetPartNameId`
- `repairWorkActionId`
- `repairWorkCategoryId`
- `detailLabel`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `notes`
- `createdAt`
- `updatedAt`

外装では `caliberId` を使わず null にする。

既存 index:

- `brandId, modelId, caliberId`
- `brandId, customerType`
- `repairWorkActionId`
- `targetPartNameId`
- `repairWorkCategoryId, repairWorkActionId, targetPartNameId`
- `brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId`

初期件数では既存 index で開始し、性能問題が出たら以下の index 追加を後続 migration Task で検討する。

```prisma
@@index([customerType, brandId, modelId, targetPartNameId, repairWorkActionId])
```

unique 制約は短期では追加しない。現行と同じくアプリ側 identity で完全重複を避ける。

## 今回やらないこと

- schema変更
- migration追加
- seed変更
- UI実装
- API実装変更
- PricingRule実装変更
- RepairEntryForm変更
- PartsMaster検索変更
- 帳票 / PDF / LINE / 共有ページ / PublicCase変更
- 外装PricingRule候補取得実装
- 外装PricingRule保存実装

## 後続Task

- 108-10AV: 外装PricingRule候補取得実装
- 108-10AW: 外装PricingRule保存実装
- 108-10AX: 外装作業入力UI実装
- 108-10AY: 外装PricingRule保存後の重複/候補表示検証

## 検証結果

docs-only のため、TypeScript / Prisma / seed は実行していない。

変更対象はこの設計docと canonical guide の追記のみとする。
