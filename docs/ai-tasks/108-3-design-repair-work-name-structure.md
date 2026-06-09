# Task 108-3: RepairWorkName の構造設計

## 1. 概要

`RepairWorkName` の役割、必要フィールド、検索UI方針、`RepairLineItem` との関係を設計する。

このTaskではMarkdown設計のみ行う。schema、code、API、UI、DB、seed、migration、RepairEntryForm、帳票/PDF/LINE、PublicCase生成、RepairLineItem表示切替、作業マスタschema実装は行わない。

## 2. 前提

完了済みTask:

```txt
108-0: RepairLineItem後の作業マスタ再開準備
108-1: RepairWorkCategory / RepairWorkName 命名採用
108-2: RepairWorkCategory のカテゴリ階層設計
108-3A: 内装作業入力UIと作業マスタ構造の中核思想
```

参照メモ:

```txt
docs/design/internal-work-selection-ux-and-master-structure.md
docs/ai-tasks/108-0-prepare-internal-work-master-after-repair-line-item.md
docs/ai-tasks/108-1-compare-internal-work-master-model-structure.md
docs/ai-tasks/108-2-design-repair-work-category-structure.md
```

正本方針:

```txt
部品マスタと作業マスタは別物。
RepairWorkNameは入力補助・標準化・検索用の作業名マスタ。
RepairWorkNameを帳票・共有ページ・PublicCaseへ直接表示しない。
RepairLineItemへ表示名・価格・参照IDをsnapshot保存する。
EstimateItemは見積発行時点snapshot。
PublicCaseは公開用snapshot。
PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない。
```

## 3. 重要用語

```txt
Repair
-> 修理案件

Line Item
-> 明細行

RepairLineItem
-> 案件明細 / 明細行

RepairWorkCategory
-> 修理作業カテゴリ

RepairWorkName
-> 修理作業名

RepairWorkAction
-> 修理作業処置マスタ

PartNameMaster
-> 部品名マスタ

PartsMaster
-> 実部品レコード

PricingRule
-> 価格ルール

PublicCase
-> 公開事例snapshot
```

## 4. 最重要方針

`RepairWorkName` は入力候補・標準名・検索用構造のためのマスタである。

```txt
RepairWorkName
-> 入力候補 / 標準名 / 検索用構造

RepairLineItem
-> 案件上の正式な明細本体
-> 表示名・価格・参照IDをsnapshot保存

EstimateItem
-> 見積発行時点snapshot

PublicCase
-> 公開用snapshot
```

`RepairWorkName` は、後から変更される可能性があるマスタ現在値である。そのため、過去の帳票・共有ページ・PublicCase表示の正にはしない。

## 5. RepairWorkNameの役割

`RepairWorkName` は、カテゴリ選択後に選ぶ標準作業名候補である。

例:

```txt
オーバーホール
磁気抜き
精度調整
ゼンマイ交換技術料
一番受けピン入れ替え
一番受け穴締め
筒カナ修理
ヒゲゼンマイ修正
ガラス交換技術料
```

主な役割:

```txt
作業名の標準化
入力候補の提示
表記ゆれ検索の受け皿
対象部品による絞り込み
処置大分類による絞り込み
B2B/B2C表示名defaultの提供
RepairLineItemへsnapshot保存する元データ
PricingRuleと接続するための候補ID
```

役割ではないもの:

```txt
帳票・共有ページ・PublicCaseの確定表示データ
価格ルール本体
実部品在庫や仕入先の管理
FMP過去案件の補正ルール本体
```

## 6. RepairWorkCategoryとの関係

`RepairWorkName` は `RepairWorkCategory` に紐づく。

方針:

```txt
RepairWorkName.categoryId
-> RepairWorkCategory.id を参照

RepairWorkName.repairType
-> internal / external を持つ
```

`repairType` は `RepairWorkCategory` から辿れるが、検索・絞り込みを単純にするため `RepairWorkName` 側にも持つ方針とする。

注意:

```txt
「内装修理」「外装修理」はRepairWorkCategoryレコードにしない。
internal / external は repairType で表現する。
```

## 7. 部品名まで絞れるが必須にはしない

