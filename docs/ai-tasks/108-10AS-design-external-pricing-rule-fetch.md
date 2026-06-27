# Task 108-10AS: 外装PricingRule候補取得設計

## 目的

外装 `PricingRule` 候補取得を、後続実装できる粒度まで設計する。

今回は docs 設計のみとし、schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AP で、外装も内装と同じように `PricingRule` 候補選択式にする方針へ変更した。

108-10AR で、外装 PricingRule は短期なら schema 変更なしで開始できる見込みと確認した。また、外装候補取得は内装の Cal fallback と分け、外装専用 helper `getExternalPricingRules()` を作る方針にした。

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

許可する fallback:

- `modelId = null` の同ブランド共通価格

禁止する fallback:

- `brandId = null`
- `customerType = null`
- `targetPartNameId = null`
- `repairWorkActionId = null`
- 外装での `caliberId`

## getPricingRules 分岐設計

### 案A: `getPricingRules()` に `mode` 引数を追加

例:

```ts
getPricingRules({
  mode: "internal" | "external",
  ...
})
```

利点:

- 呼び出し口を1つにできる。
- 将来、UI 側から mode だけ切り替えやすい。

懸念:

- 現行 `getPricingRules(brandId, modelId, caliberId, options)` の呼び出しを大きく変える。
- 内装の Cal fallback と外装の brand/model/part/action 検索が同じ関数内で混ざりやすい。
- 外装では `customerType` を DB where に入れるが、内装では現行 score / filter の経緯があり、責務が膨らみやすい。

### 案B: 既存 `getPricingRules()` を残し、wrapper を作る

例:

```ts
getInternalPricingRules(...)
getExternalPricingRules(...)
```

利点:

- 内装 / 外装の呼び分けは明確。
- wrapper 側で既存関数を使い回せる。

懸念:

- 外装で必要な DB where、特に `customerType` / `targetPartNameId` / `repairWorkActionId` の必須絞り込みが既存関数にない。
- wrapper が既存関数の広い結果を後段 filter するだけだと、B2B/B2C 混在防止の目的が弱い。

### 案C: 既存 `getPricingRules()` を内装向けとして維持し、外装専用 `getExternalPricingRules()` を新設

利点:

- 既存内装候補取得を壊しにくい。
- 外装では `customerType` / `brandId` / `targetPartNameId` / `repairWorkActionId` を DB where で必須にできる。
- 外装では `caliberId` を関数引数に持たせず、Cal fallback を混ぜない設計にできる。
- `modelId` あり候補と `modelId = null` 候補の優先順位を外装専用に定義できる。

懸念:

- 呼び出し側は internal / external で使う関数を切り替える必要がある。

## 推奨案

案Cを推奨する。

短期実装では、既存 `getPricingRules()` は内装向けの Cal 中心候補取得として維持する。外装向けには `getExternalPricingRules()` を新設し、DB where と並び順を外装専用にする。

将来、呼び出し口を統一したくなった場合のみ、上位 wrapper として `getPricingRulesByMode()` のような関数を検討する。

## getExternalPricingRules 引数設計

推奨 signature:

```ts
type ExternalPricingRuleCustomerType = "business" | "individual";

type GetExternalPricingRulesParams = {
  customerType: ExternalPricingRuleCustomerType;
  brandId: number;
  modelId?: number | null;
  targetPartNameId: number;
  repairWorkActionId: number;
};

async function getExternalPricingRules(params: GetExternalPricingRulesParams): Promise<PricingRule[]>
```

引数方針:

- `customerType` は必須。`business` / `individual` 以外は受け付けない。
- `brandId` は必須。
- `modelId` は任意。
- `targetPartNameId` は必須。
- `repairWorkActionId` は必須。
- `caliberId` は受け取らない。
- `brandId = null` / `targetPartNameId = null` / `repairWorkActionId = null` を fallback 条件にしない。

`targetPartNameId` は `PartNameMaster` のIDを指す。文字列 key を扱う必要がある場合は、`targetPartNameId` ではなく `targetPartNameKey` として別概念にする。

## DB where 設計

`modelId` がある場合:

```ts
where: {
  customerType,
  brandId,
  targetPartNameId,
  repairWorkActionId,
  caliberId: null,
  OR: [
    { modelId },
    { modelId: null },
  ],
}
```

`modelId` がない場合:

```ts
where: {
  customerType,
  brandId,
  modelId: null,
  targetPartNameId,
  repairWorkActionId,
  caliberId: null,
}
```

設計意図:

- `customerType` は DB where で絞る。
- `brandId` は必ず指定する。
- `targetPartNameId` と `repairWorkActionId` は必ず指定する。
- `modelId` があるときだけ、モデル専用価格と同ブランド共通価格を同時に取得する。
- `modelId` がないときは、同ブランド共通価格だけを取得する。
- 外装では `caliberId` を使わない。保存側でも外装 `PricingRule.caliberId` は `null` に寄せる前提にする。

