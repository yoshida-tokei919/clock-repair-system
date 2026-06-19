# Task 108-10Z: PricingRule 構造化前提への作り直し影響範囲調査

作成日: 2026-06-19

対象ブランチ: `wip-publiccase-workmaster-20260606`

前提 commit: `0d2a84c docs: add current work repair pricing guide`

## 目的

`PricingRule` を、今後の `RepairWorkName` / 作業カテゴリ / 対象部品名 / 処置 / `detailLabel` 前提に作り直す場合の影響範囲を調査し、次の設計・実装 Task に分割できる形へ整理する。

今回の Task では実装しない。schema、migration、seed、DB データ、API、UI、RepairEntryForm、RepairLineItem、帳票、PDF、LINE、共有ページ、PublicCase、PartsMaster、PartsSearchPanel、`getPartsMatched` は変更しない。

作業開始前に、正本ドキュメントとして `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` を参照した。古い docs と矛盾する場合は、同ファイルの方針を優先する。

## 結論

現行 schema には、PricingRule を構造化するための最低限の field はすでにある。

```prisma
repairWorkCategoryId Int?
repairWorkActionId   Int?
targetPartNameId     String?
detailLabel          String?
```

ただし、現行の主要処理ではこれらの field はほぼ使われていない。現在の PricingRule は、実質的に以下を中心に動いている。

```txt
brandId
modelId
caliberId
suggestedWorkName
minPrice
maxPrice
customerType
notes
```

短期的には、現行 schema のままでも「構造 field を保存し、候補取得で優先表示する」ことは可能である。

一方で、長期的にきれいな形にするなら `repairWorkNameId` の追加を優先検討すべきである。`RepairWorkName` が作業名の本体で、`PricingRule` は価格ルールであるため、価格ルールの主キー的な作業軸を `suggestedWorkName` の文字列に置き続けるのは弱い。

推奨は以下。

```txt
短期:
既存 field を使って PricingRule に作業構造を保存する。
getPricingRules は構造一致を exact filter ではなく score / priority として扱う。
既存 suggestedWorkName fallback は残す。

中期:
PricingRule に repairWorkNameId を追加する設計を行う。
repairWorkNameId がある場合はそれを第一の作業軸とし、既存構造 field は検索・互換・fallback として扱う。

仮データ:
既存 PricingRule は壊してよい前提なので、方針確定後に削除・再生成する案を第一候補にする。
```

## 現行責務整理

### PricingRule

PricingRule は捨てない。価格ルールとして残す。

現在の利用箇所:

- `getPricingRules` による価格候補取得
- RepairEntryForm の内装技術料候補表示
- Repair API の LABOR 行からの自動作成・更新
- `/api/masters/pricing` の料金マスタ管理 API
- `/masters/pricing` の料金マスタ画面
- `getCalibersForModel` の Cal 候補補助
- `RepairLineItem.pricingRuleId` の参照先

現在の弱点:

- `suggestedWorkName` が作業名候補、価格ルール、技術料候補を兼ねている
- `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` が候補取得・自動作成で十分に使われていない
- 料金マスタ API / UI が構造 field を扱っていない
- `customerType` は存在するが、現行の `getPricingRules` では絞り込みに使っていない
- `minPrice` / `maxPrice` はあるが、RepairEntryForm では主に `minPrice` を候補価格として使っている

### RepairWorkName

`RepairWorkName` は作業名マスタであり、作業構造の本体である。

PricingRule の代替ではない。PricingRule から作業名を復元するのではなく、将来的には `RepairWorkName` と PricingRule を接続する。

### RepairLineItem

`RepairLineItem` は案件ごとの明細本体である。

現行では `pricingRuleId`、`repairWorkCategoryId`、`repairWorkActionId`、`targetPartNameId`、各種 snapshot field を持つ。RepairEntryForm で内装 LABOR 行を追加すると、選択中の作業構造 field は LineItem に入り、Repair API 経由で `RepairLineItem` へ保存される。

ただし、PricingRule 自動作成側へは同じ構造 field が渡っていない。

