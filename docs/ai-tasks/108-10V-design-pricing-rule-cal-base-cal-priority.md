# Task 108-10V: PricingRuleのCal / Base Cal優先順位設計調査

## 目的

内装作業の価格候補取得で、Cal（実搭載Cal） / Base Cal（ベースCal） / 時計ブランド / 顧客区分 / 作業内容構造fieldをどう優先して使うべきか調査・設計した。

このTaskでは実装変更は行わない。

## 前提commit

```txt
11d8773 fix: scope caliber lookup by maker
433f540 feat: filter cal candidates by selected maker
004a86e docs: design cal candidate drilldown
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
src/lib/repair-line-items.ts
docs/ai-tasks/108-10M-master-responsibility-overview.md
docs/ai-tasks/108-10N-investigate-action-part-caliber-gaps.md
docs/ai-tasks/108-10Q-design-cal-base-cal-display.md
docs/ai-tasks/108-10S-design-cal-candidate-drilldown.md
```

存在しなかったファイル:

```txt
src/actions/pricing-actions.ts
src/lib/pricing*
```

現行の価格候補取得は `src/actions/master-actions.ts` の `getPricingRules()` が担っている。

## PricingRule（価格ルール）の現schema

現行 `PricingRule（価格ルール）`:

```prisma
model PricingRule {
  id                Int     @id @default(autoincrement())
  brandId           Int?
  modelId           Int?
  caliberId         Int?
  customerType      String?
  minPrice          Int
  maxPrice          Int
  suggestedWorkName String
  notes             String?

  repairWorkCategoryId Int?
  repairWorkActionId   Int?
  targetPartNameId     String?
  detailLabel          String?
}
```

存在するfield:

| field | 意味 | 現状 |
| --- | --- | --- |
| `brandId` | ブランドID | あり |
| `modelId` | モデルID | あり |
| `caliberId` | Cal ID | あり。ただし実Cal / Base Cal区分はない |
| `customerType` | 顧客区分 | あり |
| `minPrice` | 最低価格 | あり |
| `maxPrice` | 最高価格 | あり |
| `suggestedWorkName` | 候補作業名 | あり。既存互換の中心 |
| `notes` | メモ | あり |
| `repairWorkCategoryId` | 作業カテゴリID | あり |
| `repairWorkActionId` | 処置ID | あり |
| `targetPartNameId` | 作業対象部品名ID | あり |
| `detailLabel` | 詳細ラベル | あり |

存在しないfield:

```txt
movementCaliberId（Cal ID / 実搭載Cal専用）
baseMovementCaliberId（Base Cal ID / ベースCal専用）
caliberRole（Cal種別: ACTUAL / BASE / ANY）
price（単一価格field）
```

現状は `minPrice` / `maxPrice` を価格候補として使っている。

## 現在の価格候補取得処理

RepairEntryForm（案件入力フォーム）は、内装作業候補を出すときに以下を行う。

```txt
pricingCaliberId =
  movementCaliber（Cal / 実搭載Cal）
  → baseMovementCaliber（Base Cal / ベースCal）
  → watch.caliber（従来Cal）
  の順で1つだけ選ぶ

getPricingRules(brandId, modelId, pricingCaliberId)
```

該当箇所:

```txt
src/components/repairs/RepairEntryForm.tsx
```

`getPricingRules()` の現行条件:

```txt
brandId は必須
modelId があれば modelId一致 または modelId null
caliberId があれば caliberId一致 または caliberId null
```

並び順:

```txt
caliberId一致を +100
modelId一致を +50
```

現在渡していないもの:

```txt
customerType（顧客区分）
repairWorkCategoryId（作業カテゴリID）
repairWorkActionId（処置ID）
targetPartNameId（作業対象部品名ID）
detailLabel（詳細ラベル）
movementCaliberId と baseMovementCaliberId の両方
```

したがって、現行の価格候補取得は Cal / Base Cal の両方を同時に評価していない。
最初に見つかった1つの `caliberId` に潰して検索している。

## 現在のPricingRule作成・更新処理

Repair新規作成API:

```txt
src/app/api/repairs/route.ts
```

Repair更新API:

```txt
src/app/api/repairs/[id]/route.ts
```

どちらも、技術料行 `laborItems` から `PricingRule（価格ルール）` を自動作成・更新している。

現行の作成・更新キー:

```txt
suggestedWorkName
brandId
modelId
caliberId
```

現行の保存値:

```txt
suggestedWorkName
minPrice
maxPrice
brandId
modelId
caliberId
```

使っていないもの:

```txt
customerType
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
movementCaliberId
baseMovementCaliberId
```

注意:

```txt
PricingRule schemaには作業内容構造fieldが既にある。
RepairLineItemにも構造化fieldは保存されている。
しかし現行のPricingRule自動作成・更新処理は、それらをまだ使っていない。
```

