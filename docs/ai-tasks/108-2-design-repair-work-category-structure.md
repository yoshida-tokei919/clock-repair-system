# Task 108-2: RepairWorkCategory のカテゴリ階層設計

## 1. 概要

Task 108-1で、修理作業マスタのmodel名は以下を採用した。

```txt
RepairWorkCategory
RepairWorkName
```

このTaskでは、`RepairWorkCategory` の役割、内装・外装の区分、カテゴリ階層、初期カテゴリ案、必要フィールドを整理する。

このTaskではschema実装、migration、db push、seed、API、UI、帳票、PublicCase生成は行わない。Markdown設計のみ行う。

## 2. 前提

正本方針:

```txt
部品マスタと作業マスタは別物。
作業マスタは入力補助・標準化・候補選択の元データ。
帳票・共有ページ・PublicCaseへ作業マスタ名を直接表示しない。
RepairLineItemに表示名・価格・参照IDをスナップショット保存する。
EstimateItemは見積発行時点スナップショット。
PublicCaseは公開用スナップショット。
PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない。
旧Excel由来候補や107-5大量seed案を、そのまま正式マスタにしない。
```

現在の本線:

```txt
Repair
-> RepairLineItem
-> EstimateItem
-> 帳票 / 共有ページ

RepairLineItem
-> PublicCase下書き / PublicCase snapshot
```

`RepairWorkCategory` は、この `RepairLineItem` へ接続する前段の入力補助・分類レイヤーとして設計する。

## 3. RepairWorkCategoryの役割

`RepairWorkCategory` は、修理作業を入力・検索・分類するためのカテゴリマスタである。

主な役割:

```txt
内装 / 外装の作業分類を持つ
RepairWorkNameを分類する
入力画面でカテゴリ絞り込み・ドリルダウン検索の元になる
RepairLineItemへ保存する category path snapshot の元データになる
PricingRule候補取得の補助条件になり得る
PublicCase下書き生成時の公開粒度判断の補助情報になり得る
```

役割ではないもの:

```txt
帳票・共有ページ・PublicCaseに直接表示する確定データ
部品在庫・仕入・価格・サイズ・写真・海外検索のためのカテゴリ
FMP過去案件の表記ゆれ補正ルール本体
旧Excel由来作業候補の受け皿そのもの
```

表示時の正:

```txt
RepairWorkCategory / RepairWorkName
-> 入力補助・標準化の元データ

RepairLineItem
-> 案件明細本体。表示名・価格・参照IDをスナップショット保存

EstimateItem
-> 見積発行時点スナップショット

PublicCase
-> 公開用スナップショット
```

## 4. repairTypeの扱い

`RepairWorkCategory` には、内装・外装を区別する `repairType` を持たせる方針とする。

候補:

| 案 | 内容 | 評価 |
|---|---|---|
| A案 | 「内装修理」「外装修理」を最上位カテゴリレコードとして持つ | UI上は分かりやすいが、カテゴリ階層と修理種別が混ざる |
| B案 | `repairType = internal / external` で区別し、「内装修理」「外装修理」はカテゴリレコードにしない | 修理種別とカテゴリを分離できる |
| C案 | `repairType` も持ち、最上位カテゴリレコードも持つ | 冗長になりやすく、入力・seed・検索で混乱しやすい |

推奨はB案。

```txt
「内装修理」「外装修理」はカテゴリレコードにしない。
repairType = internal / external で表現する。
```

理由:

```txt
内装・外装はカテゴリというより修理種別である。
カテゴリ一覧の先頭に常に「内装修理」「外装修理」を混ぜる必要がない。
RepairWorkNameにも同じrepairTypeを持たせると、検索・絞り込みが明確になる。
将来、外装カテゴリを増やしても同じmodelで扱える。
```

`repairType` の型は、初期設計では以下を候補とする。

```txt
internal
external
```

schema実装時には enum にするか String にするかを別Taskで決める。

## 5. parentId階層の扱い

`RepairWorkCategory` は `parentId` を持てる階層型にする方針とする。

候補:

| 案 | 内容 | メリット | デメリット | 判断 |
|---|---|---|---|---|
| A案 | `parentId` なし。1階層のみ | 実装・seedが簡単 | 将来のカテゴリ整理に弱い | 不採用 |
| B案 | `parentId` あり。自由に深い階層を許可 | 拡張性が高い | 入力UIが深くなりすぎる危険がある | そのままは不採用 |
| C案 | `parentId` あり。ただし初期運用は1〜2階層に制限 | 拡張性と入力しやすさのバランスが良い | 運用ルールが必要 | 採用 |

推奨はC案。

```txt
parentIdは持たせる。
ただし初期UI・初期seedでは1〜2階層に抑える。
深い分類が必要になった場合のみ、後続Taskで追加する。
```

理由:

```txt
ドリルダウン検索に使える。
categoryPathSnapshotをRepairLineItemへ保存しやすい。
内装・外装で同じ設計を使える。
ただし階層が深いと、実務入力が遅くなる。
初期は「repairType + 大分類 + 必要なら中分類」程度に留める。
```