## 調査した主なファイル

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10V-design-pricing-rule-cal-base-cal-priority.md`
- `docs/ai-tasks/108-10W-design-pricing-rule-short-term-implementation-scope.md`
- `docs/ai-tasks/108-10X-implement-pricing-rule-cal-base-cal-priority.md`
- `docs/ai-tasks/108-10Y-design-pricing-rule-structured-work-filter.md`
- `docs/ai-tasks/107-1-investigate-repair-items-documents-shared-page-for-work-master.md`
- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260611_add_structured_work_fields/migration.sql`
- `src/actions/master-actions.ts`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/masters/pricing/route.ts`
- `src/app/api/masters/pricing/[id]/route.ts`
- `src/app/(app)/masters/pricing/page.tsx`
- `src/lib/repair-line-items.ts`
- `src/lib/public-cases.ts`
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/import-fmp-public-cases.ts`

`src/actions/pricing-actions.ts` は存在しない。

## 現行 schema の評価

### すでにあるもの

`PricingRule`:

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `minPrice`
- `maxPrice`
- `suggestedWorkName`
- `notes`
- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabel`

index:

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `repairWorkCategoryId, repairWorkActionId, targetPartNameId`

`RepairLineItem` 側にも対応する構造 field と snapshot field がある。

### 足りない可能性が高いもの

#### repairWorkNameId

追加を優先検討する。

理由:

- 価格ルールの作業軸を `suggestedWorkName` 文字列から切り離せる
- `RepairWorkName` の `standardName` / displayName / targetPartName / action / detail を一貫して参照できる
- 作業名の表記ゆれ、移行互換、fallback を `suggestedWorkName` に背負わせなくて済む
- `PricingRule` を作業マスタ本体にしない方針と合う

ただし、`repairWorkNameId` を追加する場合でも、既存の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` は残してよい。検索や互換、未確定候補、`RepairWorkName` 未接続ルールの fallback に使える。

#### unique 制約

現行 schema には PricingRule の業務上の unique 制約がない。

候補:

```txt
brandId
modelId
caliberId
customerType
repairWorkNameId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
notes
```

ただし nullable field が多く、DB unique だけで業務重複をきれいに防ぐのは難しい。最初は DB unique を急がず、アプリ側の upsert 条件を明示する設計から始めるのが安全。

`notes` を unique キー相当に含めるかは要検討。現行 `upsertWorkMaster` は notes が違えば別レコードにする意図を持っているが、今後は notes をルール識別子に含めるより、価格条件や公開/非公開、顧客種別などの構造 field へ寄せる方がよい。

#### Cal の扱い

現行は `caliberId` だけを PricingRule に持つ。

108-10X では取得側で以下の順に `getPricingRules` を複数回呼び出している。

1. `movementCaliberId`
2. `baseMovementCaliberId`
3. `watch.caliberId`
4. Cal なし

schema に `caliberRole` や `movementCaliberId` / `baseMovementCaliberId` を追加する案はあるが、短期では不要。まずは現行の `caliberId` を「候補取得時にどの Cal として照合したか」で扱う現行方針を維持する。

長期的に、実搭載 Cal / Base Cal / Watch Cal / Any を価格ルール上で明確に区別したくなった場合に、`caliberRole` を検討する。

#### customerType

`customerType` は存在するが、現行 `getPricingRules` は使っていない。B2B/B2C や individual/business の価格差を PricingRule で扱うなら、検索条件・index・UI・Repair API 自動作成のすべてで設計が必要。

短期では `customerType` を壊さず残す。構造化検索の第一段階では必須条件にしない。

## getPricingRules 再設計案

現行:

```ts
getPricingRules(brandId?: number, modelId?: number, caliberId?: number)
```

現行処理:

- `brandId` がなければ空
- `brandId` は必須一致
- `modelId` があれば、`modelId = 指定値 OR null`
- `caliberId` があれば、`caliberId = 指定値 OR null`
- 取得後に `caliberId` 一致、`modelId` 一致を score 化して並べ替え
- 作業構造 field は検索条件にも score にも使っていない

### 推奨 interface

既存呼び出しとの互換を考えると、いきなり positional arguments を増やし続けるより、object 引数へ寄せる。

