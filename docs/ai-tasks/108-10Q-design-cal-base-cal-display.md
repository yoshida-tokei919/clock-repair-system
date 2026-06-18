# Task 108-10Q: RepairEntryFormのCal / Base Cal表示整理の設計調査

## 目的

RepairEntryForm（案件入力フォーム）の時計情報欄にあるCal関連表示を、今後以下のUI方針へ整理するために、現schema、現UI、保存処理、候補取得、部品検索、PricingRule接続を調査した。

```txt
Cal
  メーカー   OMEGA
  Cal        1120

Base Cal
  メーカー   ETA
  Cal        2892.A2
```

このTaskでは実装変更は行わない。

## 前提commit

```txt
4882e9d feat: filter target parts by confirmed work category mapping
0a30b83 feat: seed movement part and additional repair actions
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
src/lib/part-search.ts
src/lib/part-input-options.ts
src/lib/master-normalize.ts
src/lib/repairs.ts
docs/ai-tasks/108-10M-master-responsibility-overview.md
docs/ai-tasks/108-10N-investigate-action-part-caliber-gaps.md
```

存在しなかったファイル:

```txt
src/lib/parts-matching.ts
```

現状の部品候補取得は `src/actions/master-actions.ts` の `getPartsMatched()` と `src/lib/part-search.ts` が担っている。

## 現schemaのCal関連field

### Repair

`Repair（案件）` には以下が存在する。

| field | 型 | relation | 現在の意味 |
| --- | --- | --- | --- |
| `movementMakerId` | `Int?` | `Brand` | 実Calメーカー。独立MovementMaker modelはなくBrand兼用 |
| `movementCaliberId` | `Int?` | `Caliber` | 実搭載Cal ID |
| `baseMovementMakerId` | `Int?` | `Brand` | Base Calメーカー。Brand兼用 |
| `baseMovementCaliberId` | `Int?` | `Caliber` | 元になったBase Cal ID |

`Repair` 自体に `caliberId` はない。従来の時計Calは `Watch.caliberId` に保存される。

### Watch

`Watch（時計情報）` には以下が存在する。

| field | 型 | relation | 現在の意味 |
| --- | --- | --- | --- |
| `caliberId` | `Int?` | `Caliber` | 時計情報側の従来Cal |

`Watch` には `baseMovementCaliberId` はない。通常Repairの実Cal / Base Calは `Repair` 側に保存される。

### Caliber

`Caliber（Calマスタ）` は1つの共通Calマスタとして存在する。

```txt
id
brandId
name
nameEn
nameJp
movementType
standardWorkMinutes
```

`brandId` は製造元IDとして使われるが、field名は `makerId` ではない。`Caliber` 側に「実Cal」「Base Cal」という属性はなく、案件側で `movementCaliberId` に参照されればCal、`baseMovementCaliberId` に参照されればBase Calとして扱われる。

### PartsMaster

`PartsMaster（実部品・在庫マスタ）` には以下が存在する。

```txt
caliberId
baseCaliberId
movementMakerId
baseMakerId
```

内装部品では `movementMakerId + caliberId` と `baseMakerId + baseCaliberId` の両方が検索に使われる。

### PricingRule

`PricingRule（価格ルール）` には単一の `caliberId` がある。

```txt
brandId
modelId
caliberId
customerType
suggestedWorkName
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabel
```

実Cal / Base Calを区別するfieldは現状ない。

## RepairEntryFormの現状UI

時計情報カードのCal関連項目は、現在以下の順に表示される。

```txt
ブランド
モデル
Ref
Cal
ムーブ製造元
ムーブCal
ベース製造元
ベースCal
シリアル
付属品
```

各項目の現状:

| UI表示 | state | 初期値 | 候補 |
| --- | --- | --- | --- |
| Cal | `caliber` | `initialData.watch.caliber.name` | `calOpts` |
| ムーブ製造元 | `movementMaker` | `initialData.movementMaker.name` | `brandOpts` |
| ムーブCal | `movementCaliber` | `initialData.movementCaliber.name` | `masterCalOpts` |
| ベース製造元 | `baseMovementMaker` | `initialData.baseMovementMaker.name` | `brandOpts` |
| ベースCal | `baseMovementCaliber` | `initialData.baseMovementCaliber.name` | `masterCalOpts` |

`AdvancedCombobox` を使っており、ブランド/メーカーは `onUpsert` で画面上の候補追加が可能。Cal側は `masterCalOpts` / `calOpts` の候補から選ぶが、入力値自体はstate文字列として扱われる。

現UIの問題:

```txt
Cal
ムーブCal
ベースCal
```

が縦に並び、`Cal` と `ムーブCal` の意味が重複して見えやすい。

## 保存処理の現状

### RepairEntryForm payload

保存payloadでは以下を `watch` に載せている。

```txt
watch.brand
watch.model
watch.ref
watch.serial
watch.caliber
watch.movementMaker
watch.movementCaliber
watch.baseMovementMaker
watch.baseMovementCaliber
```