## Repair / Watch のCal情報

現行 `Repair（案件）`:

| field | 意味 | 価格候補取得での現状 |
| --- | --- | --- |
| `movementMakerId` | CalメーカーID | 直接は使っていない |
| `movementCaliberId` | Cal ID / 実搭載Cal | RepairEntryForm stateから `pricingCaliberId` の第一候補 |
| `baseMovementMakerId` | Base CalメーカーID | 直接は使っていない |
| `baseMovementCaliberId` | Base Cal ID / ベースCal | RepairEntryForm stateから `pricingCaliberId` の第二候補 |

現行 `Watch（時計）`:

| field | 意味 | 価格候補取得での現状 |
| --- | --- | --- |
| `brandId` | 時計ブランドID | `getPricingRules(brandId, ...)` に渡す |
| `modelId` | モデルID | `getPricingRules(..., modelId, ...)` に渡す |
| `caliberId` | 従来Cal ID | `pricingCaliberId` の第三候補 |

現状は、`movementCaliberId` と `baseMovementCaliberId` を同時に渡す口はない。
単一 `PricingRule.caliberId` へどちらか一方を入れて検索している。

## customerType（顧客区分）の現状

`PricingRule（価格ルール）` には `customerType` がある。

`Customer（顧客）` には `type` がある。

```txt
individual
business
```

RepairEntryForm では `isB2B` state があり、保存payloadでは以下を送っている。

```txt
customer.type = business / individual
```

ただし、価格候補取得では `customerType` を渡していない。

現状:

```txt
B2B / B2C で価格候補を分けるschema上の受け皿はある。
しかし getPricingRules() と RepairEntryForm の取得条件には未接続。
PricingRule自動作成・更新時も customerType は保存していない。
```

## 内装作業の価格候補優先順位案

理想形としては、以下の順に価格候補を探す。

```txt
1. 時計ブランド + Cal（実搭載Cal） + 作業内容 + 顧客区分
2. Cal（実搭載Cal） + 作業内容 + 顧客区分
3. 時計ブランド + Base Cal（ベースCal） + 作業内容 + 顧客区分
4. Base Cal（ベースCal） + 作業内容 + 顧客区分
5. 時計ブランド + 作業内容 + 顧客区分
6. 作業内容 + 顧客区分
7. 時計ブランド + Cal（実搭載Cal） + 作業内容
8. Cal（実搭載Cal） + 作業内容
9. 時計ブランド + Base Cal（ベースCal） + 作業内容
10. Base Cal（ベースCal） + 作業内容
11. 時計ブランド + 作業内容
12. 作業内容のみ
```

現schemaで実現できるもの:

```txt
時計ブランド
単一 caliberId
作業内容構造field
customerType
```

現schemaだけでは表現しにくいもの:

```txt
PricingRule.caliberId が Cal（実搭載Cal）用か Base Cal（ベースCal）用かの明示区分
Cal / Base Cal 両方を1回の検索引数として明示的に渡すこと
```

## 作業内容の一致条件案

作業内容は、以下の順に一致度を強く扱う。

```txt
カテゴリ + 処置 + 対象部品 + 詳細
カテゴリ + 処置 + 対象部品
カテゴリ + 処置
suggestedWorkName（候補作業名）だけ
```

field対応:

| 条件 | field |
| --- | --- |
| カテゴリ | `repairWorkCategoryId` |
| 処置 | `repairWorkActionId` |
| 対象部品 | `targetPartNameId` |
| 詳細 | `detailLabel` |
| 既存互換作業名 | `suggestedWorkName` |

現状:

```txt
RepairEntryForm → RepairLineItem には構造化fieldを保存している。
PricingRule schemaにも構造化fieldはある。
しかし価格候補取得と自動作成・更新ではまだ使っていない。
```

## 具体例

### ROLEX 3135 オーバーホール

```txt
Brand（時計ブランド）: ROLEX
Cal（実搭載Cal）: ROLEX 3135
Base Cal（ベースCal）: なし
作業: ムーブメント / ムーブメント / オーバーホール
顧客区分: B2C
```

最優先:

```txt
ROLEX + ROLEX 3135 + オーバーホール + B2C
```

短期では:

```txt
brandId = ROLEX
caliberId = ROLEX 3135
suggestedWorkName = オーバーホール
```

が最も近い。

### OMEGA 1120 オーバーホール

```txt
Brand（時計ブランド）: OMEGA
Cal（実搭載Cal）: OMEGA 1120
Base Cal（ベースCal）: ETA 2892.A2
作業: ムーブメント / ムーブメント / オーバーホール
顧客区分: B2B
```

優先:

```txt
OMEGA + OMEGA 1120 + オーバーホール + B2B
OMEGA + ETA 2892.A2 + オーバーホール + B2B
ETA 2892.A2 + オーバーホール + B2B
```