```ts
type PricingRuleQuery = {
  brandId?: number;
  modelId?: number | null;
  caliberId?: number | null;
  customerType?: string | null;
  repairWorkNameId?: number | null;
  repairWorkCategoryId?: number | null;
  targetPartNameId?: string | null;
  repairWorkActionId?: number | null;
  detailLabel?: string | null;
};
```

互換レイヤー:

```ts
getPricingRules(brandId, modelId, caliberId)
getPricingRulesByQuery(query)
```

または `getPricingRules` を overload 的に扱う。

### filter ではなく score を基本にする

既存 PricingRule には構造 field が入っていない可能性が高い。いきなり exact filter にすると候補が消える。

推奨:

- brand は必須一致
- model / caliber は現行同様、指定値または null を候補に含める
- `repairWorkNameId` が入ったルールは最優先
- 選択済みの category / targetPart / action / detail と一致する rule を加点
- 明確に不一致の rule を落とすかは段階的に判断
- 構造 field が null の rule は未分類候補として残す
- `PricingRule.id` で重複排除する
- `suggestedWorkName` だけで重複排除しない

戻り値には、将来的に以下を持たせると UI とデバッグが安定する。

```ts
matchPriority
matchReason
matchedFields
missingStructuredFields
```

### 108-10X との関係

108-10X の Cal 優先順位は維持する。

短期では RepairEntryForm 側の複数回呼び出しを残してよい。ただし、`getPricingRulesByQuery` 側に Cal 優先順位を寄せると、UI 側の重複排除と期待 Cal チェックを単純化できる。

次の設計では以下を比較する。

- A案: Cal 優先順位は RepairEntryForm に残し、構造 field だけ `getPricingRules` に追加
- B案: Cal 優先順位も `getPricingRulesByQuery` に寄せる

推奨は B 案。ただし実装範囲が広がるため、短期は A 案でもよい。

## Repair API 自動作成・更新の再設計案

現行の新規作成 API:

- `EstimateItem` を作成
- `estimateItemsLikeToRepairLineItemInputs` で `RepairLineItem` に複製
- LABOR 行から PricingRule を自動作成・更新
- PricingRule の同一判定は `suggestedWorkName` + `brandId` + 任意の `modelId` + 任意の `caliberId`
- 構造 field は保存しない

現行の更新 API:

- `EstimateItem` を作り直す
- `RepairLineItem` を置換
- LABOR 行から PricingRule を自動作成・更新
- PricingRule の同一判定は `suggestedWorkName` + `brandId` + `modelId` + `caliberId`
- 構造 field は保存しない

新規作成 API と更新 API で、null の `modelId` / `caliberId` の扱いが微妙に違う。構造化対応時に同じ helper へ寄せるべき。

### 保存元

PricingRule 自動作成・更新の保存元は、`RepairLineItem` に正規化された LABOR 行を使うのが自然。

保存候補:

- `pricingRuleId`
- `repairWorkNameId` 将来追加時
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabelSnapshot` -> `PricingRule.detailLabel`
- `itemNameSnapshot` -> `suggestedWorkName` fallback
- `unitPrice` -> `minPrice` / `maxPrice`
- `brandId`
- `modelId`
- `caliberId`
- `customerType`

### 同一ルール判定

短期の現行 schema 案:

```txt
brandId
modelId
caliberId
customerType
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
suggestedWorkName fallback
```

中期の `repairWorkNameId` 追加案:

```txt
brandId
modelId
caliberId
customerType
repairWorkNameId
```

`repairWorkNameId` が null の場合だけ、構造 field と `suggestedWorkName` で fallback 判定する。

### 更新条件

既存 rule がある場合:

- 価格だけ変わるなら `minPrice` / `maxPrice` を更新
- 構造 field が null で、明細側に構造 field があるなら補完してよい
- 既存 rule の構造 field と明細側が明確に矛盾する場合は、上書きせず新規 rule として扱うか review 対象にする

新規 rule を作る場合:

- 明細 snapshot から構造 field を保存する
- `suggestedWorkName` は fallback 表示名として保存する
- 価格は `unitPrice` を `minPrice` / `maxPrice` に入れる短期方針を維持する

## 既存仮データの扱い

本番データはなく、現在の PricingRule は仮データである。仮データ破棄 OK の前提なので、複雑な移行 script よりも削除・再生成を第一候補にする。

候補:

### A案: 既存 PricingRule を全削除し、今後の入力から再生成

推奨。

理由:

- 現行 PricingRule は構造 field が欠けている可能性が高い
- suggestedWorkName 中心の古い仮データを引きずらない
- schema / API / UI を揃えたあと、実際の入力から自然に作れる
- 本番データがないため損失が小さい

注意:

- 代表的な検証用ルールが必要なら seed で最小投入する
- 削除前に件数とサンプルを docs に残すと安心

### B案: seed で代表 PricingRule を投入

検証には有効。大量 seed ではなく、ブランド、モデル、Cal、作業構造がわかる少数にする。

### C案: 既存 PricingRule を migration script で補完

現段階では非推奨。

理由:

- 仮データに対して移行 script を作るコストが高い
- `suggestedWorkName` から作業構造を推定する処理は FMP 救済に近く、通常 Repair の標準ルールへ混ざりやすい

### D案: 当面は削除せず未分類候補として残す

短期検証ではあり。ただし、構造化候補 UI の検証では未分類候補が多く残り、挙動が見えにくくなる。

## 他機能への影響範囲

### RepairEntryForm

影響大。

現在は `getPricingRules` の戻り値を `workOpts` にし、`suggestedWorkName` と `minPrice` を使って内装技術料候補を表示している。

構造化後は、選択中の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` を候補取得へ渡す必要がある。

