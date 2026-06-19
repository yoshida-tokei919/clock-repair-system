# Task 108-10Y: PricingRuleの作業構造field候補絞り込み設計

## 目的

RepairEntryForm（案件入力フォーム）の内装技術料候補を、作業カテゴリ / 対象部品 / 処置 の選択状態に応じて絞り込むための設計調査を行った。

このTaskでは実装変更は行わない。

目指す挙動:

```txt
作業カテゴリ / 対象部品 / 処置 を選ぶ
→ 上の自由入力欄に表示される PricingRule（価格ルール）候補が、その構造に合うものを優先して表示する
```

UI方針:

```txt
現状の自由入力欄の候補表示を基本にする。
下の作業カテゴリ / 対象部品 / 処置 欄に別候補UIは増やさない。
```

## 前提

直近の関連Task:

```txt
Task 108-10V: PricingRuleのCal / Base Cal優先順位設計調査
Task 108-10W: PricingRule短期実装の影響範囲設計
Task 108-10X: PricingRule短期実装 - Cal / Base Cal / Watch Cal / Calなし 優先取得
```

108-10Xでは、価格候補取得は以下の順になっている。

```txt
1. movementCaliberId（実搭載Cal ID）
2. baseMovementCaliberId（Base Cal ID）
3. watch.caliberId（従来Cal ID）
4. caliberIdなし（Calなし）
```

## 調査対象ファイル

確認したファイル:

```txt
prisma/schema.prisma
src/components/repairs/RepairEntryForm.tsx
src/actions/master-actions.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
src/lib/repair-line-items.ts
docs/ai-tasks/108-10V-design-pricing-rule-cal-base-cal-priority.md
docs/ai-tasks/108-10W-design-pricing-rule-short-term-implementation-scope.md
docs/ai-tasks/108-10X-implement-pricing-rule-cal-base-cal-priority.md
```

存在しなかったファイル:

```txt
src/actions/pricing-actions.ts
src/lib/pricing*
```

## PricingRule（価格ルール）の作業構造field確認

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

確認結果:

| 欲しい概念 | 現schema field | nullable | relation |
| --- | --- | --- | --- |
| workCategoryId（作業カテゴリID） | `repairWorkCategoryId` | nullable | `RepairWorkCategory` |
| targetPartNameId（作業対象部品名ID） | `targetPartNameId` | nullable | `PartNameMaster` |
| actionId（処置ID） | `repairWorkActionId` | nullable | `RepairWorkAction` |
| suggestedWorkName（候補作業名） | `suggestedWorkName` | required | なし |
| brandId（ブランドID） | `brandId` | nullable | 現schema上relation定義なし |
| caliberId（Cal ID） | `caliberId` | nullable | 現schema上relation定義なし |
| customerType（顧客区分） | `customerType` | nullable | なし |
| detail（詳細） | `detailLabel` | nullable | なし |

注意:

```txt
Task文中の workCategoryId / actionId は、現schemaでは repairWorkCategoryId / repairWorkActionId という名前。
```

## getPricingRules（価格候補取得）の現状確認

場所:

```txt
src/actions/master-actions.ts
```

現行引数:

```ts
getPricingRules(brandId?: number, modelId?: number, caliberId?: number)
```

現行検索条件:

```txt
brandId
modelId
caliberId
```

使っている:

```txt
brandId（ブランドID）
modelId（モデルID）
caliberId（Cal ID）
```

使っていない:

```txt
repairWorkCategoryId（作業カテゴリID）
targetPartNameId（作業対象部品名ID）
repairWorkActionId（処置ID）
detailLabel（詳細）
suggestedWorkName（候補作業名）
customerType（顧客区分）
```

戻り値:

```txt
prisma.pricingRule.findMany({ where }) の結果をそのまま返す。
select指定はないため、repairWorkCategoryId / targetPartNameId / repairWorkActionId / detailLabel は戻り値に含まれる。
```

ただし、RepairEntryForm側で `workOpts` に変換する際は、現状以下だけを使っている。

```txt
suggestedWorkName
minPrice
```

そのため、候補表示時点では作業構造fieldがUIに出ていない。

## RepairEntryForm（案件入力フォーム）のstate確認

候補取得時点で参照できる主なstate:

| 概念 | 実際の変数名 | 備考 |
| --- | --- | --- |
| addWorkCategoryId（追加作業カテゴリID） | `newWorkCategoryId` | 文字列。selectのvalue |
| addTargetPartNameId（追加対象部品名ID） | `newTargetPartNameId` | `PartNameMaster.id` の文字列 |
| addWorkActionId（追加処置ID） | `newWorkActionId` | 文字列。selectのvalue |
| newItemName（自由入力欄の作業名） | `newItemName` | 候補名・手入力名 |
| detail（詳細） | `newWorkDetailLabel` | 任意文字列 |
| addItemCategory（追加明細カテゴリ） | `addItemCategory` | `internal` の場合に技術料候補 |
| movementCaliberId（実搭載Cal ID） | `getOptionIdByValue(masterCalOpts, movementCaliber)` | 108-10Xで使用 |
| baseMovementCaliberId（Base Cal ID） | `getOptionIdByValue(masterCalOpts, baseMovementCaliber)` | 108-10Xで使用 |
| watch.caliberId（従来Cal ID） | `calOpts.find(...caliber)?.id` | 108-10Xで使用 |
| brandId（ブランドID） | `brandOpts.find(...brand)?.id` | 既存処理で使用 |

候補取得の発火条件:

```txt
addItemCategory === 'internal'
```

現状の `useEffect` 依存配列には、以下がまだ入っていない。

```txt
newWorkCategoryId
newTargetPartNameId
newWorkActionId
newWorkDetailLabel
```

そのため、作業カテゴリ / 対象部品 / 処置を変えても、価格候補の取得・並び替えにはまだ反映されていない。

## PricingRule（価格ルール）自動作成・更新の現状確認

Repair新規作成API:

```txt
src/app/api/repairs/route.ts
```

Repair更新API:

```txt
src/app/api/repairs/[id]/route.ts
```

現行は、LABOR行（技術料行）から `PricingRule（価格ルール）` を自動作成・更新している。

使っているfield:

```txt
suggestedWorkName
brandId
modelId
caliberId
minPrice
maxPrice
```

使っていないfield:

```txt
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
customerType
```

`suggestedWorkName` は何から作られるか:

```txt
EstimateItem風payloadの item.name
RepairEntryFormでは newItemName または構造化入力から補完した明細名
```

`caliberId` は何を使って保存されるか:

```txt
Repair新規/更新API内の caliberId。
主に Watch.caliberId（従来Cal）側の値。
movementCaliberId / baseMovementCaliberId はPricingRule自動作成にはまだ使っていない。
```

既存データの構造field有無:

```txt
schemaには構造fieldがあるため、既存データに一部入っている可能性はある。
ただし現行の自動作成・更新処理では入れていないため、未設定のPricingRuleが多い可能性が高い。
```

リスク:

```txt
構造field一致だけで厳密絞り込みすると、構造field未設定の既存候補が消える。
```

## 絞り込み方針案

### 案A: 厳密絞り込み

選択済みfieldと一致する PricingRule だけを表示する。

```txt
repairWorkCategoryId 選択済みなら一致必須
targetPartNameId 選択済みなら一致必須
repairWorkActionId 選択済みなら一致必須
```

メリット:

```txt
候補が強く絞れる
意図しない作業候補が出にくい
```

デメリット:

```txt
既存PricingRuleに構造fieldが入っていない場合、候補がほぼ消える。
現行自動作成処理が構造fieldを保存していないため、短期では危険。
```

### 案B: 一致候補を上位表示し、未分類候補も残す

構造field一致候補を上に出す。

構造field未設定の既存候補も下に残す。

メリット:

```txt
既存PricingRuleを消しにくい。
構造化済み候補がある場合は自然に上位へ来る。
短期実装の影響が小さい。
```

デメリット:

```txt
候補数そのものはあまり減らない場合がある。
完全な絞り込みではなく、優先表示に近い。
```

### 案C: score（スコア）方式

以下の一致数でスコアを付けて上位表示する。

```txt
brandId
caliberId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
suggestedWorkName
```

メリット:

```txt
Cal優先順位・作業構造field・作業名一致を統合できる。
中期的には最も拡張しやすい。
```

デメリット:

```txt
実装と説明が複雑になる。
候補表示がなぜその順番なのか分かりにくい。
短期実装としては過剰。
```

### 短期推奨

108-10Zでは案Bを推奨する。

理由:

```txt
既存PricingRuleの多くは構造field未設定の可能性がある。
厳密filterだと候補が消えるリスクが高い。
Cal優先順位は108-10Xで既に実装済みなので、今回はその結果内で構造一致を上位表示するのが安全。
```

## 108-10XのCal優先順位との統合設計

108-10Xの優先順:

```txt
1. movementCaliberId（実搭載Cal ID）
2. baseMovementCaliberId（Base Cal ID）
3. watch.caliberId（従来Cal ID）
4. Calなし
```

統合方針:

```txt
1. まず108-10XのCal優先順位で候補を取得する
2. PricingRule.id で重複排除する
3. 取得済み候補を、作業構造fieldの一致度でgroup分けする
4. 各group内では108-10XのCal優先順位を維持する
```

短期のgroup案:

```txt
Group A: 選択済みのカテゴリ / 対象部品 / 処置がすべて一致する候補
Group B: 一部一致する候補
Group C: 構造fieldがすべて未設定の既存互換候補
Group D: 選択済みfieldと明確に不一致の候補
```

