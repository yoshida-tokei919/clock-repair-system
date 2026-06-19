# Task 108-10W: PricingRule短期実装の影響範囲設計

## 目的

PricingRule（価格ルール）の schema変更なしで、内装技術料候補を以下の順に取得する短期実装方針を確定する。

```txt
1. movementCaliberId（実搭載Cal ID）
2. baseMovementCaliberId（Base Cal ID）
3. watch.caliberId（従来Cal ID）
4. caliberIdなし（Calなし）
```

このTaskでは実装変更は行わない。PricingRuleは影響範囲が広いため、108-10Xで触る範囲と触らない範囲を明確化する。

## 前提

最新commit:

```txt
365c0e7 docs: design pricing rule cal base cal priority
```

前Task:

```txt
docs/ai-tasks/108-10V-design-pricing-rule-cal-base-cal-priority.md
```

108-10Vの主な結論:

```txt
PricingRuleには customerType と作業構造fieldはある。
現行の価格候補取得では customerType / 作業構造field は未使用。
現行は movementCaliber → baseMovementCaliber → watch.caliber の順で単一 caliberId に潰している。
PricingRule.caliberId は実Cal / Base Calを区別しない。
短期案は schema変更なしで検索側を Cal → Base Cal → Watch Cal → Calなし の優先順位に拡張する。
```

## 調査対象ファイル

確認したファイル:

```txt
prisma/schema.prisma
src/components/repairs/RepairEntryForm.tsx
src/actions/master-actions.ts
src/actions/repair-actions.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
docs/ai-tasks/108-10V-design-pricing-rule-cal-base-cal-priority.md
```

存在しなかったファイル:

```txt
src/actions/pricing-actions.ts
src/lib/pricing*
```

## 現在の価格候補取得の呼び出し箇所

呼び出し箇所:

```txt
src/components/repairs/RepairEntryForm.tsx
```

該当処理:

```txt
useEffect: Intelligence Cache (Pricing Rules & Parts Master)
```

現行条件:

```txt
brandOpts から brandId を取得できない場合は workOpts を空にする
addItemCategory === 'internal' の場合だけ PricingRule を取得する
addItemCategory !== 'internal' の場合は PartsMaster検索へ進む
```

現行で使っている state / prop:

| 値 | 用途 |
| --- | --- |
| `brand` | 時計ブランド名。`brandOpts` から `brandId` を取る |
| `model` | モデル名。`modelOpts` から `modelId` を取る |
| `caliber` | Watch.caliber（従来Cal名） |
| `movementCaliber` | Cal（実搭載Cal名） |
| `baseMovementCaliber` | Base Cal（ベースCal名） |
| `masterCalOpts` | 全Cal候補。Cal名からCal IDを探す |
| `calOpts` | Watch/Model由来の従来Cal候補 |
| `addItemCategory` | `internal` の場合だけ技術料候補を取る |

現在の `caliberId（Cal ID）` 決定:

```txt
pricingCaliberId =
  movementCaliber に一致する masterCalOpts.id
  ?? baseMovementCaliber に一致する masterCalOpts.id
  ?? watch.caliber に一致する calOpts.id
```

その後:

```txt
getPricingRules(brandId, modelId, pricingCaliberId)
```

つまり、現行は Cal / Base Cal / Watch Cal のうち1つだけを `PricingRule.caliberId` として渡している。

## 現行 getPricingRules の挙動

場所:

```txt
src/actions/master-actions.ts
```

現行引数:

```ts
getPricingRules(brandId?: number, modelId?: number, caliberId?: number)
```

現行仕様:

```txt
brandId がない場合は [] を返す
brandId は必須条件
modelId がある場合は modelId一致 または modelId null
caliberId がある場合は caliberId一致 または caliberId null
```

現行ソート:

```txt
caliberId一致: +100
modelId一致: +50
```

現行では、`customerType（顧客区分）` と作業構造fieldは使っていない。

## 短期実装で変更すべき場所

短期実装で触る候補は2案。

### A案: RepairEntryForm側で複数回 getPricingRules を呼ぶ

RepairEntryFormで優先順の Cal ID 配列を作る。

```txt
[
  movementCaliberId,
  baseMovementCaliberId,
  watchCaliberId,
  null
]
```

重複Cal IDを除外し、順番に `getPricingRules()` を呼ぶ。

```txt
getPricingRules(brandId, modelId, movementCaliberId)
getPricingRules(brandId, modelId, baseMovementCaliberId)
getPricingRules(brandId, modelId, watchCaliberId)
getPricingRules(brandId, modelId, undefined)
```

メリット:

```txt
getPricingRulesの既存仕様を大きく変えない
影響範囲がRepairEntryFormの価格候補取得部分に閉じやすい
rollbackしやすい
PartsMaster検索や保存処理へ影響しない
```

デメリット:

```txt
server action呼び出しが最大4回になる
重複排除をRepairEntryForm側で実装する必要がある
```

### B案: getPricingRules側を配列対応する

`getPricingRules()` を以下のように拡張する。

