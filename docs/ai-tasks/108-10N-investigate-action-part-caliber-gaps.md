# Task 108-10N: 15処置 + ムーブメント部品名 + Calマスタ方針の既存schema/seed差分調査

## 目的

Task 108-10M のマスタ責務方針を基準に、現行の schema（スキーマ）・seed（初期データ）・UI（画面）・actions（アクション）がどこまで対応済みか、どこに差分があるかを整理する。

このTaskでは調査と差分整理のみ行い、schema / migration / seed / DB / API / UI / 保存処理は変更しない。

## 前提commit

```txt
3c46471 docs: document master responsibility overview
```

作業前確認:

```txt
git status --short
→ clean

git log --oneline -8
→ 3c46471 docs: document master responsibility overview
→ 33b7e8a docs: design target part filtering by work category
→ d5b856a feat: improve repair entry layout and structured work persistence
→ 2643202 feat: select target part name for structured work
→ f54d465 feat: select repair work category and action
→ 5572ebc docs: design structured work master select UI
→ 94c462f feat: add minimal structured work input UI
→ c370ba2 docs: design structured input flow
```

## 調査対象ファイル

確認したファイル:

```txt
docs/ai-tasks/108-10M-master-responsibility-overview.md
docs/ai-tasks/108-10K-design-target-part-filter-by-work-category.md
docs/ai-tasks/108-10F-ensure-structured-work-roundtrip.md
docs/ai-tasks/108-10H-reorganize-repair-entry-form-layout.md
docs/ai-tasks/109-3-seed-internal-part-name-diff.md
prisma/schema.prisma
prisma/seed.ts
src/lib/part-input-options.ts
src/actions/master-actions.ts
src/components/repairs/RepairEntryForm.tsx
src/app/(app)/repairs/[id]/page.tsx
```

存在しなかったファイル:

```txt
docs/ai-tasks/108-9-design-internal-repair-work-name-seed-candidates.md
```

## RepairWorkAction（処置マスタ）15個方針との差分

### 最新方針

RepairWorkAction（処置マスタ）は以下15個で初期固定する。

```txt
交換
修理
調整
修正
研磨
洗浄
注油
製作
取付
除去
穴締め
かしめ
オーバーホール
検査
その他
```

### 現schema

`RepairWorkAction（処置マスタ）` は以下のfieldを持つ。

```txt
id（処置ID）
name（安定キー）
displayName（表示名）
sortOrder（並び順）
isActive（有効フラグ）
createdAt（作成日時）
updatedAt（更新日時）
```

schema構造としては15処置方針に対応可能。schema変更は不要。

### 現seed

`prisma/seed.ts` の現行seedは12件。

| name（キー） | displayName（表示名） | sortOrder（並び順） | 状態 |
| --- | --- | ---: | --- |
| `exchange` | 交換 | 10 | 既存 |
| `repair` | 修理 | 20 | 既存 |
| `adjust` | 調整 | 30 | 既存 |
| `correction` | 修正 | 40 | 既存 |
| `polish` | 研磨 | 50 | 既存 |
| `clean` | 洗浄 | 60 | 既存 |
| `oil` | 注油 | 70 | 既存 |
| `make` | 製作 | 80 | 既存 |
| `install` | 取付 | 90 | 既存 |
| `remove` | 除去 | 100 | 既存 |
| `hole_tightening` | 穴締め | 110 | 既存 |
| `staking` | かしめ | 120 | 既存 |

不足している3件:

| 追加候補name（キー） | displayName（表示名） | sortOrder（並び順） | 用途 |
| --- | --- | ---: | --- |
| `overhaul` | オーバーホール | 130 | ムーブメント全体作業。件数が多いため独立処置 |
| `inspection` | 検査 | 140 | 防水・動作・精度・消費電流などをdetailで吸収 |
| `other` | その他 | 150 | 磁気抜きなど少数作業の逃げ道 |

