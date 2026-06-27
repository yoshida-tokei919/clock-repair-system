# Task 108-10AR: 外装PricingRule schema/API影響調査

## 目的

外装 `PricingRule` 実装の前に、現行 schema / helper / API / `RepairEntryForm` で、外装価格候補の基本条件をどこまで扱えるか調査する。

今回は調査 docs のみとし、schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力を `RepairLineItem` へ接続する設計を作成した。

108-10AM / 108-10AN で、外装カテゴリ・外装部品名 seed 候補を整理し、`cyclops_lens` / サイクロプスレンズ、`tang_buckle` / 尾錠を追加した。

108-10AO / 108-10AQ で、外装処置 seed 候補を整理し、外装処置9件を `RepairWorkAction` seed へ追加した。

108-10AP で、外装も `PricingRule` 候補選択式にする方針へ変更した。

## 固定前提

- 顧客は必ず B2B / B2C のどちらか。
- B2B は `customerType = business`。
- B2C は `customerType = individual`。
- `customerType = null` は旧データ / 不正データ扱い。
- `customerType = null` fallback は禁止。
- 外装 PricingRule の必須条件は `customerType + brandId + targetPartNameId + repairWorkActionId`。
- 外装 PricingRule の任意条件として `modelId` を初期から使う。
- 外装 PricingRule では `caliberId` を使わない。
- 外装 PricingRule では `brandId = null` fallback を使わない。
- `RepairWorkAction` は内装 / 外装で共有し、`side` / `repairType` は追加しない。
- `RepairWorkCategory` は `repairType` で INTERNAL / EXTERNAL を分ける。
- `targetPartNameId` は `PartNameMaster.id` であり、`PartsMaster.id` ではない。

## PricingRule schema 現状

現行 `PricingRule` には、外装基本条件に必要な field が存在する。

| field | 現状 | 外装基本条件での扱い |
| --- | --- | --- |
| `customerType` | `String?` | 必須条件として使う。ただし schema 上は nullable |
| `brandId` | `Int?` | 外装の基本条件として使う |
| `targetPartNameId` | `String?` | 外装部品名の `PartNameMaster.id` として使う |
| `repairWorkActionId` | `Int?` | 処置 `RepairWorkAction.id` として使う |
| `repairWorkNameId` | `Int?` | 短期では必須にしない |
| `suggestedWorkName` | `String` | 部品名 + 処置の表示名候補として使える |
| `minPrice` / `maxPrice` | `Int` | 価格候補として使う |
| `modelId` | `Int?` | 外装でも初期から任意条件として使う。モデル専用価格を優先し、なければ `modelId = null` のブランド共通価格を候補にする |
| `caliberId` | `Int?` | 内装専用の検索軸。外装 PricingRule では使わない |
| `detailLabel` | `String?` | 中期以降の条件候補 |

unique 制約はない。価格ルールの業務 identity はアプリ側 helper で扱う方針である。

既存 index:

- `brandId, modelId, caliberId`
- `brandId, customerType`
- `repairWorkNameId`
- `brandId, repairWorkNameId`
- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `repairWorkCategoryId, repairWorkActionId, targetPartNameId`
- `brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId`

`customerType + brandId + modelId + targetPartNameId + repairWorkActionId` の完全一致専用 index はない。ただし短期の件数では既存 index と DB where / アプリ側 filter で開始可能と判断する。件数が増えたら `customerType, brandId, modelId, targetPartNameId, repairWorkActionId` の index 追加を検討する。

## getPricingRules() 現状

実体は `src/actions/master-actions.ts` の server action。

現在の引数:

```ts
getPricingRules(
  brandId?: number,
  modelId?: number,
  caliberId?: number,
  options?: {
    repairWorkNameId?: number | null;
    repairWorkCategoryId?: number | null;
    targetPartNameId?: string | null;
    repairWorkActionId?: number | null;
    detailLabel?: string | null;
    customerType?: string | null;
  }
)
```

現在の DB 検索:

- `brandId` が必須。未指定なら `[]`。
- `brandId` は完全一致。
- `modelId` があれば `modelId = value OR modelId = null`。
- `caliberId` があれば `caliberId = value OR caliberId = null`。
- `options` は DB where には使わず、取得後の score に使う。

