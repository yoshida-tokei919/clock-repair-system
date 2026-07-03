# Task 108-10AW: 外装PricingRule保存実装

## 目的

`external_labor` として保存される外装技術料の `RepairLineItemInput` を、外装専用条件の `PricingRule` として作成または更新する。

既存の内装PricingRule同期は維持し、外装交換部品の `part_external` と PartsMaster由来のPART行は対象外とする。

## 背景

108-10AVで外装価格候補取得helper `getExternalPricingRules()` を実装し、108-10AXで `RepairEntryForm` に `external_labor` 入力UIを追加した。

108-10AX時点では、外装LABORが内装PricingRuleとして誤同期されないよう、`syncPricingRulesFromRepairLineItems()` で外装LABORをskipしていた。今回、その暫定ガードを外装専用同期branchへ置き換えた。

## 変更内容

`src/lib/pricing-rules.ts` に以下を追加した。

- `isExternalLaborLine()`
- `buildExternalPricingRuleIdentity()`
- `syncExternalPricingRuleFromLineItem()`
- 外装LABORを外装専用同期へ振り分けるbranch

`syncPricingRulesFromRepairLineItems()` の既存内装処理は残し、外装LABORだけを先に外装専用helperへ渡す。

## 変更ファイル

- `src/lib/pricing-rules.ts`
- `docs/ai-tasks/108-10AW-implement-external-pricing-rule-save.md`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`

## 外装LABOR判定条件

次の順で判定する。

1. `item.lineType = LABOR`
2. `item.sourceCategory = external_labor` を優先
3. 補助判定として、`repairWorkCategoryId` が `RepairWorkCategory.repairType = EXTERNAL` のカテゴリIDに含まれる

`lineType = PART` は先にskipされるため、`part_external` とPartsMaster由来の部品行は外装PricingRule同期へ入らない。

## PricingRule保存条件

外装LABORであっても、次の条件がすべて揃う場合だけ保存する。

- `customerType` が `business` または `individual`
- `brandId` が正の整数
- `targetPartNameId` がある
- `repairWorkActionId` が正の整数
- `itemNameSnapshot` から `suggestedWorkName` を作れる
- `unitPrice > 0`

`targetPartNameId` は現行schemaどおり `String` の `PartNameMaster.id` として扱い、数値へ変換しない。

## identity key

外装PricingRuleのapp-level identityは次の条件とする。

- `customerType`
- `brandId`
- `modelId`
- `caliberId = null`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `detailLabel`
- `repairWorkNameId = null`

`findFirst({ orderBy: { id: "asc" } })` で完全一致を探し、存在すれば更新、存在しなければ作成する。価格違い、顧客区分違い、ブランド違い、モデル違い、部品違い、処置違いは別候補として残す。

`repairWorkCategoryId` は保存するが、外装価格候補の基本identityには含めない。

## price保存方針

- `unitPrice` を `minPrice` に保存
- 初期実装では `maxPrice = minPrice`
- `amount` は使わない
- `unitPrice <= 0`、空欄、非数は保存対象外
- 数量にかかわらず単価基準で保存する

通常の外装LABORは `quantity = 1` を想定する。数量が1以外でも合計額ではなく `unitPrice` を価格ルールへ保存する。

## modelId保存方針

- 案件に `modelId` がある場合は、そのモデル専用価格として保存
- 案件に `modelId` がない場合は、`modelId = null` の同ブランド共通価格として保存

モデル専用価格とブランド共通価格は別候補として扱う。

## caliberIdの扱い

外装PricingRuleでは `caliberId` を使わず、常に `null` で保存する。

movement Cal、base Cal、watch Cal、Cal fallbackは外装保存branchへ持ち込まない。

## 既存内装PricingRule保存への影響

既存内装LABORの同期本体は変更していない。

外装判定に該当しないLABORは、従来どおり `caliberId`、構造field、既存identity、legacy identityを使う内装同期へ進む。既存の `customerType` 正規化も維持する。

外装では `business` / `individual` の完全一致だけを許可し、`b2b` / `b2c` aliasは外装保存条件として採用しない。

## 検証結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功
- Playwright: 未実行。認証リダイレクトで既存smokeが失敗する既知事情があり、今回の保存helper変更では実行していない
- 手動画面確認: 未実行

## 今回触っていないもの

- schema
- migration
- seed
- RepairEntryForm
- 外装LABOR入力UI
- `getExternalPricingRules()` の候補取得仕様
- API route
- RepairLineItem保存処理
- PartsMaster検索
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- 顧客コメント表示

## 後続Task

- 外装PricingRule保存の画面・DB統合確認
- 外装detail / scopeのマスタ化要否の検討
- 外装PricingRule件数増加時の複合index検討
