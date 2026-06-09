# Task 109-0: 既存部品マスタを内装部品マスタとして少ない修正で使えるか確認

## 1. 目的

現在の `PartCategoryMaster` / `PartNameMaster` / `PartsMaster` が、今後作る内装部品マスタとして少ない修正で使えるか確認する。

このTaskでは、部品マスタを作り直す前提にはしない。既存schema、seed、ローカルDB内容を調査し、流用可能性を判断する。

## 2. 前提

部品マスタと作業マスタは別物。

```txt
部品マスタ
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ

作業マスタ
-> 案件入力・作業内容・処置・技術料・B2B/B2C表示名のためのマスタ
```

現在の作業マスタ側では、`RepairWorkName.targetPartNameId` が `PartNameMaster` を任意参照できる構造になっている。

## 3. 調査対象model

確認したmodel:

```txt
PartCategoryMaster
PartNameMaster
PartGradeMaster
PartsMaster
RepairWorkName
```

確認したseed / 定義:

```txt
prisma/seed.ts
scripts/seed-part-standard-masters.ts
src/lib/part-input-options.ts
```

確認したDB:

```txt
localhost:54322/clock_repair_local
```

`.env` はリモートSupabase向きのため、DB読み取り時はローカルDB接続先を明示した。本番/リモートDBには触っていない。

## 4. PartCategoryMaster schema現状

```txt
id        String @id @default(cuid())
key       String @unique
partType  String
nameJa    String
nameEn    String?
sortOrder Int @default(0)
isActive  Boolean @default(true)
createdAt DateTime
updatedAt DateTime
partNames PartNameMaster[]
```

特徴:

```txt
idはString cuid
stable keyあり
partTypeで内装/外装相当を区別できる
日本語名/英語名を持てる
sortOrderあり
isActiveあり
階層はない
alias/searchKeywords/source/reviewStatusはない
```

現在の `partType` 値は標準部品マスタ側では主に以下。

```txt
part_internal
part_external
```

## 5. PartNameMaster schema現状

```txt
id         String @id @default(cuid())
key        String @unique
categoryId String
partType   String
nameJa     String
nameEn     String?
displayJa  String?
displayEn  String?
sortOrder  Int @default(0)
isActive   Boolean @default(true)
category   PartCategoryMaster
parts      PartsMaster[]
repairWorkNames RepairWorkName[]
createdAt  DateTime
updatedAt  DateTime
```

特徴:

```txt
idはString cuid
stable keyあり
PartCategoryMasterへ必須所属
partTypeを持つため、カテゴリを辿らなくても内装/外装絞り込み可能
標準名 nameJa/nameEn と表示名 displayJa/displayEn を分けられる
sortOrderあり
isActiveあり
PartsMasterから参照される
RepairWorkName.targetPartNameIdから参照できる
alias/searchKeywords/source/reviewStatusはない
```

## 6. PartsMaster schema現状

`PartsMaster` は実部品レコード。

主なフィールド:

```txt
id Int @id @default(autoincrement())
standardPartNameId String?
gradeId String?
partType String?
category String
subcategory String?
brandId / modelId / watchRefs
caliberId / baseCaliberId / movementMakerId / baseMakerId
name / nameJp / nameEn
partRefs / cousinsNumber
grade / size / photoKey
notes1 / notes2
costCurrency / costOriginal / latestCostYen / markupRate / retailPrice
stockQuantity / minStockAlert / location / supplierId
```

特徴:

```txt
部品名標準化は standardPartNameId で PartNameMaster を参照する
グレード標準化は gradeId で PartGradeMaster を参照する
価格・在庫・仕入先・写真・サイズ・RefなどはPartsMaster側にある
既存互換の category / subcategory / grade / nameJp も残っている
```

注意:

`PartsMaster.partType` には `interior` / `exterior` 系の値が入り得る一方、`PartCategoryMaster.partType` / `PartNameMaster.partType` は `part_internal` / `part_external` を使っている。意味は近いが値体系が異なる。

## 7. 既存seed確認結果

`prisma/seed.ts` には、現在 `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` のseed処理はない。

標準部品マスタのseedは以下に分かれている。

```txt
scripts/seed-part-standard-masters.ts
```

このscriptは以下を元にupsertする。

```txt
src/lib/part-input-options.ts
```

seed内容:

```txt
PART_CATEGORIES -> PartCategoryMaster
PART_NAME_OPTIONS -> PartNameMaster
PART_GRADES -> PartGradeMaster
```

seed方式:

```txt
keyでupsert
重複keyを事前チェック
PartNameMasterはcategoryKeyからPartCategoryMasterを解決
PartNameMaster.partType と Category.partType の一致を検証
```

既存seedは冪等性が高く、構造としては再seedしやすい。

ただし、`prisma/seed.ts` 本体とは別scriptなので、通常seedとは実行導線が分かれている。

## 8. ローカルDB確認結果

ローカルDBで確認した件数:

```txt
PartCategoryMaster: 16
PartNameMaster: 223
PartsMaster: 1
PartGradeMaster: 3
```

`PartNameMaster` の内訳:

```txt
part_internal: 150
part_external: 73
```

`PartCategoryMaster` 一覧:

| partType | key | nameJa | PartName件数 |
| --- | --- | --- | ---: |
| part_external | case_glass | ケース・風防 | 14 |
| part_external | crown_tube | リューズ・チューブ | 8 |
| part_external | pushers | プッシャー | 6 |
| part_external | bezel | ベゼル | 8 |
| part_external | dial_hands | 文字盤・針 | 24 |
| part_external | bracelet_band | ブレス・バンド | 13 |
| part_internal | mainspring_barrel | 動力・巻上 | 17 |
| part_internal | train_wheel | 輪列 | 20 |
| part_internal | escapement | 脱進機 | 34 |
| part_internal | balance | 調速機 | 25 |
| part_internal | keyless_works | 針回し | 18 |
| part_internal | calendar | カレンダー | 9 |
| part_internal | automatic_winding | 自動巻 | 8 |
| part_internal | chronograph | クロノグラフ | 9 |
| part_internal | quartz | クォーツ | 6 |
| part_internal | main_plate | 地板 | 4 |

`PartGradeMaster`:

| key | nameJa | nameEn |
| --- | --- | --- |
| genuine | 純正 | genuine |
| fit | FIT | fit / aftermarket |
| custom_fit | 合わせ | custom fit |

`PartsMaster` は1件のみ存在。

確認できた内容:

```txt
partType: exterior
category: external
nameJp: ゼンマイ
standardPartNameId: null
gradeId: null
```

この1件は、外装扱いの実部品に「ゼンマイ」が入っており、現時点の実データとしては整合が怪しい。調査対象として記録し、今回修正はしない。

## 9. 内装部品マスタとして使える点

既存modelは、内装部品マスタの土台としてかなり使える。

理由:

```txt
PartCategoryMaster -> PartNameMaster -> PartsMaster の関係が自然
PartNameMasterは標準部品名、PartsMasterは実部品という責務分離になっている
PartNameMaster.id が RepairWorkName.targetPartNameId から参照できる
partTypeで内装/外装を分けられる
keyでstable参照できる
sortOrderとisActiveがある
nameJa/nameEn/displayJa/displayEnがある
PartsMaster側に在庫・価格・仕入先・サイズ・写真・Refを持てる
既存の標準部品名seedはkey upsertで再投入しやすい
```

特に `RepairWorkName.targetPartNameId` から参照する対象としては、`PartsMaster` ではなく `PartNameMaster` を参照する現在方針とよく合っている。

## 10. 問題点・懸念点

### 既存候補が多い

`PartNameMaster` は既に223件、内装だけで150件ある。

今回の前提では、ユーザー確定済み内装部品名リスト以上にAI側で候補を増やさない方針。したがって、既存seedをそのまま「正式な内装部品マスタ」として扱うのは危険。

### partType値体系が二重

標準部品マスタ:

```txt
part_internal
part_external
```

PartsMaster:

```txt
interior
exterior
category = internal / external / generic
```

同じ内外装区分を表す値体系が複数あるため、UI/APIで変換ルールが必要。

### alias/searchKeywordsがない

表記ゆれや読み、別名をDB上で管理するフィールドはない。

ただし、現段階で無理に入れる必要はない。まずは `key / nameJa / displayJa / nameEn / displayEn` で始められる。

### review/sourceがない

ユーザー確認待ち、新規候補、FMP由来、seed由来などを `PartNameMaster` 側で表現するフィールドはない。

既存候補を正式候補とreview候補に分けたい場合は、後続で `reviewStatus` / `source` の追加を検討する。

### 五番車の扱い

現在DBには以下の両方がある。

```txt
train_wheel: 五番車
quartz: 五番車
```

これまでの方針では、五番車はクォーツカテゴリで採用し、機械式輪列カテゴリには初期採用しない。

そのため、既存 `train_wheel` 側の五番車関連候補は、最新方針と衝突する可能性がある。