108-10AR の確定方針では、この共通 `getPricingRules()` を外装向けにそのまま拡張しない。内装と外装で検索軸が違うため、後続実装では internal / external で取得関数を分ける。

- internal: 既存 `getPricingRules()` 系を維持し、movement Cal / base Cal / watch Cal など Cal 中心の fallback を使う。
- external: 外装専用 helper として `getExternalPricingRules()` を作る。

`getExternalPricingRules()` の目的:

- 内装の Cal fallback と外装のブランド / モデル / 部品 / 処置検索を混ぜない。
- 外装では `caliberId` を使わない。
- `customerType` を DB where に入れ、B2B/B2C 価格混在を防ぐ。
- 外装独自の候補優先順位を明確にする。

現在の score:

- `customerType`
- `repairWorkNameId`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `modelId`
- `caliberId`

外装基本条件への対応:

- `customerType + brandId + modelId + targetPartNameId + repairWorkActionId` は、現行 schema field で表現できる。
- `repairWorkNameId` は必須ではない。
- 外装では `modelId` を任意条件として使う。
- 外装では `caliberId` を渡さない。
- 外装では `customerType` をフォーム側 filter だけでなく DB where に入れる推奨とする。
- 価格違いは `suggestedWorkName + minPrice` の表示 dedupe 方針により別候補として残せる。

制約:

- 外装では `brandId = null` fallback を使わないため、ブランド未指定候補を取得する必要はない。
- 現行 `getPricingRules()` は `customerType` を DB where で絞っていないため、外装向けには専用 helper で where 条件化する必要がある。
- 現行 `getPricingRules()` は処置なし fallback / 部品なし fallback を DB where で防いでいない。外装向けの `getExternalPricingRules()` では `targetPartNameId` と `repairWorkActionId` も DB where に入れ、処置なし / 部品なし fallback を防ぐ。

## RepairEntryForm 候補取得フロー

現在の候補取得は `addItemCategory === 'internal'` のときだけ `PricingRule` を取得する。

内部技術料の場合:

- `brand` から `brandId` を解決する。
- `model` から `modelId` を解決する。
- movement Cal / base Cal / watch Cal の順で複数回 `getPricingRules()` を呼ぶ。
- `newWorkCategoryId`
- `newTargetPartNameId`
- `newWorkActionId`
- `newWorkDetailLabel`
- `customerTypeSelection`
- `expectedWorkName`

を lookup options として渡す。

外装または交換部品側の場合:

- 現在の `addItemCategory` state は `internal | part_external`。
- `addItemCategory !== 'internal'` では PricingRule 取得ではなく `getPartsMatched()` に流れる。
- `LineItem.category` union には `external` があるが、追加 UI の選択肢としてはまだ使っていない。
- 追加時の構造 field 保存も `addItemCategory === 'internal'` 限定である。

外装実装で必要になる点:

- 外装 LABOR 用の `addItemCategory = external` などを追加する。
- 外装 LABOR の場合も `newWorkCategoryId` / `newTargetPartNameId` / `newWorkActionId` / `detailLabel` を LineItem に載せる。
- 外装 LABOR の候補取得では `getExternalPricingRules()` を使う。
- 外装 LABOR の候補取得では `customerType` / `brandId` / `targetPartNameId` / `repairWorkActionId` を必須にし、`modelId` は任意で渡す。
- 外装 LABOR の候補取得では、`modelId` ありのモデル専用価格を優先し、なければ `modelId = null` のブランド共通価格を候補にする。
- 外装では movement Cal / base Cal / watch Cal fallback を使わない。
- `customerTypeSelection` は既存 UI で `business` / `individual` を持っており、候補取得へ渡せる。
- `brandId` は作成中の watch brand から取得できる。既存フォームでは `brandOpts` から `brand` 文字列に対応する id を解決している。
- hand-edited price を上書きしない既存制御は、外装 auto-fill branch を作る場合も流用できる。

## PricingRule 保存処理

保存同期は `src/lib/pricing-rules.ts` の `syncPricingRulesFromRepairLineItems()`。

Repair create / update API は、`estimateItemsLikeToRepairLineItemInputs()` と `replaceRepairLineItems()` の後に `syncPricingRulesFromRepairLineItems()` を呼んでいる。

現行保存処理:

- `brandId` がなければ同期を skip。
- `customerType` を `business` / `individual` に正規化できなければ throw。
- `lineType !== LABOR` は skip。
- `suggestedWorkName` は `itemNameSnapshot`。
- `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabelSnapshot` を `PricingRule` 構造 field へ保存する。
- `repairWorkNameId` は常に `null`。
- `minPrice` / `maxPrice` は `unitPrice` と同じ値で保存する。
- identity には `customerType` と `minPrice/maxPrice` を含む。
- `pricingRuleId` 指定時も、既存 rule の `customerType` と価格が一致する場合だけ update する。
- `PART` 行は skip されるため、`PartsMaster` / PART 行とは混ざらない。

外装 LABOR 行が `RepairLineItemInput` として正しく構造 field を持てば、保存側は schema 変更なしで外装 PricingRule を作成 / 更新できる。

注意点:

- 現行保存 identity は `modelId` / `caliberId` も含む。外装では `modelId` は任意条件として使うが、`caliberId` は使わない。外装 LABOR 行では `caliberId` を保存 identity から外す、または null として扱う分岐が必要になる可能性がある。
- 現行同期関数は line item が内装か外装かを判定できない。`RepairLineItem` 自体に `repairType` はないため、`repairWorkCategory.repairType` を参照するか、入力モード側で保存方針を分ける必要がある。

## RepairWorkName との関係

短期では外装 `RepairWorkName` seed は必須ではない。

理由:

- `PricingRule.repairWorkNameId` は nullable。
- `syncPricingRulesFromRepairLineItems()` は現時点でも `repairWorkNameId = null` で保存している。
- `getPricingRules()` は `repairWorkNameId` を score に使えるが、必須条件にはしていない。
- 外装は `targetPartNameId + repairWorkActionId + suggestedWorkName` で候補化できる。

推奨:

- 短期: `repairWorkNameId` を必須にしない。
- 外装: `targetPartNameId + repairWorkActionId + suggestedWorkName` で候補化する。
- 中期: 候補数や表示名統制が必要になったら外装 `RepairWorkName` seed を設計する。

後から `repairWorkNameId` を追加しても、既存 rule は nullable のまま残せるため破綻しにくい。ただし、将来 `repairWorkNameId` を使う場合は、既存 `suggestedWorkName` ベースの rule との重複整理が必要になる。

## fallback方針の実装可否

108-10AR 確定方針:

- 第1候補: `customerType + brandId + modelId + targetPartNameId + repairWorkActionId`
- 第2候補: `customerType + brandId + modelId = null + targetPartNameId + repairWorkActionId`
- ブランドなし fallback: しない
- 処置なし fallback: 原則しない
- 部品なし fallback: 原則しない
- `customerType = null` fallback: 禁止
- `caliberId` による外装候補取得: しない

実装可否:

- モデル専用価格とブランド共通価格は現行 field で可能。
- `getExternalPricingRules()` で `customerType` / `brandId` / `targetPartNameId` / `repairWorkActionId` を DB where に入れる。
- `modelId` がある場合は `modelId = value OR modelId = null` を取得し、モデル専用価格を優先する。
- `brandId = null` は取得しない。
- `customerType = null` は取得しない。
- `repairWorkActionId = null` / `targetPartNameId = null` は取得しない。
- `caliberId` は外装 where に入れない。

推奨:

- 初期実装から `modelId` を任意条件として使う。
- `modelId` あり候補を第1候補、`modelId = null` の同ブランド共通価格を第2候補にする。
- `brandId = null` の汎用外装価格候補は作らない、取得しない。
- `customerType = null` の候補は作らない、取得しない。

## schema変更要否

短期実装では schema 変更なしで進められる。

理由:

- 外装基本条件の `customerType` / `brandId` / `targetPartNameId` / `repairWorkActionId` は既存 `PricingRule` に存在する。
- 外装任意条件の `modelId` も既存 `PricingRule` に存在する。
- `targetPartNameId` は `PartNameMaster.id` を参照できる。
- `repairWorkActionId` は共有 `RepairWorkAction.id` を参照できる。
- `repairWorkNameId` は nullable なので必須ではない。
- `detailLabel` は既存 nullable field として存在する。
- 外装では `caliberId` を使わないが、既存 field を未使用にするだけなので schema 変更は不要。

中期検討:

- 件数増加時の `@@index([customerType, brandId, modelId, targetPartNameId, repairWorkActionId])`
- 外装属性を正式条件化する場合の `material` / `size` / `variant` / `ref` / `exteriorAttributeSnapshot`
- 外装 LABOR 判定を明細単体で行いたい場合の `RepairLineItem.repairType` または `workSide`

## API変更要否

Repair create / update API の保存処理は、外装 LABOR 行が構造 field を持って payload に入れば、現行の `syncPricingRulesFromRepairLineItems()` まで到達できる。

ただし後続実装では、以下の変更または確認が必要。

- `RepairEntryForm` から外装 LABOR 行を `type = labor` として送る。
- 外装 LABOR 行にも `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabelSnapshot` を含める。
- 外装保存時に watch `modelId` を任意条件として PricingRule identity に含め、`caliberId` は外装では null 扱いにする方針を設計する。
- `getPricingRules()` は server action であり REST API ではない。後続実装では外装候補取得 branch から `getExternalPricingRules()` を呼ぶ。

## 実装時の最小変更案

1. `RepairEntryForm` に外装 LABOR 追加モードを追加する。
2. 外装 LABOR モードでは `PricingRule` 候補取得へ進み、`getPartsMatched()` には流さない。
3. 外装専用 helper として `getExternalPricingRules()` を作る。
4. `getExternalPricingRules()` は `customerType`、`brandId`、`targetPartNameId`、`repairWorkActionId` を必須引数にし、`modelId` を任意引数にする。
5. 外装では movement Cal / base Cal / watch Cal fallback を使わない。
6. 外装 LABOR 行を LineItem に追加するとき、構造 field と snapshot を internal と同様に載せる。
7. `getExternalPricingRules()` は `customerType` を DB where に入れる。
8. `getExternalPricingRules()` は `modelId` あり候補を優先し、`modelId = null` の同ブランド共通価格を第2候補にする。
9. `syncPricingRulesFromRepairLineItems()` またはその呼び出し側で外装判定を追加し、外装 LABOR では `modelId` を任意条件として保存し、`caliberId` は null にする。
10. 外装カテゴリ / 外装部品名候補取得は、既存 `getRepairWorkCategories()` / `getInternalPartNameMasters()` が INTERNAL 寄りなので、別関数または引数で EXTERNAL を取れるようにする。

## リスク

- 現行 `getPricingRules()` は `customerType` を DB where で絞らないため、外装では専用 helper を作らないと B2B/B2C 混在リスクが残る。
- 現行保存同期は外装か内装かを直接判定できず、watch `caliberId` が外装 PricingRule に入る可能性がある。
- `RepairEntryForm` の追加モードは `internal | part_external` の2択で、外装 LABOR UI がまだない。
- `getRepairWorkCategories()` は INTERNAL のみ取得するため、外装カテゴリ候補取得の追加が必要。
- `getInternalPartNameMasters()` は内装対象部品名用であり、外装 LABOR の `targetPartNameId` 候補取得にはそのまま使えない。
- `modelId` あり候補と `modelId = null` のブランド共通候補の優先順位を誤ると、モデル専用価格があるのに共通価格を選ばせるリスクがある。
- 価格候補の `suggestedWorkName` が「部品名 + 処置」で安定しないと、表示 dedupe や保存 identity がばらける。

## 108-10AR追加確定方針

外装 PricingRule の短期実装方針は以下で確定する。

- schema変更なしで開始できる見込み。
- `getPricingRules()` は internal / external で分岐する。
- 外装専用 helper として `getExternalPricingRules()` を作る。
- `customerType` は DB where で絞る。
- 外装では `brandId` 必須。
- 外装では `modelId` を任意条件として使う。
- 外装では `modelId` あり候補を優先する。
- `modelId` なしの場合は `modelId = null` のブランド共通価格を候補にする。
- 外装では `targetPartNameId` 必須。
- 外装では `repairWorkActionId` 必須。
- 外装では `caliberId` は使わない。
- `brandId = null` fallback は使わない。
- `customerType = null` fallback は禁止。
- `repairWorkActionId` なし fallback はしない。
- `targetPartNameId` なし fallback はしない。

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

- 108-10AS: 外装PricingRule候補取得設計
- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計
- 108-10AV: 外装PricingRule候補取得実装
- 108-10AW: 外装PricingRule保存実装