### 次Taskで必要なseed差分

```txt
RepairWorkAction seedに overhaul / inspection / other をupsert追加する。
既存12件は維持する。
schema変更は不要。
```

## PartNameMaster（標準部品名マスタ）のムーブメント有無

### 最新方針

PartNameMaster（標準部品名マスタ）に「ムーブメント」を追加候補とする。

目的:

```txt
ムーブメントカテゴリでも、部品名欄を選択式で統一できるようにするため。
```

使用例:

```txt
カテゴリ: ムーブメント
部品名: ムーブメント
処置: オーバーホール
詳細: なし

カテゴリ: ムーブメント
部品名: ムーブメント
処置: 検査
詳細: 動作

カテゴリ: ムーブメント
部品名: ムーブメント
処置: その他
詳細: 磁気抜き
```

### 現状

`src/lib/part-input-options.ts` には、PartNameMaster（標準部品名マスタ）用の `movement / ムーブメント` は存在しない。

確認できた近いkey:

```txt
movement_case_screw
→ 機止めネジ

main_plate
→ 地板
```

これらは「ムーブメント全体」を表す標準部品名ではない。

### 「ムーブメント一式」の扱い

現行 `src/lib/part-input-options.ts` には「ムーブメント一式」という正式部品名は確認できない。

最新方針どおり、次Taskでも「ムーブメント一式」は正式部品名として採用しない。

### category（カテゴリ）候補

`PartNameMaster（標準部品名マスタ）` は `categoryId（部品カテゴリID）` が必須であり、`PartCategoryMaster（部品カテゴリマスタ）` に所属する必要がある。

現行 `PartCategoryMaster（部品カテゴリマスタ）` の内装カテゴリには、`movement` 相当のカテゴリがない。

そのため、次Task候補は以下。

```txt
PartCategoryMaster
- key: movement
- partType: part_internal
- nameJa: ムーブメント
- nameEn: Movement
- sortOrder: 5 など

PartNameMaster
- key: movement
- categoryKey: movement
- partType: part_internal
- nameJa: ムーブメント
- nameEn: Movement
```

schema変更は不要だが、seed差分は必要。

## MovementCaliber（ムーブメントCalマスタ）現schema調査

### 現schemaに MovementMaker（ムーブメント製造元マスタ）相当があるか

独立した `MovementMaker` model は存在しない。

現状は `Brand（ブランド）` を、以下のrelationでも兼用している。

```txt
Repair.movementMakerId（ムーブメント製造元ID）
Repair.baseMovementMakerId（ベースムーブメント製造元ID）
PartsMaster.movementMakerId（部品用ムーブメント製造元ID）
PartsMaster.baseMakerId（部品用ベース製造元ID）
```

つまり、ムーブメント製造元マスタ相当は現schemaでは `Brand（ブランド）` 兼用。

### 現schemaに MovementCaliber（ムーブメントCalマスタ）相当があるか

`Caliber（Calマスタ）` が存在する。

主なfield:

```txt
id（Cal ID）
brandId（製造元IDとして使われるBrand ID）
name（Cal名）
nameEn（英語名）
nameJp（日本語名）
movementType（ムーブメント種別）
standardWorkMinutes（標準作業分）
```

`Caliber（Calマスタ）` は `brandId（製造元ID）` を持つが、field名は `makerId（製造元ID）` ではない。

### Repair（案件）のCal参照

`Repair（案件）` は以下を持つ。

```txt
movementMakerId（ムーブメント製造元ID）
movementCaliberId（実ムーブメントCal ID）
baseMovementMakerId（ベースムーブメント製造元ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

これは最新方針の保存参照に近い。

ただし、最新方針では保存上は以下2本のCal参照に寄せる。

```txt
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

その場合、`movementMakerId（ムーブメント製造元ID）` と `baseMovementMakerId（ベースムーブメント製造元ID）` は、将来的には `Caliber.brandId（Cal側の製造元ID）` から導出できる可能性がある。