内装作業入力では以下の方針を採用する。

```txt
部品名まで絞り込める。
ただし、部品名まで必ず選ばせるわけではない。
どの段階でも文字入力検索できる。
カテゴリから辿ってもよい。
部品名から辿ってもよい。
いきなり文字検索してもよい。
```

基本ルート:

```txt
repairType
-> RepairWorkCategory
-> PartNameMasterによる対象部品絞り込み
-> RepairWorkName
```

ただし、`PartNameMaster` の選択は任意である。

例:

```txt
internal
-> 動力・巻上
-> 一番受け
-> 一番受けピン入れ替え
```

```txt
internal
-> ムーブメント
-> オーバーホール
```

## 8. targetPartNameIdの扱い

`targetPartNameId` は `PartNameMaster` への任意参照とする。

目的:

```txt
作業名を対象部品で絞り込む
検索精度を上げる
表記ゆれを減らす
集計しやすくする
PublicCase生成時の構造化情報に使う
```

重要:

```txt
targetPartNameIdは任意。
入力UIの必須階層ではない。
PartsMasterには紐づけない。
```

参照してよい:

```txt
PartNameMaster
-> 一番受け
-> ゼンマイ
-> 筒カナ
-> ヒゲゼンマイ
-> 巻真
```

参照しない:

```txt
PartsMaster
-> 特定ブランド用の実部品
-> 特定ref用の部品
-> 在庫数
-> 仕入先
-> 価格
-> cousinsRef
-> 保管場所
```

## 9. どの段階でも検索できるUI方針

以下のすべてを許容する設計にする。

```txt
何も選ばず、いきなり作業名検索
repairTypeだけ選んで検索
categoryIdまで選んで検索
targetPartNameIdまで選んで検索
カテゴリや部品名を辿って作業名を選択
```

例:

通常ルート:

```txt
内装修理
-> 動力・巻上
-> 一番受け
-> 一番受けピン入れ替え
```

途中検索ルート:

```txt
内装修理
-> 動力・巻上
-> 検索: ピン
-> 一番受けピン入れ替え
```

いきなり検索ルート:

```txt
検索: 1受
-> 一番受けピン入れ替え
-> 一番受け穴締め
```

## 10. RepairWorkAction / actionId

`RepairWorkAction` は、修理作業の処置大分類マスタである。

Task 108-3ではschema実装しないが、設計方針としては初期から `RepairWorkAction` をマスタ化する。

`RepairWorkName` は、将来的には `actionLabel` 文字列ではなく、`actionId` で `RepairWorkAction` を参照する。

初期候補:

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
```

`RepairWorkAction` は、検索・分類・集計用の処置大分類として扱う。表示名そのものではない。

細かい技術表現は、原則として `RepairWorkAction` へ追加しない。

例:

```txt
standardName = 一番受けピン入れ替え
action = 交換
detailLabel = ピン
```

```txt
standardName = 一番受け穴締め
action = 穴締め
detailLabel = null
```

```txt
standardName = ローター真かしめ
action = かしめ
detailLabel = ローター真
```

理由:

```txt
処置分類を細かく増やすと、検索・分類・集計の軸が壊れる。
作業者向けに自然な名前はstandardNameへ残す。
構造化の軸はRepairWorkActionへ分ける。
```

## 11. detailLabel

`detailLabel` は、`RepairWorkAction` では表現しきれない技術的な詳細を持つ任意項目とする。

例:

```txt
ピン
ホゾ
ローター真
曲がり
削り合わせ
```

初期方針:

```txt
detailLabelはRepairWorkName上のnullable Stringとする。
ただし完全自由入力にはしない。
既存候補から選択できるUIを想定する。
新規入力はreview扱いにする。
```

将来方針:

```txt
detailLabel候補が増えてきた段階で、RepairWorkDetailMasterへ昇格できる設計にする。
```

`detailLabel` は作業名表示そのものではない。作業者向けに自然な名前は `standardName` に残す。

## 12. standardName / 表示名default

`RepairWorkName` には最低限以下の表示名系defaultを持たせる。

```txt
standardName
b2bDisplayName
b2cDisplayName
```

意味:

```txt
standardName
-> 社内標準名 / 候補選択名