短期実装では、Group Dは表示しない案も検討できる。

ただし、既存データ品質が読めないため、最初は以下が安全。

```txt
完全不一致は下位へ回す
未分類候補は残す
```

より厳密にするのは、DB分布確認後にする。

## 表示UI方針

現状の候補表示:

```txt
上の自由入力欄 AdvancedCombobox の options = workOpts
```

作業カテゴリ / 対象部品 / 処置を選んだとき:

```txt
workOpts の並びを更新する
```

別UIは増やさない。

候補ラベル:

```txt
短期では表示ラベル追加は行わない。
```

理由:

```txt
表示ラベルを足すと AdvancedCombobox の候補表示設計に影響する。
まず候補順だけを改善し、必要なら後続Taskで「構造一致」「汎用」「Cal一致」などのmeta表示を検討する。
```

将来案:

```txt
候補に inlineTag / meta を付ける
例: 構造一致 / 汎用 / Cal専用 / Base Cal
```

## 108-10Z 短期実装案

### 変更ファイル候補

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10Z-implement-pricing-rule-structured-work-priority.md
```

原則変更しない:

```txt
src/actions/master-actions.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
prisma/schema.prisma
PartsMaster検索関連
帳票 / PDF / LINE / 共有ページ / PublicCase
```

### 実装手順

1. RepairEntryFormの価格候補取得後、各PricingRuleに構造一致情報を付ける。

使う選択値:

```txt
newWorkCategoryId
newTargetPartNameId
newWorkActionId
newWorkDetailLabel
```

2. 各PricingRuleを分類する。

```txt
完全一致
一部一致
未分類
不一致
```

3. 表示順を作る。

```txt
完全一致
一部一致
未分類
不一致
```

4. 各分類内では108-10XのCal優先順位を維持する。

5. `PricingRule.id` で重複排除する。

6. `workOpts` へ変換する。

### 既存候補が消えないfallback方針

短期では以下を守る。

```txt
構造fieldが未設定のPricingRuleは残す
選択済みfieldと明確に不一致のPricingRuleを消すかは慎重にする
最初の実装では不一致も下位表示に留める
```

候補数が多すぎる場合は後続Taskで厳密filterへ寄せる。

### 重複排除ルール

```txt
PricingRule.id で重複排除する
suggestedWorkName だけでは潰さない
```

理由:

```txt
同じ作業名でも、Cal / 価格 / 条件が違う候補があり得るため。
```

### 表示順ルール

推奨:

```txt
1. 構造field完全一致 + Cal優先順位順
2. 構造field一部一致 + Cal優先順位順
3. 構造field未分類 + Cal優先順位順
4. 構造field不一致 + Cal優先順位順
```

短期では、構造一致の重みはCal優先順位より上に置く案を推奨する。

理由:

```txt
ユーザーが作業カテゴリ / 対象部品 / 処置を明示的に選んだ直後は、
その作業構造に合う候補を最も見たい可能性が高いため。
```

ただし、Cal専用価格を強く優先したい場合は、Cal group内で構造一致を上位にする案もある。

この点は画面確認で調整する。

### 画面確認手順

```txt
/repairs/new
既存案件詳細 /repairs/[id]
```

確認ポイント:

```txt
作業カテゴリ / 対象部品 / 処置を選ぶと自由入力欄の候補順が変わる
候補が完全に消えすぎない
候補クリック時の明細追加が従来通り動く
手入力で技術料行が追加できる
部品行追加に影響がない
PartsMaster検索 / getPartsMatched / PartsSearchPanel に影響がない
ステータスバーが残る
見積り・修理明細の横幅が狭くならない
```

### 検証コマンド

```powershell
npx prisma validate
npx tsc --noEmit --pretty false --incremental false
```

### リスク

```txt
既存PricingRuleに構造fieldが入っていない場合、実質的には未分類候補が多く残る。
候補順が変わることで、ユーザーが慣れた候補の位置が変わる。
同名候補の見分けはまだ難しい。
```

### 後続Taskに回す項目

```txt
PricingRule自動作成・更新時に構造fieldを保存するか
customerType（顧客区分）を候補条件へ入れるか
候補に「構造一致」「汎用」「Cal専用」などのmeta表示を出すか
厳密filterへ移行する条件
既存PricingRuleの構造field入力状況のDB調査
```

## 変更してはいけないもの

108-10Yでは以下を変更していない。

```txt
schema
migration
seed
DB構造
RepairEntryForm実装
保存処理
PricingRule検索処理
PricingRule自動作成・更新処理
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
ローカルDB上のPricingRuleで構造fieldが入っている件数
未分類候補がどの程度多いか
不一致候補を残すべきか、消すべきか
構造一致をCal優先順位より上に置くべきか、Cal group内の並び替えに留めるべきか
```

このTaskではDB読み取り調査と画面確認は行っていない。