現時点では後方互換・UI入力のため残っている。

### Watch（時計情報）のCal参照

`Watch（時計情報）` は以下を持つ。

```txt
caliberId（Cal ID）
```

`Watch（時計情報）` には以下はない。

```txt
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

現状、通常Repairのムーブメント/ベースCal情報は `Repair（案件）` 側に保存される。

### 旧来の caliber（自由入力Cal）や caliberId

UI上は `RepairEntryForm` に `caliber（Cal文字列state）` がある。

保存payloadでは以下を送る。

```txt
watch.caliber（時計Cal文字列）
watch.movementMaker（ムーブメント製造元文字列）
watch.movementCaliber（ムーブメントCal文字列）
watch.baseMovementMaker（ベース製造元文字列）
watch.baseMovementCaliber（ベースCal文字列）
```

API側でこれらをマスタへ対応付ける想定。

## ①〜④を1つのCalマスタから引く方針との整合

最新方針:

```txt
1. ムーブメント製造元
2. ムーブメント製造元Cal
3. ベースムーブメント製造元
4. ベースムーブメントCal

これらは1つの MovementCaliber（ムーブメントCalマスタ）系から引く。
```

現schemaとの整合:

```txt
Caliber（Calマスタ）は1つで、実Cal/ベースCalの両方から参照できる。
Caliber側に「ベースCal」属性はない。
Repairには movementCaliberId / baseMovementCaliberId がある。
PartsMasterにも caliberId / baseCaliberId がある。
```

したがって、schemaの大枠は方針に合っている。

差分・懸念:

```txt
独立MovementMaker modelはない。Brand兼用。
Caliber.brandId は makerId という名前ではない。
Repairに movementMakerId / baseMovementMakerId が残っており、Caliber.brandIdとの二重管理になり得る。
Watchには baseMovementCaliberId がない。
RepairEntryFormには Cal / ムーブCal / ベースCal が並び、UI上の重複感がある。
```

次Taskで検討するschema候補:

```txt
短期:
schema変更なし。
UI・actions上で Caliber を共通Cal候補として扱う。

中期:
movementMakerId / baseMovementMakerId をCaliber.brandIdから導出する方針に寄せられるか確認。
ただし既存データ互換のため即削除しない。

長期:
Brand（時計ブランド）と MovementMaker（ムーブメント製造元）を分ける専用modelが必要か判断。
```

## RepairEntryForm（案件入力フォーム）のCal表示調査

### 現UI項目

時計情報カードには以下が表示されている。

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

### state / field対応

| UI表示 | state（状態） | 保存payload | 備考 |
| --- | --- | --- | --- |
| Cal | `caliber` | `watch.caliber` | `initialData.watch.caliber.name` 由来 |
| ムーブ製造元 | `movementMaker` | `watch.movementMaker` | `initialData.movementMaker.name` 由来 |
| ムーブCal | `movementCaliber` | `watch.movementCaliber` | `initialData.movementCaliber.name` 由来 |
| ベース製造元 | `baseMovementMaker` | `watch.baseMovementMaker` | `initialData.baseMovementMaker.name` 由来 |
| ベースCal | `baseMovementCaliber` | `watch.baseMovementCaliber` | `initialData.baseMovementCaliber.name` 由来 |

### 重複の有無

現UIでは以下が重複して見える可能性がある。

```txt
Cal
ムーブCal
```

`Cal` は Watch（時計情報）の従来Cal、`ムーブCal` は Repair（案件）側の実ムーブメントCalとして扱われている。

最新方針では、将来的に表示は以下へ寄せるのが自然。

```txt
通常表示:
Cal.       OMEGA 1120
Base Cal.  ETA 2892.A2