b2bDisplayName
-> 業者向け表示名default

b2cDisplayName
-> 一般顧客向け表示名default
```

例:

```txt
standardName: 一番受けピン入れ替え
b2bDisplayName: 一番受けピン入れ替え
b2cDisplayName: 内部部品の修理
```

```txt
standardName: ゼンマイ交換技術料
b2bDisplayName: ゼンマイ交換技術料
b2cDisplayName: ゼンマイ交換
```

注意:

```txt
これらはRepairWorkName上のdefault候補である。
帳票・共有ページ・PublicCase表示時にはRepairLineItem側へsnapshot保存する。
```

## 13. aliases / searchKeywords

FMP時代の表記ゆれを吸収するため、`aliases` / `searchKeywords` を検討する。

例:

```txt
standardName = 一番受けピン入れ替え
```

aliases:

```txt
1番受けピン入替
1受けピン交換
1受けピン入れ替え
1受け軸交換
一受ピン
一番受けピン
```

searchKeywords:

```txt
1受
1番受
一受
一番受
ピン
入替
入れ替え
交換
軸
```

方針:

```txt
FMP由来の表記ゆれを正式名にしない。
正式名はstandardNameへ統一する。
aliases / searchKeywordsは検索補助として扱う。
```

初期schemaでは、`aliases` / `searchKeywords` を直接持たせるか、別テーブルにするかは未確定とする。設計候補として記録する。

## 14. 候補表示の考え方

候補表示では、作業名だけでなく補助情報も見せる。

例:

```txt
一番受けピン入れ替え
カテゴリ: 動力・巻上
対象: 一番受け
処置: 交換
詳細: ピン
```

```txt
ゼンマイ交換技術料
カテゴリ: 動力・巻上
対象: ゼンマイ
処置: 交換
詳細: なし
```

これにより、似た名前の作業でも判断しやすくなる。

## 15. PricingRuleとの関係

`RepairWorkName` は価格本体ではない。

価格は `PricingRule` で扱う。

役割分担:

```txt
RepairWorkName
-> 作業名・カテゴリ・対象部品・処置・表示名defaultの標準化

PricingRule
-> 条件別価格・技術料候補価格