### 新規作成API

`src/app/api/repairs/route.ts` では以下のように保存する。

```txt
watch.caliber
→ findOrCreateCaliber(..., brand.id)
→ Watch.caliberId

watch.movementMaker
→ findOrCreateBrand()
→ Repair.movementMakerId

watch.movementCaliber
→ findOrCreateCaliber(..., movementMakerId)
→ Repair.movementCaliberId

watch.baseMovementMaker
→ findOrCreateBrand()
→ Repair.baseMovementMakerId

watch.baseMovementCaliber
→ findOrCreateCaliber(..., baseMovementMakerId)
→ Repair.baseMovementCaliberId
```

`WatchReference` が既存で `caliberId` を持つ場合、`watch.caliber` が未指定なら `Watch.caliberId` に補完される。

### 更新API

`src/app/api/repairs/[id]/route.ts` でも同様に、`watch.caliber` は `Watch.caliberId`、`movement*` / `baseMovement*` は `Repair` 側の4fieldへ保存される。

更新時は `movementMaker` / `movementCaliber` / `baseMovementMaker` / `baseMovementCaliber` が空なら、それぞれ `null` へ更新される。

### 帳票向けlib

`src/lib/repairs.ts` の `getRepairDataForPDF()` は現状 `Repair.movementCaliber` / `baseMovementCaliber` を帳票データへ載せていない。時計情報としては `brand/model/ref/serial` が中心で、Cal表示整理とは別Taskで扱う必要がある。

## 候補取得の現状

### Brand / Maker

`getBrands()` から `brandOpts` を作り、時計ブランド・ムーブ製造元・ベース製造元で共用している。

現schemaに独立 `MovementMaker` model はないため、ムーブメント製造元も `Brand` で表現している。

### Caliber

初期ロードで `getCalibers()` を呼び、全Cal候補を `masterCalOpts` に入れている。

モデル選択時には以下も動く。

```txt
getRefsByModel(modelId)
getCalibersForModel(brandId, modelId)
```

`getCalibersForModel()` は `WatchReference` / `PartsMaster` / `PricingRule` から、そのブランド・モデルに紐づく `caliberId` を集め、なければブランドの全Calへfallbackする。

Ref選択時は `WatchReference.caliber` があれば `caliber` stateへ自動セットする。

### Cal / Base Cal候補の課題

`movementCaliber` と `baseMovementCaliber` は `masterCalOpts` を使っており、メーカー選択に応じた絞り込みは現状ない。

将来的には以下が望ましい。

```txt
Cal > メーカーを選ぶ
→ Cal > Cal候補をそのメーカーのCalに絞る

Base Cal > メーカーを選ぶ
→ Base Cal > Cal候補をそのメーカーのCalに絞る
```

## 部品検索との接続

Cal / Base Cal はどちらも部品検索に使われている。

### PartsMaster検索

`RepairEntryForm` から `getPartsMatched()` に以下を渡している。

```txt
brandId
modelId
watch.caliber由来の caliberId
movementMakerId
movementCaliberId
baseMovementMakerId
baseMovementCaliberId
searchTerm
```

`getPartsMatched()` は内装部品について、以下の両方を検索する。

```txt
movementMakerId + caliberId
baseMakerId + baseCaliberId
```

スコアリングも実Cal一致とBase Cal一致を分けている。

```txt
実Cal + 部品Ref一致
Base Cal + 部品Ref一致
実Cal + 部品名一致
Base Cal + 部品名一致
```

### PartsSearchPanel / 外部検索URL

`RepairEntryForm` の `partSearchContexts` は、内装部品の場合に以下の2系統を作る。

```txt
{ brand: movementMaker, caliber: movementCaliber }
{ brand: baseMovementMaker, caliber: baseMovementCaliber }
```

どちらも空なら従来の `{ brand, caliber }` にfallbackする。

`src/lib/part-search.ts` は渡された `brand` / `caliber` / `partName` / `partRef` を使って検索クエリを作る。つまり、CalとBase Calはどちらも部品探しに使われる。

## PricingRuleとの接続

`PricingRule` は現状、単一 `caliberId` のみを持つ。

`RepairEntryForm` では内装技術料候補取得時に `pricingCaliberId` を以下の優先順で作っている。

```txt
movementCaliber
baseMovementCaliber
watch.caliber
```

そして `getPricingRules(brandId, modelId, pricingCaliberId)` を呼ぶ。

現状の制約:

```txt
実Cal / Base Calの区別はPricingRule側ではできない
複数Cal候補を同時に検索せず、単一caliberIdへ潰している
getPricingRulesはbrandId必須
作業内容構造fieldはschemaにあるが、取得条件ではまだ十分使っていない
```

このTaskではPricingRuleは変更しない。

## Cal / Base Calの意味定義

### Cal

```txt
Cal
= 実搭載Cal。
  価格候補、専用品検索、実Cal基準の部品検索に使う。
```

例:

```txt
Cal
  メーカー   OMEGA
  Cal        1120
```