編集時:
ムーブメント製造元        OMEGA
ムーブメントCal           1120
ベースムーブメント製造元  ETA
ベースムーブメントCal     2892.A2
```

### 次Taskで変えるべきこと

今回UIは変更しない。

次Task候補:

```txt
Cal欄とムーブCal欄の役割を明確化する。
通常表示では Cal. / Base Cal. にまとめる。
編集時だけ4欄表示する。
保存上は movementCaliberId / baseMovementCaliberId を正とする。
watch.caliber と Repair.movementCaliber の同期/移行方針を整理する。
```

## PartsMaster（実部品・在庫マスタ）とCalマスタの関係

### 現schema

`PartsMaster（実部品・在庫マスタ）` は Caliber（ムーブメントCalマスタ）を参照している。

```txt
caliberId（実Cal ID）
baseCaliberId（ベースCal ID）
movementMakerId（ムーブメント製造元ID）
baseMakerId（ベース製造元ID）
```

relations:

```txt
caliber → Caliber（PartsCaliber）
baseCaliber → Caliber（PartsBaseCaliber）
movementMaker → Brand（PartsMovementMaker）
baseMaker → Brand（PartsBaseMaker）
```

### brandId（時計ブランドID）との関係

PartsMaster（実部品・在庫マスタ）には以下もある。

```txt
brandId（時計ブランドID）
modelId（モデルID）
watchRefs（対応Ref）
```

外装部品や時計ブランド依存部品では `brandId` を使う。

内装部品では最新方針上、時計ブランドよりも `movementMakerId / caliberId` と `baseMakerId / baseCaliberId` を優先する。

### 実Cal用部品とベースCal用部品の両方検索

`getPartsMatched（部品候補取得）` は以下を受け取る。

```txt
movementMakerId
movementCaliberId
baseMovementMakerId
baseMovementCaliberId
```

内装部品では以下の両方を検索条件にしている。

```txt
movementMakerId + caliberId
baseMakerId + baseCaliberId
```

さらにscoreも以下を分けている。

```txt
実Cal一致
ベースCal一致
部品Ref一致
部品名一致
```

したがって、OMEGA 1120用部品と ETA 2892.A2用部品を両方候補に出せる構造は既にある。

### 差分・懸念

```txt
PartsMasterの内装判定は partType = interior または category = internal。
PartNameMaster側は part_internal / internal / interior を許容しており、値体系がまだ揺れている。
内装部品では brandId を使わない方針だが、PartsMasterにはbrandIdも残っている。
これは外装やブランド専用品との互換のため残すが、検索方針で混同しないようにする。
```

## PricingRule（価格ルール）とCal方針の関係

### 現schema

`PricingRule（価格ルール）` は以下を持つ。

```txt
brandId（時計ブランドID）
modelId（モデルID）
caliberId（Cal ID）
customerType（顧客区分）
minPrice（最小価格）
maxPrice（最大価格）
suggestedWorkName（既存互換の作業名候補）
notes（メモ）
repairWorkCategoryId（作業カテゴリID）
repairWorkActionId（処置ID）
targetPartNameId（作業対象部品名ID）
detailLabel（詳細）
```

構造化作業fieldとの接続はある。

不足しているfield:

```txt
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

現状は単一の `caliberId（Cal ID）` だけ。

### 現在の価格候補取得

`getPricingRules（価格ルール取得）` は以下を条件にしている。

```txt
brandId
modelId
caliberId
```

RepairEntryForm側では、価格候補用 `pricingCaliberId` を以下の優先で作っている。

```txt
movementCaliber
baseMovementCaliber
caliber
```

つまり、UI/state上は実Cal・ベースCal・従来Calを見ているが、PricingRule検索に渡す時点では単一 `caliberId` に潰している。

### 最新方針との差分

最新方針の内装価格候補優先順位:

```txt
1. 時計ブランド + 実ムーブメントCal + 作業内容
2. 実ムーブメントCal + 作業内容
3. 時計ブランド + ベースムーブメントCal + 作業内容
4. ベースムーブメントCal + 作業内容
5. 時計ブランド + 作業内容
6. 作業内容のみ
```

