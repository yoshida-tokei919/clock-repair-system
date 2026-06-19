# Task 108-10AC: PricingRule 構造化保存・候補取得 設計

作成日: 2026-06-20

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

RepairEntryForm の技術料入力で、作業カテゴリ / 対象部品 / 処置 / detail を選択したときに、対応する PricingRule をどのように保存し、検索し、候補表示し、価格欄へ反映するかを設計する。

この Task では実装変更は行わない。schema / migration / seed / API / UI / RepairEntryForm / getPricingRules / PricingRule 自動作成・更新 / RepairLineItem / PartsMaster 検索系は変更しない。

## 参照した正本・関連 docs

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AA-design-pricing-rule-schema-index-unique.md`
- `docs/ai-tasks/108-10AB-implement-pricing-rule-schema-index.md`
- `docs/ai-tasks/108-10AB-fix-local-seed-part-name-master.md`
- `docs/ai-tasks/108-10Y-design-pricing-rule-structured-work-filter.md`
- `docs/ai-tasks/108-10Z-investigate-pricing-rule-structured-rebuild-impact.md`
- `docs/ai-tasks/108-10X-implement-pricing-rule-cal-base-cal-priority.md`

正本 docs の方針を優先する。

## 現在の状態

108-10AB により、PricingRule には RepairWorkName との接続口が追加済み。

現在の PricingRule は、価格ルールとして以下の主要 field を持つ。

```txt
brandId
modelId
caliberId
customerType
minPrice
maxPrice
suggestedWorkName
notes
repairWorkNameId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
```

RepairLineItem は案件ごとの明細 snapshot であり、すでに LABOR 行向けに以下を保存できる。

```txt
pricingRuleId
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
itemNameSnapshot
unitPrice
```

ただし RepairLineItem 側には、現時点では `repairWorkNameId` はない。

## 価格が表示されない主な理由

ローカル DB reset 後に価格が自動表示されない理由は、seed 不足だけではなく、現行ロジック上も構造化入力と PricingRule 候補取得がまだ接続されていないため。

確認した主因は以下。

- 現在の seed は PartCategoryMaster / PartNameMaster / PartGradeMaster、RepairWorkCategory、RepairWorkAction を復元するが、代表 PricingRule は投入していない。
- 現在の `getPricingRules(brandId, modelId, caliberId)` は brand / model / caliber のみで検索し、`repairWorkNameId`、`repairWorkCategoryId`、`targetPartNameId`、`repairWorkActionId`、`detailLabel`、`customerType` を検索条件や score に使っていない。
- RepairEntryForm の技術料候補取得は `addItemCategory === 'internal'` のとき、108-10X の Cal 優先順で `getPricingRules` を複数回呼ぶが、依存配列に `newWorkCategoryId` / `newTargetPartNameId` / `newWorkActionId` / `newWorkDetailLabel` が入っていない。
- RepairEntryForm は候補を選択したときに価格欄へ `minPrice` を反映する。作業カテゴリ / 対象部品 / 処置 / detail を選んだだけでは価格欄を更新しない。
- 現在の LABOR 行追加では、構造化 field は line item に入るが、候補 PricingRule の `pricingRuleId` は技術料行には載せていない。
- Repair 新規作成 / 更新 API の PricingRule 自動作成・更新は `suggestedWorkName` + brand/model/caliber + price を中心にしており、`repairWorkNameId` や構造化 field を PricingRule へ保存していない。

したがって、対象部品「ムーブメント」や処置「オーバーホール」が選択できても、それだけで価格候補の検索・反映はまだ発火しない。

## 現在の RepairEntryForm 候補取得

技術料候補の取得は `src/components/repairs/RepairEntryForm.tsx` の Intelligence Cache で行われる。

現行の Cal 優先順位は 108-10X のとおり。

```txt
1. movementCaliberId
2. baseMovementCaliberId
3. watch.caliberId
4. Cal なし
```

各 Cal ID ごとに `getPricingRules(b.id, m?.id, pricingCaliberId)` を呼び、最後に `getPricingRules(b.id, m?.id, undefined)` を呼ぶ。重複排除は `PricingRule.id` で行う。

候補から `workOpts` へ渡している主な値は以下。

```txt
label: suggestedWorkName
value: suggestedWorkName
price: minPrice
```

現行 UI では候補選択時に `newItemPrice` へ `price` を入れる。構造化 field の選択だけで自動価格反映する処理はない。

## 現在の getPricingRules

場所: `src/actions/master-actions.ts`

現行 signature:

```ts
getPricingRules(brandId?: number, modelId?: number, caliberId?: number)
```

現行条件:

- `brandId` がない場合は空配列
- `brandId` は必須一致
- `modelId` がある場合は `modelId = 指定値 OR null`
- `caliberId` がある場合は `caliberId = 指定値 OR null`
- 取得後に `caliberId` exact と `modelId` exact を score 的に優先

未対応:

- `repairWorkNameId`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `customerType`
- match reason / matched fields / missing structured fields の返却

## 現在の保存 API / PricingRule 自動作成・更新

Repair 新規作成 API と Repair 更新 API は、LABOR 行から PricingRule を自動作成・更新している。

現行で使う主な field:

```txt
suggestedWorkName
brandId
modelId
caliberId
minPrice
maxPrice
```

現行で使っていない field:

```txt
repairWorkNameId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
customerType
```

新規作成 API と更新 API では、modelId / caliberId が null の場合の同一判定にも微妙な差がある。構造化保存を入れる前に、共通 helper へ寄せるのが安全。

## PricingRule seed の必要性判断

今回の設計段階では PricingRule seed は追加しない。

理由:

- seed だけで価格候補を出しても、構造化保存と構造化検索が未対応のままだと根本原因が残る。
- 代表 seed を先に入れると、画面上は直ったように見えて、保存後に同じ構造の PricingRule が育たない問題を見落としやすい。
- 現在の PricingRule は仮データ破棄 OK の前提なので、構造化保存・検索の仕様を固めた後に、代表 seed または仮データ再生成を行うほうが安全。

ただし、ローカル reset 後の画面検証用に初期候補が必要な場合は、後続 Task で最小 seed を検討する。例としては、brand / model / Cal 条件を持つ「ムーブメント + ムーブメント + オーバーホール」の代表 PricingRule など。ただしその場合も、構造化検索・保存方針と一致させる。

## 価格反映 UX の選択肢

### A. 構造化 field 選択だけでは自動反映しない

候補一覧だけを更新し、価格欄は候補を明示選択したときだけ反映する。

利点:

- 勝手に価格が変わらない。
- 複数候補がある場合に安全。

弱点:

- 入力補助としては弱い。
- 1件だけ明確な候補がある場合も手動選択が必要。

### B. exact match が 1件だけなら自動反映する

brand / Cal 優先 / customerType / repairWorkNameId または構造化 field が十分一致し、候補が 1件だけなら価格欄へ入れる。

利点:

- 現場入力が速い。
- 「ムーブメント + オーバーホール」のような明確候補に向く。

弱点:

- 手入力済み価格を上書きしない制御が必要。
- exact の定義を曖昧にすると誤反映の危険がある。

### C. 複数または低信頼候補は表示だけ

複数候補、未分類候補、部分一致候補は候補一覧に残し、価格欄は自動更新しない。

利点:

- 既存未分類 PricingRule を消さずに活用できる。
- 厳密 filter で候補が消える問題を避けられる。

弱点:

- 候補の並び順と理由が分かりにくいと選択ミスが起きる。

## 推奨方針

推奨は B + C の組み合わせ。

1. 作業カテゴリ / 対象部品 / 処置 / detail の変更で価格候補を再取得する。
2. 候補は exact filter で消しすぎず、score / priority で並べる。
3. brand は必須一致とする。
4. model / caliber は現行どおり exact と null を候補に含める。
5. Cal 優先順位は 108-10X を維持する。
6. `repairWorkNameId` が一致する PricingRule を最優先にする。
7. `repairWorkNameId` がない場合は、`repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` の一致度で score を付ける。
8. `customerType` は exact を generic より優先する。ただし初期実装では必須 filter にしない。
9. 構造化 field が null の既存 PricingRule は未分類候補として残す。
10. 明確な不一致は下位に回す。初期実装では完全除外は慎重にする。
11. exact high-confidence match が 1件だけなら価格欄へ自動反映してよい。
12. 複数候補または低信頼候補では価格欄を自動上書きせず、候補選択時だけ反映する。
13. ユーザーが価格欄を手入力した後は、別候補を明示選択するまで自動上書きしない。

候補には将来的に以下の meta を持たせるとよい。

```txt
matchPriority
matchReason
matchedFields
missingStructuredFields
caliberMatchType
customerTypeMatchType
```

ただし初期 UI では表示ラベルを増やしすぎず、まず候補順位と価格反映の安定を優先する。

## 推奨する実装順

### 108-10AD: PricingRule 構造化保存 helper 設計・実装

Repair 新規作成 API と Repair 更新 API の PricingRule 自動作成・更新を共通 helper 化する。

保存元は、正規化後の RepairLineItem 相当を使う。

保存候補:

```txt
pricingRuleId
repairWorkNameId（導入する場合）
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabelSnapshot -> detailLabel
itemNameSnapshot -> suggestedWorkName fallback
unitPrice -> minPrice / maxPrice
brandId
modelId
caliberId
customerType
```

初期は DB unique を置かず、アプリ側 helper で同一判定する。

### 108-10AE: getPricingRules 構造化 query 設計・実装

positional arguments を増やし続けず、object query を追加する。

例:

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

互換のため、現行 `getPricingRules(brandId, modelId, caliberId)` は残すか wrapper にする。

### 108-10AF: RepairEntryForm 候補表示・価格反映

RepairEntryForm の技術料候補取得に構造化 field を渡す。

依存対象:

```txt
newWorkCategoryId
newTargetPartNameId
newWorkActionId
newWorkDetailLabel
customerType（使う場合）
```

実装方針:

- 構造化 field 変更で候補を再取得する。
- 候補選択時は price と `pricingRuleId` を line item に反映できるようにする。
- exact high-confidence match が 1件だけなら価格欄へ自動反映する。
- 手入力済み価格を不用意に上書きしない。

### 108-10AG: PricingRule seed / 仮データ再生成

構造化保存・検索が安定した後で、代表 PricingRule seed を入れるか判断する。

必要な場合のみ、最小 seed を追加する。

### 108-10AH: PricingRule 管理 UI の扱い整理

`/masters/pricing` は現行 legacy UI のままだと構造化 field を落とす危険がある。構造化 PricingRule を編集対象にするか、legacy/debug 扱いにするかを別 Task で決める。

## 変更しないもの

この Task では以下を変更しない。

- `prisma/schema.prisma`
- migration
- seed
- DB データ
- API
- UI
- RepairEntryForm
- RepairLineItem 保存仕様
- PricingRule 自動作成・更新処理
- getPricingRules
- PartsMaster 検索
- getPartsMatched
- PartsSearchPanel
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase

`targetPartNameId` と `partsMasterId` は混同しない。

```txt
targetPartNameId = LABOR 行の作業対象部品。PartNameMaster 由来。
partsMasterId = PART 行の実部品。PartsMaster 由来。
```

## canonical docs 更新要否

今回の Task は設計のみで、正本 docs の既存方針と矛盾する新事実はなかった。

そのため `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` は更新不要と判断する。

ただし、108-10AD 以降で構造化保存 helper、構造化 getPricingRules、価格反映 UX のいずれかを実装した時点で、正本 docs へ反映する。

## 検証結果

設計 docs 追加後に以下を実行する。

```powershell
npx prisma validate
npx tsc --noEmit --pretty false --incremental false
```

結果は完了報告に記載する。

## 注意点

- 既存 PricingRule には構造化 field が入っていない可能性が高いので、いきなり厳密 filter にすると候補が消える。
- 価格候補の重複排除は `PricingRule.id` を使う。`suggestedWorkName` だけでは重複排除しない。
- Cal 設計は短期では `PricingRule.caliberId` 1本を維持する。
- `customerType` は存在するが、初期の構造化検索では必須 filter にしない。
- RepairLineItem snapshot は帳票 / PDF / LINE / 共有ページ / PublicCase の源泉として維持する。