### Base Cal

```txt
Base Cal
= 元になったCal。
  互換部品、汎用部品検索、価格候補補助に使う。
```

例:

```txt
Base Cal
  メーカー   ETA
  Cal        2892.A2
```

重要:

```txt
Cal / Base Cal はどちらも部品検索に使う。
Base Calだけが部品探し用、という扱いにはしない。
```

## 表示時UI案

viewモードでは、現状の5行を以下の2ブロックへ整理する案を推奨する。

```txt
Cal
  メーカー   OMEGA
  Cal        1120

Base Cal
  メーカー   ETA
  Cal        2892.A2
```

空欄時:

```txt
Cal
  メーカー   未設定
  Cal        未設定

Base Cal
  メーカー   未設定
  Cal        未設定
```

または、未設定行は薄い文字色にする。

表示ラベルでは「ムーブCal」は使わず、`Cal` / `Base Cal` に統一する。

## 編集時UI案

editモードでは、2つの小ブロックに分ける。

```txt
Cal
  メーカー   [select / search]
  Cal        [select / search / free input]

Base Cal
  メーカー   [select / search]
  Cal        [select / search / free input]
```

候補の考え方:

```txt
Cal > メーカー
  時計ブランドを初期候補として選びやすくする。
  ただし自動確定はしすぎない。

Cal > Cal
  Calメーカーに応じて候補を絞る。

Base Cal > メーカー
  ETAなどを選びやすくする。

Base Cal > Cal
  Base Calメーカーに応じて候補を絞る。
```

現行stateとの対応:

```txt
Cal > メーカー
→ movementMaker

Cal > Cal
→ movementCaliber

Base Cal > メーカー
→ baseMovementMaker

Base Cal > Cal
→ baseMovementCaliber
```

`watch.caliber` は従来互換として残すか、実Calへ同期するかを次Taskで決める。

## 新規作成時UI案

新規作成時は以下の補助入力案が自然。

```txt
ブランド: OMEGA
→ Cal > メーカー候補として OMEGA を選びやすくする

Base Cal > メーカー
→ ETAなど頻出メーカーを上位表示する
```

ただし、誤登録を避けるため、以下は避ける。

```txt
時計ブランドをCalメーカーへ無条件自動入力
Base CalメーカーをETAへ無条件自動入力
候補なしCalの自動マスタ登録
```

推奨:

```txt
初期候補・補助ボタン・候補上位表示に留める。
保存確定はユーザー操作を正とする。
```

## 自由入力とCalマスタ登録の将来案

将来的には、Cal候補がない場合に自由入力からCalマスタ登録へ進む導線を検討する。

例:

```txt
Cal > メーカー: OMEGA
Cal > Cal: 1120

候補なしで自由入力
→ 「Calマスタに登録しますか？」
→ はい
→ Caliberに name=1120, brandId=OMEGA を登録
```

現APIは保存時に `findOrCreateCaliber()` を呼ぶため、文字列入力からCaliber作成は既に起きる。ただしUI上では「マスタ登録された」ことが明示されない。今後はreview導線や確認UIを挟む余地がある。

## 実装時のリスク

1. `watch.caliber` と `Repair.movementCaliberId` の二重管理

現状、`Cal` UIは `watch.caliber` を指し、実搭載Calは `movementCaliber` を指す。表示を `Cal` / `Base Cal` に整理する場合、`watch.caliber` をどう扱うかを先に決める必要がある。

2. MovementMakerのBrand兼用

独立 `MovementMaker` model はない。ETAやLemaniaなども `Brand` に入るため、時計ブランドとムーブメント製造元の候補が混ざる。

3. PricingRuleは単一caliberId

UI上はCal / Base Calを分けても、価格候補取得では単一 `caliberId` に潰している。表示整理と価格候補精度改善は別Taskで分ける。

4. 部品検索はCal / Base Cal両方を使っている

表示整理で「Base Calだけが部品検索用」のような誤った説明を入れると、既存検索方針と矛盾する。

5. 帳票・共有ページ

このTaskでは帳票や共有ページのCal表示は変更しない。画面表示だけ整理しても、帳票表示との整合は別途確認が必要。

## 変更してはいけないもの

このTaskでは以下を変更しない。

```txt
schema
migration
seed
DB構造
RepairEntryFormのUI実装
保存処理
PartsMaster検索
getPartsMatched
PartsSearchPanel
PricingRule
帳票
PDF
LINE
共有ページ
PublicCase
```

## 次Task候補

```txt
Task 108-10R:
RepairEntryFormの時計情報欄を、Cal / Base Cal の2ブロック表示へ最小UI変更する。
schema・保存処理・部品検索・PricingRuleは変更しない。
```

```txt
Task 108-10S:
PricingRuleのCal優先順位を、実Cal / Base Cal / 作業内容構造fieldに基づいて再設計する。
```

```txt
Task 108-10T:
watch.caliber と Repair.movementCaliberId の同期・移行方針を整理する。
```