現状との差分:

```txt
PricingRuleに実Cal/ベースCalを区別するfieldがない。
getPricingRulesはbrandId必須で、Cal単独候補を返しにくい。
作業内容構造fieldはschemaにあるが、取得条件ではまだ十分使っていない。
customerType（顧客区分）はschemaにあるが、取得関数ではまだ明確に使っていない。
```

次Task候補:

```txt
PricingRuleのCal方針を整理する。
単一 caliberId を維持するか、movementCaliberId / baseMovementCaliberId を追加するか検討する。
または role = ACTUAL / BASE のような扱いを追加するか検討する。
getPricingRulesの優先順位を最新方針へ寄せる設計docsを作る。
```

## 108-10L再開時の注意点

108-10L（作業カテゴリに応じた対象部品候補絞り込み）を再開する場合、以下を守る。

```txt
1. 対象部品候補は確定リスト準拠にする。
2. movementカテゴリでは「ムーブメント」だけを候補にする。
3. mappingなしカテゴリで全件fallbackしない。
4. 候補0件時も全件fallbackしない。
5. PartNameMasterに存在するだけで勝手に候補へ入れない。
6. 不採用候補は入れない。
7. targetPartNameId（作業対象部品名ID）と partsMasterId（実部品ID）を混同しない。
```

### 108-10K時点からの修正点

108-10Kでは短期案として「マッピングなしカテゴリは全件fallback」「候補0件も全件fallback」を許容していた。

最新方針ではこれは修正する。

```txt
movementカテゴリ
→ PartNameMasterに「ムーブメント」を追加した後、候補は「ムーブメント」のみ。

mappingなしカテゴリ
→ 全件fallbackしない。
→ 候補なし、またはカテゴリ設計不足としてreview扱い。

候補0件
→ 全件fallbackしない。
→ seed不足・mapping不足として明示する。
```

### 次回実装の前提差分

108-10Lを再開する前に、まず以下が必要。

```txt
RepairWorkAction 15件seed差分
PartCategoryMaster movement 追加候補
PartNameMaster movement 追加候補
movementカテゴリ用 targetPartNameId mapping
```

## 次Task候補

### Task 108-10O: RepairWorkAction 15処置seed差分設計

```txt
overhaul / オーバーホール
inspection / 検査
other / その他
```

を既存12件に追加するseed差分を設計する。

### Task 108-10P: PartNameMasterにムーブメントを追加するseed差分設計

```txt
PartCategoryMaster movement / ムーブメント
PartNameMaster movement / ムーブメント
```

を追加するか、既存カテゴリへ所属させるかを決める。

### Task 108-10Q: Cal表示・保存方針整理

```txt
Cal
ムーブ製造元
ムーブCal
ベース製造元
ベースCal
```

のUI/保存責務を整理し、通常表示と編集表示を分けるか判断する。

### Task 108-10R: PricingRuleのCal優先順位設計

内装価格候補を以下へ寄せる。

```txt
時計ブランド + 実ムーブメントCal + 作業内容
実ムーブメントCal + 作業内容
時計ブランド + ベースムーブメントCal + 作業内容
ベースムーブメントCal + 作業内容
時計ブランド + 作業内容
作業内容のみ
```

## 変更してはいけないもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
DB
API
UI
RepairEntryForm
PricingRule
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
```

## 未確認点

```txt
API route側で watch.caliber / movementCaliber / baseMovementCaliber をどのように findOrCreate しているかの詳細。
movementMakerId / baseMovementMakerId を将来Caliber.brandIdから導出できるか。
Watch側にも baseMovementCaliberId を持たせる必要があるか。
PricingRuleで単一 caliberId を維持するか、実Cal/ベースCalを分けるか。
PartCategoryMaster movement を新設するか、既存カテゴリにムーブメントを所属させるか。
```