RepairLineItem
-> 案件ごとの実際の明細・価格・表示名snapshot
```

将来的には `PricingRule` に `repairWorkNameId` を追加し、作業名と価格ルールを紐づけることを検討する。

このTaskではschema変更しない。

## 16. RepairLineItemとの関係

`RepairWorkName` を選択した結果は、将来的に `RepairLineItem` へsnapshot保存する。

想定:

```txt
repairWorkNameId
repairWorkCategoryId
targetPartNameId
actionId
pricingRuleId
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
unitPrice
quantity
showPriceB2b
showPriceB2c
```

注意:

```txt
このTaskではRepairLineItem schema変更は行わない。
現時点のRepairLineItemへ直接追加しない。
設計のみ記録する。
```

## 17. PublicCaseとの関係

PublicCaseは `RepairWorkName` を直接表示しない。

通常Repairで `RepairLineItem` に保存されたsnapshotから、公開用の WorkItem / PartItem を生成する。

理由:

```txt
後からRepairWorkNameが変更されても、過去の公開事例表示が変わらないようにする。
B2B/B2Cで表示名や価格表示方針を分ける。
公開事例は公開時点のsnapshotとして固定する。
```

## 18. 自由入力の扱い

完全自由入力を常用しない。

候補がない場合のみ、新規候補化する。

方針:

```txt
自由入力された作業名を即正式マスタにしない。
review状態で保存する。
ユーザー確認後に正式候補化する。
既存候補へ寄せられる場合は既存候補へ誘導する。
detailLabelの新規入力もreview扱いにする。
```

例:

```txt
入力: 1受けピン交換
```

既存候補に以下があれば、そこへ誘導する。

```txt
一番受けピン入れ替え
```

既存候補がなければ、review状態で新規 `RepairWorkName` 候補として保存する。

## 19. 初期フィールド候補

比較対象としての候補:

```txt
id
repairType
categoryId
targetPartNameId
actionId
detailLabel
standardName
b2bDisplayName
b2cDisplayName
description
aliases
searchKeywords
sortOrder
isActive
source
reviewStatus
createdAt
updatedAt
```

## 20. 採用フィールド候補

初期採用候補:

```txt
id
repairType
categoryId
targetPartNameId
actionId
detailLabel
standardName
b2bDisplayName
b2cDisplayName
description
sortOrder
isActive
source
reviewStatus
createdAt
updatedAt
```

採用理由:

```txt
repairTypeで内装・外装を共通modelで扱える。
categoryIdでRepairWorkCategoryに分類できる。
targetPartNameIdで必要な場合だけ部品名まで絞り込める。
actionIdでRepairWorkActionを参照し、処置大分類を安定させる。
detailLabelで細かい技術表現を保持できる。
standardNameで正式作業名を統一できる。
b2bDisplayName / b2cDisplayNameで表示粒度defaultを分けられる。
reviewStatusで自由入力候補を即正式化しない運用ができる。
```

## 21. 後回し候補

後続検討:

```txt
aliases専用テーブル
searchKeywords専用テーブル
RepairWorkDetailMaster
RepairWorkNameとPricingRuleの本実装
RepairLineItemへのrepairWorkNameId / actionId追加
PublicCaseWorkItemへのsourceRepairLineItemId連携
```

後回し理由:

```txt
aliases / searchKeywordsは検索実装方針と合わせて決める。
detailLabelは初期はnullable Stringで始め、候補が増えてからRepairWorkDetailMasterへ昇格する。
PricingRule / RepairLineItem / PublicCaseとのschema接続は後続Taskで分割する。
```

## 22. FMP過去案件との切り分け

FMP過去案件:

```txt
FMP原文
-> FMP専用クリーニング
-> RepairWorkNameへの対応付け候補
-> PublicCase候補
```

新アプリ通常Repair:

```txt
repairType
-> RepairWorkCategory
-> 必要ならPartNameMaster
-> RepairWorkName
-> RepairLineItem
```

方針:

```txt
FMP由来の表記ゆれをstandardNameへ直採用しない。
FMP救済ルールを通常Repair入力へ持ち込まない。
旧Excel由来候補や107-5大量seed案を、そのまま正式RepairWorkNameにしない。
```

## 23. 禁止事項

このTaskでは以下を行わない。

```txt
schema変更
migration作成
db push
seed変更
API変更
UI変更
RepairEntryForm変更
帳票/PDF/LINE変更
PublicCase生成変更
RepairLineItem表示切替
作業マスタschema実装
PricingRule実装
```

## 24. 次Task案

Task 108-4:

```txt
RepairWorkAction の初期マスタ設計を行う。
12個の初期候補、sortOrder、isActive、key、displayName、説明を整理する。
schema実装はまだ行わない。
```

Task 108-5:

```txt
RepairWorkName / RepairWorkAction / RepairWorkCategory と RepairLineItem の接続フィールド案を整理する。
RepairLineItemへ作業マスタ参照IDをいつ追加するか確認する。
schema実装はまだ行わない。
```

Task 108-6:

```txt
内装RepairWorkNameの初期候補を、通常Repair入力に必要な最小候補として設計する。
旧Excel大量seed方式には戻さない。
```

## 25. 未解決事項

```txt
repairTypeをenumにするかStringにするか
RepairWorkActionのkey命名
RepairWorkNameのstandardNameと内部管理名を分けるか
b2bDisplayName / b2cDisplayNameを必須にするか
detailLabelを初期から候補テーブルにするか、nullable Stringで始めるか
aliases / searchKeywordsをJSON、別テーブル、検索indexのどれで扱うか
RepairWorkNameとPricingRuleの紐づけタイミング
RepairLineItemへrepairWorkNameId / actionIdを追加するタイミング
PublicCase生成時にどのsnapshot項目を渡すか
```

## 26. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
code
API
UI
DB
seed
migration
RepairEntryForm
帳票/PDF/LINE
PublicCase生成
RepairLineItem表示切替
PricingRule実装
```