## 候補取得優先順位

候補は以下の順で並べる。

1. `modelId` 完全一致
2. `modelId = null` の同ブランド共通価格
3. `minPrice` 昇順
4. `maxPrice` 昇順
5. `updatedAt` 降順、または `createdAt` 降順
6. `id` 昇順

`sortOrder` 相当の field は `PricingRule` にはないため、短期では価格と更新日時 / id で安定させる。

例:

| priority | condition | suggestedWorkName | minPrice |
| ---: | --- | --- | ---: |
| 1 | ROLEX + Datejust + ガラス + 交換 + B2B | ガラス交換 | 5000 |
| 2 | ROLEX + modelId=null + ガラス + 交換 + B2B | ガラス交換 | 3000 |

モデル専用価格がある場合は、同じ作業名でもモデル専用価格を上に出す。

## display dedupe 方針

既存方針の `suggestedWorkName + minPrice` での表示 dedupe は外装にも使える。

基本:

- 同じ `suggestedWorkName + minPrice` は1件にまとめる。
- 同じ `suggestedWorkName` でも価格違いは別候補として残す。
- raw 候補は自動反映判定用に保持し、表示候補の collapse で構造 field を失わせない。

外装での追加方針:

- `modelId` 完全一致と `modelId = null` が同じ `suggestedWorkName + minPrice` の場合、表示候補ではモデル専用価格を代表にする。
- `modelId` 完全一致と `modelId = null` が同じ `suggestedWorkName` でも価格違いなら両方表示する。
- ブランド共通価格を隠すかどうかは、同一価格・同一表示名のときだけに限定する。

## candidate label 方針

外装候補は、ユーザーが候補の意味を判別できるラベルを持つべきである。

候補ラベル案:

- `モデル専用`
- `ブランド共通`
- `B2B`
- `B2C`

表示例:

- `モデル専用 / B2B`
- `ブランド共通 / B2B`
- `モデル専用 / B2C`
- `ブランド共通 / B2C`

ラベルは `PricingRule` の正本ではなく、候補表示用 meta として生成する。帳票 / PDF / LINE / 共有ページ / PublicCase には直接使わない。

## RepairEntryForm 接続方針

外装 LABOR 候補取得の前提:

- 顧客種別が未選択なら候補取得しない。
- `brandId` がなければ候補取得しない。
- `targetPartNameId` がなければ候補取得しない。
- `repairWorkActionId` がなければ候補取得しない。
- `modelId` があればモデル専用価格 + ブランド共通価格を取得する。
- `modelId` がなければブランド共通価格のみ取得する。
- 内装の movement Cal / base Cal / watch Cal fallback は外装では使わない。

接続イメージ:

```ts
if (addItemCategory === "external") {
  if (!customerTypeSelection || !brandId || !targetPartNameId || !repairWorkActionId) {
    clearPricingCandidates();
    return;
  }

  const rules = await getExternalPricingRules({
    customerType: customerTypeSelection,
    brandId,
    modelId,
    targetPartNameId,
    repairWorkActionId,
  });
}
```

hand-edited price 方針:

- 手入力済み価格は候補再取得で自動上書きしない。
- 候補を手動選択した場合だけ価格欄へ反映する。
- 高信頼1件の自動反映を外装にも導入する場合でも、既存の `newItemPriceManuallyEdited` と `autoFilledPricingRuleIdRef` の方針を維持する。

## save側接続方針

保存側は今回実装しない。ただし候補取得側と保存側の条件は揃える。

外装保存時の想定条件:

- `customerType`
- `brandId`
- `modelId` 任意
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`

保存方針:

- `customerType = null` の `PricingRule` は作らない。
- `brandId = null` の外装 `PricingRule` は作らない。
- 外装 `PricingRule` 保存条件に `caliberId` は使わない。
- `modelId` あり価格と `modelId = null` ブランド共通価格は別候補として扱う。
- 価格違いは別候補として保持する。
- `PartsMaster` / PART 行とは混ぜない。外装 PricingRule は LABOR 行の技術料候補である。

## schema変更要否

候補取得だけなら schema 変更なしで開始できる。

既存 `PricingRule` にある field:

- `customerType`
- `brandId`
- `modelId`
- `targetPartNameId`
- `repairWorkActionId`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `caliberId`

`caliberId` は存在するが、外装候補取得では使わない。

既存 index:

- `brandId, modelId, caliberId`
- `brandId, customerType`
- `repairWorkActionId`
- `targetPartNameId`
- `brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId`

初期件数では既存 index で開始し、性能問題が出たら以下を検討する。

```prisma
@@index([customerType, brandId, modelId, targetPartNameId, repairWorkActionId])
```

この index 追加は後続の migration 検討で扱う。今回は追加しない。

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

- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計
- 108-10AV: 外装PricingRule候補取得実装
- 108-10AW: 外装PricingRule保存実装