また、現在の内装 LABOR 行追加では構造 field を LineItem へ入れているが、候補 PricingRule の `id` を `pricingRuleId` として LineItem へ保持する導線は弱い。候補選択と自由入力 fallback の扱いを分ける必要がある。

### Repair 保存 API

影響大。

新規作成 API と更新 API の PricingRule 自動作成・更新ロジックを共通 helper に寄せるべき。

構造 field を保存する場合、現在の `laborItems` ではなく、正規化後の `RepairLineItemInput` / `RepairLineItem` 相当から PricingRule を作る方が安全。

### getPricingRules / master-actions

影響大。

`src/actions/master-actions.ts` には `getWorkMasters` / `upsertWorkMaster` という、PricingRule を仮の WorkMaster として扱う関数が残っている。今後の方針では、この責務は `RepairWorkName` へ寄せる。

`getCalibersForModel` は PricingRule の `caliberId` を Cal 候補に使っている。PricingRule を削除・再生成する場合、Cal 候補補助に影響する可能性がある。

### 料金マスタ API / 画面

影響中から大。

`/api/masters/pricing` と `/masters/pricing` は、構造 field を扱っていない。構造化 PricingRule を運用するなら、少なくとも以下のいずれかが必要。

- 料金マスタ画面に作業構造 field を追加する
- 料金マスタ画面を一時的に legacy / debug 扱いにする
- 価格ルール編集は別 UI へ作り直す

現状の画面のままだと、編集時に構造 field を落とすリスクがある。

### RepairLineItem

影響中。

モデルには必要 field がある。保存 helper も構造 field と snapshot を受け取れる。

ただし、`repairWorkNameId` はまだない。PricingRule に `repairWorkNameId` を追加するなら、RepairLineItem 側にも `repairWorkNameId` を持たせるか、既存の構造 field + snapshot で十分かを次 Task で比較する。

### EstimateItem / 帳票 / PDF / LINE / 共有ページ

直接影響は避けるべき。

現行では帳票・共有ページはまだ `EstimateItem` を広く読んでいる。PricingRule 構造化の Task でここを直接変更しない。

将来的には `RepairLineItem` snapshot を正に寄せるが、それは別 Task に分ける。

### PublicCase

直接影響は避けるべき。

FMP 由来 PublicCase 生成 scripts は独自の正規化・snapshot を持っている。通常 Repair の PricingRule 構造化と混ぜない。

通常 Repair から PublicCase 下書きを作る場合は、PricingRule 直参照ではなく `RepairLineItem` snapshot から作る。

### PartsMaster / getPartsMatched / PartsSearchPanel

直接変更しない。

ただし `targetPartNameId` と `partsMasterId` の混同は最重要リスクである。