初期の入力イメージ:

```txt
repairType: internal
category: カレンダー
workName: 日車交換 / 曜送り修理 など

repairType: external
category: ガラス・風防
workName: ガラス交換 / 風防研磨 など
```

## 6. 内装修理カテゴリ初期案

内装カテゴリは、部品カテゴリと同じ名前が出てもよいが、目的は作業入力・技術料分類であり、部品在庫分類ではない。

初期候補:

| categoryName | 初期扱い | 補足 |
|---|---|---|
| ムーブメント | review | 全体カテゴリとして便利だが広すぎる。大分類にするか、作業名側の「ムーブメント交換」などで扱うか要確認 |
| クォーツ | yes | 電池・回路・コイル・五番車など、クォーツ固有作業をまとめるカテゴリとして使う |
| 動力・巻上 | yes | ゼンマイ、香箱、巻上げ不良、巻真周辺の作業候補に使う |
| 輪列 | yes | 二番車・三番車・四番車・ガンギ車などの機械式輪列系作業に使う |
| 脱進機 | yes | アンクル、ガンギ車調整、振り石などに使う |
| 調速機 | yes | テンプ、天真、ヒゲゼンマイ、精度調整などに使う |
| 針回し | yes | 巻真、ツヅミ車、キチ車、カンヌキ、裏押さえ周辺に使う |
| カレンダー | yes | 日車、曜車、日送り、曜送り、早送り周辺に使う |
| 自動巻 | yes | ローター、ローター真、切替車、自動巻車などに使う |
| クロノグラフ | review | 初期通常Repairで必要な粒度を確認してから採用する。旧Excel候補をそのまま採用しない |
| 地板 | review | 部品カテゴリ寄りになりやすい。作業分類として必要な場合のみ採用する |

五番車の扱い:

```txt
五番車はクォーツカテゴリで扱う。
機械式輪列カテゴリには初期採用しない。
機械式で該当が出た場合は、伝え車 / 中間車 / 出車など既存名称で扱えるか確認し、必要時のみ追加検討する。
```

初期カテゴリは細かくしすぎない。作業名・処置・部品名で表現できるものをカテゴリへ押し込まない。

## 7. 外装修理カテゴリ初期案

外装作業マスタの詳細設計は後続Taskで扱う。ただし、`RepairWorkCategory` は内装・外装共通modelのため、外装カテゴリも同じ設計で扱えるようにする。

初期候補:

| categoryName | 初期扱い | 補足 |
|---|---|---|
| ガラス・風防 | yes | ガラス交換、風防交換、研磨など |
| ケース・防水・外装仕上げ | yes | ケース修理、防水検査、外装仕上げを初期はまとめる。広すぎる場合は後で分割 |
| リューズ・プッシャー | yes | リューズ、チューブ、プッシャー関連 |
| 文字盤・針・インデックス | yes | 文字盤、針、インデックス関連。ただし部品在庫分類とは分ける |
| ブレス・バンド・クラスプ | yes | ブレス調整、バンド交換、クラスプ修理など |
| その他外装 | review | 逃げカテゴリとして便利だが、乱用を避けるため初期seedでは扱いを確認する |

外装カテゴリの注意:

```txt
外装部品マスタのカテゴリではない。
外装作業入力・処置・技術料候補の分類として使う。
部品のサイズ、素材、仕入先、写真、在庫などは部品マスタ側で扱う。
```

## 8. RepairWorkCategoryフィールド案

候補フィールド:

| field | 用途 | 初期判断 |
|---|---|---|
| id | 主キー | 採用 |
| repairType | internal / external の区分 | 採用 |
| parentId | 親カテゴリID | 採用 |
| key | seed・import・コード参照用の安定キー | 採用候補 |
| name | 管理上のカテゴリ名 | 採用 |
| displayName | 画面表示用カテゴリ名 | 採用候補 |
| description | 管理者向け説明 | 採用候補 |
| sortOrder | 表示順 | 採用 |
| isActive | 候補表示の有効/無効 | 採用 |
| createdAt | 作成日時 | 採用 |
| updatedAt | 更新日時 | 採用 |
| fmpAliases | FMP表記ゆれalias | 後回し |
| searchKeywords | 検索補助語 | 後回し |
| publicDisplayName | 公開表示名 | 後回し |
| b2bDisplayName | B2B表示名 | 後回し |
| b2cDisplayName | B2C表示名 | 後回し |

`displayName` は `name` と同じ値で始められる。将来、社内管理名と入力UI表示名を分ける必要が出た場合に使う。

`key` はschema実装時に採用するか要確認だが、seed・import・将来の参照安定性のため採用候補として強い。

## 9. 採用フィールド

初期schema案として採用したい最小フィールド:

```txt
id
repairType
parentId
key
name
displayName
sortOrder
isActive
createdAt
updatedAt
```

採用理由:

```txt
repairTypeで内装・外装を同一modelで扱える。
parentIdで将来の階層化に耐えられる。
keyでseedや将来のimport時に安定参照できる。
name / displayNameで管理名とUI表示名を分ける余地を持てる。
sortOrderでドリルダウンUIの表示順を制御できる。
isActiveで廃止カテゴリを過去参照を残したまま候補から外せる。
```

`description` は初期から入れてもよいが、必須ではない。schemaを軽くするなら後回しにする。

## 10. 後回しフィールド

初期schemaでは後回しにする候補:

```txt
fmpAliases
searchKeywords
publicDisplayName
b2bDisplayName
b2cDisplayName
categoryPathCache
icon
color
```

後回し理由:

```txt
FMP aliasはFMP過去案件救済レイヤーで扱うべきで、通常Repair用カテゴリ本体に混ぜない。
検索補助語はRepairWorkName側や別aliasテーブルで扱う可能性が高い。
B2B/B2C/PublicCase表示名はカテゴリではなくRepairWorkNameとRepairLineItem snapshot側が主担当。
categoryPathCacheは便利だが、まずはparentIdから生成できる。
icon/colorはUI実装時に必要性を判断する。
```

## 11. 部品マスタカテゴリとの関係

部品マスタカテゴリと作業カテゴリは別物として扱う。

```txt
PartCategoryMaster
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのための部品カテゴリ

RepairWorkCategory
-> 案件入力・作業内容・処置・技術料候補・RepairWorkName分類のための作業カテゴリ
```

同じ名前が出ても意味は異なる。

例:

```txt
PartCategoryMaster: カレンダー
-> 日車、曜車、日送り車などの部品分類

RepairWorkCategory: カレンダー
-> カレンダー修理、日送り修理、日車交換技術料などの作業分類
```

初期方針:

```txt
RepairWorkCategoryからPartCategoryMasterへ直接relationを張らない。
必要ならRepairWorkName側で、関連するPartCategoryMaster / PartNameMasterを補助参照する設計を後続Taskで検討する。
部品名・サイズ・グレード・仕入先・写真・在庫はRepairWorkCategoryに持たせない。
```

PublicCaseでの交換部品表示も、部品マスタ現在値を直表示せず、RepairLineItem / PublicCase snapshotを元にする。

## 12. FMP過去案件との関係

FMP過去案件は、過去データ救済として扱う。

```txt
FMP原文
-> FMP専用クリーニング
-> RepairWorkCategory / RepairWorkNameへの対応付け候補
-> PublicCase候補
```

FMP専用処理:

```txt
読み仮名削除
○○補正
表記ゆれ整理
複合作業分解
未紐づけPartItem救済
カテゴリ推定
brand-kana-approvedによるブランドカナ付与
コピー含有Case除外
```

新アプリ通常Repair:

```txt
repairType
-> RepairWorkCategory
-> RepairWorkName
-> RepairLineItem
-> EstimateItem snapshot
-> PublicCase下書き
```

方針:

```txt
FMPのカテゴリ推定結果をRepairWorkCategoryの正式初期seedとしてそのまま採用しない。
FMP aliasや旧Excel由来候補は、通常Repair入力用のカテゴリ本体ではなく、対応付け・レビュー用資料として扱う。
```

## 13. 次Task案

Task 108-3:

```txt
RepairWorkName の役割・必要フィールド・表示名default・target/action/treatmentの持ち方を設計する。
RepairWorkCategoryとの接続、RepairLineItemへ保存するsnapshot項目、PricingRuleとの接続方針を整理する。
schema実装はまだ行わない。
```

Task 108-4:

```txt
RepairWorkCategory / RepairWorkName と RepairLineItem の接続フィールド案を整理する。
RepairLineItemへ作業マスタ参照IDをいつ追加するか、EstimateItem snapshotとの関係を確認する。
schema実装はまだ行わない。
```

Task 108-5:

```txt
内装修理の初期RepairWorkCategory / RepairWorkName候補を、旧Excel大量seedではなく通常Repair入力に必要な最小候補として再設計する。
```

## 14. 未解決事項

未解決:

```txt
repairTypeをenumにするかStringにするか
idをIntのままにするか、他masterと揃えるか
keyを必須にするか
nameとdisplayNameを両方初期schemaへ入れるか
descriptionを初期schemaへ入れるか
parentId階層の最大深度を運用ルールで何階層にするか
クロノグラフカテゴリを初期採用するか
地板カテゴリを初期採用するか
外装の「ケース・防水・外装仕上げ」を分割するか
categoryPathSnapshotの保存形式
RepairWorkName側でPartCategoryMaster / PartNameMasterへの補助参照を持つか
FMP aliasを別テーブルにするか、FMP専用マッピングファイルに留めるか
```

このTaskで変更しなかったもの:

```txt
schema
migration
db push
seed
API
UI
RepairEntryForm
帳票/PDF/LINE
PublicCase生成
RepairLineItem表示切替
作業マスタschema実装
```