```ts
getPricingRules({
  brandId,
  modelId,
  caliberIds: [movementCaliberId, baseMovementCaliberId, watchCaliberId, null]
})
```

関数内で優先順位・重複排除・Calなし検索を扱う。

メリット:

```txt
価格候補取得ロジックをaction側に集約できる
複数画面から使いやすくなる
```

デメリット:

```txt
既存の getPricingRules 呼び出し互換に注意が必要
影響範囲が広がる
引数型や既存ソートの見直しが必要
```

### 短期推奨

108-10Xでは A案を推奨する。

理由:

```txt
今回の目的は価格候補表示の短期改善であり、schema変更なし・保存処理変更なしが前提。
既存 getPricingRules の挙動を保ったまま、RepairEntryFormの内装技術料候補取得だけを拡張できる。
変更範囲が小さく、問題があれば元の単一 pricingCaliberId 方式へ戻しやすい。
```

## 重複排除ルール

複数回検索すると、同じ PricingRule（価格ルール）が重複する可能性がある。

推奨する重複判定key:

```txt
PricingRule.id
```

理由:

```txt
同じ suggestedWorkName でも価格違い・条件違いのPricingRuleがあり得る。
作業名だけで潰すと、条件違いの候補まで消える可能性がある。
```

`id` が使いにくい場合の代替key:

```txt
suggestedWorkName
minPrice
maxPrice
brandId
modelId
caliberId
customerType
```

表示順:

```txt
最初に見つかった優先順位を維持する。
Cal候補 → Base Cal候補 → Watch Cal候補 → Calなし候補 の順を崩さない。
```

同じ作業名で価格違いがある場合:

```txt
潰さない。
同じ suggestedWorkName でも minPrice / maxPrice / caliberId が違う場合は別候補として残す。
```

RepairEntryFormで `workOpts` に変換する際も、短期では `label/value` が同じでも複数候補を残せるようにするのが望ましい。
ただし現行UIの表示上、同名候補の見分けがつきにくい場合は後続Taskで `meta` 表示を検討する。

## fallback（代替検索）条件

Cal ID 候補の扱い:

```txt
movementCaliberId が未設定ならスキップ
baseMovementCaliberId が未設定ならスキップ
watch.caliberId が未設定ならスキップ
```

重複Cal ID:

```txt
movementCaliberId と baseMovementCaliberId が同じなら1回だけ検索する
watch.caliberId が movementCaliberId / baseMovementCaliberId と同じなら重複検索しない
```

Calなし検索:

```txt
常に最後に実行する
```

理由:

```txt
Cal専用価格と汎用作業価格を両方出せるようにするため。
Cal専用価格だけでなく、汎用候補も比較できた方が短期運用では安全。
```

ただし、Calなし候補が多すぎる場合は後続Taskで以下を検討する。

```txt
Calあり候補が1件以上ある場合はCalなし候補を折りたたむ
Calなし候補に「汎用」タグを付ける
```

## Brand（時計ブランド）条件の扱い

現行 `getPricingRules()` は `brandId` 必須。

短期実装では、この条件を変えない。

理由:

```txt
brandIdなしの汎用候補まで出すと候補数が急に増える可能性がある。
既存の価格候補表示に対する影響が大きい。
今回のTask目的は Cal / Base Cal / Watch Cal / Calなし の優先順位対応であり、ブランド汎用候補の導入ではない。
```

短期方針:

```txt
時計ブランド + Cal の候補を優先する
時計ブランド + Base Cal の候補を次に出す
時計ブランド + Watch Cal の候補を次に出す
時計ブランド + Calなし の候補を最後に出す
Calのみ、時計ブランドなし汎用候補は今回は出さない
```

将来案:

```txt
brandId null を汎用価格として扱う
brandId一致 + brandId null の両方を取得してスコア順に並べる
```

これは候補数と既存データ品質に影響するため、DB分布確認後に別Taskで扱う。

## customerType（顧客区分）の扱い

`PricingRule.customerType` はschemaにある。

`Customer.type` と RepairEntryForm の `isB2B` から、顧客区分は取得可能。

ただし、108-10Xでは customerType を入れない方針を推奨する。

理由:

```txt
現行 getPricingRules は customerType 未使用。
PricingRule自動作成・更新も customerType 未使用。
Cal優先順位対応と同時に customerType を入れると影響範囲が広がる。
既存PricingRuleの customerType が null 中心の場合、B2B/B2C条件を急に入れると候補が消える可能性がある。
```

短期方針:

```txt
108-10Xでは customerType は触らない。
customerType null を共通価格として扱う設計は後続Taskで行う。
```

## 作業構造fieldの扱い