PricingRule / RepairWorkName の対象部品は `PartNameMaster` 由来の `targetPartNameId`。部品行の実部品は `PartsMaster` 由来の `partsMasterId`。

### seed / migration / DB 初期化

次以降の Task で影響あり。

今回は変更しない。仮データ破棄 OK のため、PricingRule は削除・再生成方針を第一候補にする。

## 推奨する次 Task 分割

### 108-10AA: PricingRule schema/index/unique 制約設計

目的:

- `repairWorkNameId` を追加するか決める
- `PricingRule` の業務上の同一判定を決める
- unique / index の必要性を決める
- `customerType` と Cal role を今回入れるか後回しにするか決める

出力:

- schema 変更案
- migration 影響範囲
- 既存仮データ削除・再生成方針

### 108-10AB: PricingRule schema/index/unique 制約実装

目的:

- 108-10AA の決定に従って schema / migration を実装する

注意:

- この Task で初めて schema / migration を触る
- 帳票、PublicCase、PartsMaster は触らない

### 108-10AC: PricingRule 構造化保存設計

目的:

- Repair API の PricingRule 自動作成・更新を再設計する
- 新規作成 API と更新 API の差分をなくす
- どの明細 field から PricingRule に保存するか決める

### 108-10AD: PricingRule 構造化保存実装

目的:

- Repair API の自動作成・更新処理を構造 field 対応にする
- 共通 helper 化する
- 既存仮 PricingRule の扱いを実装する

### 108-10AE: getPricingRules 構造 field 検索設計

目的:

- object query 化
- score / priority 方式
- matchReason / priority の戻り値
- 108-10X の Cal 優先順位をどこへ寄せるか決める

### 108-10AF: getPricingRules 構造 field 検索実装

目的:

- RepairEntryForm の候補取得を構造 field 対応へ寄せる
- 既存 fallback 候補を残す
- 候補消失を避ける

### 108-10AG: 仮 PricingRule 削除 / seed 再投入

目的:

- 仮データを削除する
- 代表的な PricingRule seed を必要最小限投入する
- 構造化候補取得の検証状態を作る

### 108-10AH: 料金マスタ UI 再設計

目的:

- `/masters/pricing` を構造 field 対応にするか、legacy 管理画面として扱うか決める
- 編集時に構造 field を落とさないようにする

## 次に進むべき Task

次は **108-10AA: PricingRule schema/index/unique 制約設計** を推奨する。

理由:

- `repairWorkNameId` を追加するかどうかで、その後の保存・検索・seed の設計が変わる
- 現行 field だけで進める場合でも、同一判定と index 方針を先に決める必要がある
- 実装前に schema 変更の有無を決めないと、Repair API と getPricingRules の作り直しが二度手間になりやすい

108-10AA で決めるべきこと:

- `PricingRule.repairWorkNameId` を追加するか
- `RepairLineItem.repairWorkNameId` も追加するか
- unique 制約を DB に置くか、アプリ側 upsert 条件に留めるか
- `customerType` を検索条件に入れるか
- Cal role を今回入れるか後回しにするか
- 仮 PricingRule をいつ削除・再生成するか

## canonical docs 更新要否

今回の調査結果は、`docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` の方針と矛盾しない。

同ファイルにはすでに以下が書かれている。

- PricingRule は価格ルールとして残す
- PricingRule を作業マスタ本体にしない
- `repairWorkNameId` 追加案を検討する
- 既存構造 field を活用する
- `suggestedWorkName` は将来的に主キー的な判定軸から外す
- 仮 PricingRule は方針確定後に削除・再生成してよい

そのため、今回の Task では canonical docs の更新は不要と判断する。

ただし、108-10AA で `repairWorkNameId` 追加有無、unique 方針、Cal role 方針が決まった場合は、canonical docs を更新する必要がある。

## 完了条件

- PricingRule の現行責務が整理されている
- 構造化前提へ作り直す場合の推奨方針が書かれている
- 現行 schema のまま進められる範囲と、schema 変更が必要な範囲が分かれている
- getPricingRules 再設計案がある
- Repair API 自動作成・更新の再設計案がある
- 既存仮 PricingRule の扱い方針がある
- 他機能への影響範囲が明記されている
- 次 Task が提案されている