短期では、まず `movementCaliberId` で検索し、候補が弱い場合に `baseMovementCaliberId` でも検索する案が現実的。

### Valjoux 7750系

```txt
Brand（時計ブランド）: BREITLING / TAG HEUER / OMEGA など
Cal（実搭載Cal）: 各社Cal
Base Cal（ベースCal）: Valjoux 7750
作業: クロノグラフOH
```

ブランド別価格がある場合:

```txt
BREITLING + 実Cal + クロノグラフOH
```

共通価格がある場合:

```txt
Valjoux 7750 + クロノグラフOH
```

## schema変更なしの短期実装案

`PricingRule.caliberId（価格ルールCal ID）` は単一のまま維持する。

検索側で意味を持たせる。

短期案:

```txt
1. movementCaliberId（Cal ID / 実搭載Cal）で getPricingRules()
2. baseMovementCaliberId（Base Cal ID / ベースCal）で getPricingRules()
3. Watch.caliberId（従来Cal ID）で getPricingRules()
4. caliberIdなしで getPricingRules()
```

取得結果にスコアを付ける。

スコア例:

```txt
Cal（実搭載Cal）一致: +300
Base Cal（ベースCal）一致: +200
Watch.caliber一致: +100
brandId一致: +50
modelId一致: +30
customerType一致: +20
作業内容構造field一致: +10〜+80
```

ただし、短期第一段階では以下に限定すると安全。

```txt
現在の suggestedWorkName 互換を維持する
PricingRule作成・更新はまだ変えない
getPricingRules() の戻り順だけを Cal → Base Cal → Watch Cal → Calなし の順へ拡張する
```

注意:

```txt
PricingRule.caliberId が Cal用かBase Cal用かは明示されない。
同じCaliberをどの文脈で使うかは、検索側の優先順位で解釈する。
```

## schema変更ありの中期実装案

将来的に、`PricingRule.caliberId` の意味を明確にしたい場合は以下を検討する。

### 案A: caliberRole を追加する

```txt
PricingRule.caliberRole
  ACTUAL（実搭載Cal）
  BASE（ベースCal）
  ANY（どちらでも可）
```

メリット:

```txt
既存 caliberId を活かせる
単一Cal IDのまま意味だけを補える
```

注意:

```txt
既存データの role 初期値をどうするか決める必要がある
```

### 案B: movementCaliberId / baseMovementCaliberId を追加する

```txt
PricingRule.movementCaliberId
PricingRule.baseMovementCaliberId
```

メリット:

```txt
Repair側の保存fieldと対応が明確
CalとBase Calを同時条件にできる
```

注意:

```txt
既存 caliberId との移行が必要
検索条件が複雑になる
```

### 案C: PricingRuleConditionを別テーブル化する

価格ルールが増え、条件が複雑になった場合は以下を検討する。

```txt
PricingRule
PricingRuleCondition
```

ただし現時点では過剰。

## 実装時のリスク

### 1. 現行 `getPricingRules()` は brandId 必須

Cal単独価格や作業内容のみ価格を返すには、`brandId` 必須条件を緩める必要がある。

### 2. customerType が未接続

schemaにはあるが、取得・自動作成で未使用。

B2B / B2C価格を導入する場合は、既存候補が急に出なくならないよう `customerType null` を共通価格として扱う必要がある。

### 3. 作業内容構造fieldが未接続

schemaにはあるが、既存PricingRuleの多くは `suggestedWorkName` 中心。

構造化fieldをいきなり必須にすると既存候補が消える。

### 4. 自動作成・更新が単純すぎる

現行Repair保存APIは技術料行から自動で PricingRule を作る。

構造化fieldや customerType をいきなり自動保存すると、細かすぎる価格ルールが増える可能性がある。

### 5. Cal / Base Calの意味が `PricingRule.caliberId` だけでは分からない

短期案では検索側の優先順位で意味を補う。

中期的には `caliberRole` などの明示fieldを検討する。

## 変更してはいけないもの

このTaskでは以下を変更していない。

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
ローカルDB上のPricingRule既存件数
customerTypeが入っているPricingRuleの有無
repairWorkCategoryId / repairWorkActionId / targetPartNameId / detailLabel が入っているPricingRuleの有無
同じ suggestedWorkName + brandId + caliberId で重複するPricingRuleの有無
```

このTaskではDB読み取り調査は行っていない。

## 次Task候補

```txt
Task 108-10W:
PricingRule既存データの分布をローカルDBで確認する。
customerType / 作業構造field / caliberId の入力状況を集計する。
```

```txt
Task 108-10X:
schema変更なしで、getPricingRules() を Cal → Base Cal → Watch Cal → Calなし の優先順位で返す設計を詰める。
```

```txt
Task 108-10Y:
PricingRule自動作成・更新で、構造化作業fieldやcustomerTypeをいつ使うか設計する。
```