PricingRuleには以下がある。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
```

RepairLineItemにも、技術料行（LABOR行）の構造化fieldは保存されている。

```txt
targetPartNameId = LABOR行の作業対象部品名ID。PartNameMaster由来。
partsMasterId = PART行の実部品ID。PartsMaster由来。
```

ただし、価格候補選択時点では以下の事情がある。

```txt
作業カテゴリ / 処置 / 対象部品 / detail は入力途中のことがある。
現行候補取得は suggestedWorkName 中心で動いている。
構造化fieldによる絞り込みを同時に入れると、既存候補が出なくなる可能性がある。
```

短期方針:

```txt
108-10Xでは作業構造fieldによる絞り込みは行わない。
既存の suggestedWorkName ベースの候補表示を維持する。
```

後続Task:

```txt
PricingRuleの作業構造field入力状況をDB確認する。
構造化fieldが十分入った段階で、カテゴリ + 処置 + 対象部品 + detail の一致スコアを追加する。
```

## 自動作成・更新処理への影響

Repair新規作成API / 更新APIでは、技術料行から PricingRule を自動作成・更新している。

現行:

```txt
suggestedWorkName
brandId
modelId
caliberId
minPrice
maxPrice
```

自動作成時に使われる `caliberId` は、現在 Watch.caliberId 側の `caliberId`。

`movementCaliberId` / `baseMovementCaliberId` のどちらを自動作成先にするかは未整理。

短期方針:

```txt
108-10Xでは自動作成・更新処理は変更しない。
候補取得のみ変更する。
```

メリット:

```txt
Repair保存APIへの影響を避けられる。
既存の自動登録挙動を壊さない。
Cal / Base Cal候補表示の改善だけを独立して検証できる。
```

デメリット:

```txt
新しく入力した技術料価格が、Cal / Base Calのどちらの文脈でPricingRule化されるかは現状のまま。
候補取得側だけ改善され、自動作成側のルール粒度は古いまま残る。
```

このデメリットは後続Taskで扱う。

## 推奨する108-10X実装方針

### 変更ファイル候補

最小案:

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10X-implement-pricing-rule-cal-fallback.md
```

必要になった場合のみ:

```txt
src/actions/master-actions.ts
```

ただし108-10Xでは、まず `getPricingRules()` は変更せず、RepairEntryForm側で複数回呼ぶ案を推奨する。

### 変更しないファイル

```txt
prisma/schema.prisma
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
src/actions/repair-actions.ts
PartsMaster検索関連
PartsSearchPanel
帳票 / PDF / LINE / 共有ページ / PublicCase
seed / migration
```

### 実装手順

1. RepairEntryFormで以下のIDを取得する。

```txt
movementCaliberId
baseMovementCaliberId
watchCaliberId
```

2. 優先順の配列を作る。

```txt
[movementCaliberId, baseMovementCaliberId, watchCaliberId, null]
```

3. null以外の重複Cal IDを除外する。

4. 最後にCalなし検索を追加する。

5. 順番に `getPricingRules(brandId, modelId, caliberId)` を呼ぶ。

6. `PricingRule.id` で重複排除する。

7. 最初に見つかった優先順位を維持したまま `workOpts` に変換する。

### 画面確認手順

```txt
/repairs/new
既存案件詳細 /repairs/[id]
```

確認ポイント:

```txt
Calだけ設定した場合、Cal用候補が優先される
Base Calだけ設定した場合、Base Cal用候補が出る
Watch Calだけ設定した場合、従来Cal候補が出る
Calなし汎用候補も最後に出る
作業カテゴリ別対象部品候補絞り込みが壊れていない
PartsMaster検索 / getPartsMatched / PartsSearchPanel が壊れていない
技術料行と部品行の分離が維持されている
ステータスバーが残っている
見積り・修理明細の横幅が狭くなっていない
```

### 検証コマンド

```powershell
npx prisma validate
npx tsc --noEmit --pretty false --incremental false
```

### rollbackしやすい単位

108-10Xでは、RepairEntryFormの価格候補取得 `useEffect` 内だけを変更する。

問題があれば、以下へ戻せばよい。

```txt
単一 pricingCaliberId を作る
getPricingRules(brandId, modelId, pricingCaliberId) を1回だけ呼ぶ
```

### リスク

```txt
getPricingRulesを最大4回呼ぶため、画面入力中の通信回数が増える
Calなし候補まで常に追加すると候補数が増える
同名候補の見分けがつきにくい
既存 getPricingRules が brandId必須のため、Calのみ汎用価格はまだ出ない
```

### 後続Taskに回す項目

```txt
customerType（顧客区分）対応
作業構造fieldによるPricingRule絞り込み
PricingRule自動作成・更新のCal / Base Cal対応
brandId null の汎用価格候補
候補表示に「Cal専用」「Base Cal」「汎用」などのmeta表示を追加
getPricingRules側の配列対応・共通化
```

## 変更してはいけないもの

108-10Wでは以下を変更していない。

```txt
schema
migration
seed
DB構造
RepairEntryForm UI
保存処理
PricingRule検索処理
PricingRule作成処理
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
ステータスバー
見積り・修理明細の横幅
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

## 未確認点

```txt
ローカルDB上のPricingRule件数
Calなし候補の件数
同じ suggestedWorkName で価格違いの候補数
Calあり候補 + Calなし候補を同時表示した時のUI上の見え方
```

このTaskではDB読み取り調査と画面確認は行っていない。