### movementカテゴリがない

ユーザー確定済みの作業カテゴリには `ムーブメント` があるが、部品マスタ側の `PartCategoryMaster` には `ムーブメント` カテゴリはない。

ただし、これは必ずしも問題ではない。作業カテゴリとしての `ムーブメント` と、部品カテゴリとしての `ムーブメント` は別物であり、オーバーホールなどでは `PartNameMaster` まで絞らなくてもよい。

## 11. 少ない修正で使う場合に必要な修正候補

### 最小候補

schema変更なしで進める場合:

```txt
既存 PartCategoryMaster / PartNameMaster / PartsMaster を使う
PartNameMaster.partType = part_internal を内装部品名候補として使う
RepairWorkName.targetPartNameId は PartNameMaster.id を参照する
ユーザー確定済みリストと照合し、必要なものだけ active 候補として扱う
既存候補をそのまま全部正式採用しない
```

この場合はC案寄り。

```txt
C案: seed/中身の整理だけで使える
```

### 少しschema追加する候補

将来必要になりそうな候補:

```txt
PartNameMaster.reviewStatus
PartNameMaster.source
PartNameMaster.alias/searchKeywords用の別テーブル
PartCategoryMaster.reviewStatus
PartCategoryMaster.source
```

ただし、`partDomain = INTERNAL / EXTERNAL` のような新規区分は、現状 `partType` があるため初期必須ではない。追加するなら、既存 `part_internal / part_external` との移行方針を先に決める必要がある。

## 12. 既存modelを流用する場合の推奨案

推奨は以下。

```txt
既存modelは流用する。
ただし既存seed/既存DBの全候補を、そのまま正式な内装部品マスタとして採用しない。
まずユーザー確定済み内装部品名リストと既存 PartNameMaster を照合する。
不足・衝突・不要候補をMarkdownで整理する。
その後、seed整理またはisActive整理を行う。
```

判断としては、A案とC案の中間。

```txt
model構造: A案に近い。ほぼそのまま使える。
seed/中身: C案。整理が必要。
```

現時点で部品マスタを作り直す必要は低い。

## 13. 既存modelを流用しない方がよい場合の条件

以下が必要になった場合は、既存model流用だけでは厳しくなる。

```txt
同じ部品名を複数カテゴリに正式所属させたい
部品カテゴリを多階層化したい
alias/searchKeywords/review/sourceを標準マスタ本体で厳密に管理したい
FMP由来候補と通常Repair正式候補を同一テーブル内で明確に分離したい
partType値体系を全面的にINTERNAL/EXTERNAL enumへ統一したい
既存223件を大きく組み替える必要がある
```

ただし、これらも新規model作成ではなく、既存modelへの小さな追加で対応できる可能性が高い。

## 14. RepairWorkName.targetPartNameId への影響

`RepairWorkName.targetPartNameId` は既に `PartNameMaster.id` を参照する設計。

この構造は妥当。

理由:

```txt
作業名は実部品在庫や価格ではなく、標準部品名で絞れればよい
PartsMasterを参照すると、メーカー・型番・在庫・価格に引っ張られすぎる
PartNameMasterなら、ゼンマイ / 巻真 / 裏押さえ などの作業対象として使いやすい
```

注意:

```txt
targetPartNameIdは任意参照のままでよい。
オーバーホール、精度調整、磁気抜きなど、特定部品名に紐づかない作業があるため。
```

## 15. 次Taskへの提案

次Task案:

```txt
Task 109-1:
ユーザー確定済み内装部品名リストと既存PartNameMasterの照合表を作成する。
```

確認内容:

```txt
既存PartNameMasterに既にあるもの
名称変更/alias扱いが必要なもの
カテゴリ移動が必要なもの
不足しているもの
最新方針と衝突するもの
初期seedでisActive=trueにするもの
review扱いにするもの
```

特に確認したい衝突:

```txt
五番車が train_wheel と quartz の両方にある
ムーブメントカテゴリがPartCategoryMaster側にはない
カンヌキ押さえ = 裏押さえ のalias扱い
カンヌキ押さえネジ = 裏押さえネジ のalias扱い
```

## 変更しなかったもの

以下は変更していない。

```txt
prisma/schema.prisma
prisma/seed.ts
scripts/seed-part-standard-masters.ts
src/lib/part-input-options.ts
DB
migration
API
UI
RepairEntryForm
RepairLineItem
PricingRule
帳票
PDF
LINE
PublicCase
PartCategoryMasterデータ
PartNameMasterデータ
PartsMasterデータ
```
