# 内装作業入力UIと作業マスタ構造の中核思想

作成日: 2026-06-09

このドキュメントは、時計修理業務アプリにおける内装作業入力の中核思想を記録する。

対象は主に以下。

```txt
RepairWorkCategory
RepairWorkName
RepairWorkAction
RepairLineItem
PartNameMaster
PricingRule
PublicCase
```

この設計は単なる画面UI案ではない。以下を同時に解決するための設計方針である。

```txt
自由入力による表記ゆれを減らす
入力作業を重くしすぎない
人が変わっても同じ作業へ辿り着ける
検索しやすくする
B2B/B2C表示やPublicCase生成に使える構造化データを残す
FMP時代の曖昧な自由入力へ戻らない
```

このTaskではMarkdownのみ作成する。schema、API、UI、DB、seed、migration、RepairEntryForm、帳票、PublicCase、RepairLineItem実装、PricingRule実装は変更しない。

## 1. このドキュメントの目的

このドキュメントは、内装作業マスタ / RepairWorkName の設計で非常に重要な方針を、Task 108-3の一部としてだけでなく、今後のアプリ設計・Codex作業・Notion参照用に独立して残すためのもの。

特に以下を明確にする。

```txt
カテゴリだけに頼らない
部品名まで必須にしない
必要なら部品名まで絞り込める
どの段階でも文字入力検索できる
RepairWorkNameはPartsMasterではなくPartNameMasterまでを任意参照する
RepairWorkNameは帳票やPublicCaseへ直接表示しない
RepairLineItemへsnapshot保存する
```

## 2. FMP時代の問題

FMP時代は、一部の作業については短縮入力のルールがあった。

例:

```txt
オーバーホール -> OH
半オーバーホール -> 半OH
```

ただし、それ以外の多くの作業名は自由入力だった。

その結果、同じような作業でも表記が揺れた。

例:

```txt
一番受けピン入れ替え
1番受けピン入替
1受けピン交換
1受けピン入れ替え
1受け軸交換
一番受けピン修理
```

検索時にも、以下のような迷いが生じる。

```txt
自分ならどう入力したか
この時期ならどう書いていたか
漢字で書いたか、数字で書いたか
省略したか、正式名で書いたか
```

これは本人ならある程度対応できるが、人が変わると破綻しやすい。過去データを公開事例化、検索、集計、B2B表示に使う場合にも不安定になる。

## 3. 新アプリで避けるべきこと

新アプリでは、FMP時代の完全自由入力には戻さない。

避けるべき状態:

```txt
毎回自由入力する
人によって表記が変わる
過去の自分の入力癖を思い出さないと検索できない
作業名からカテゴリや対象部品を毎回推定する必要がある
PublicCase生成時に毎回文字列補正が必要になる
```

FMP過去案件には救済ルールが必要だが、それは過去データ専用である。新アプリ通常Repairでは、最初から構造化された入力を行う。

## 4. 最終方針

内装作業入力は、以下の方針にする。

```txt
部品名まで絞り込める
ただし、部品名まで必ず選ばせるわけではない
どの段階でも文字入力検索できる
カテゴリから辿ってもよい
部品名から辿ってもよい
いきなり文字検索してもよい
```

つまり、階層選択と検索入力を両立させる。

## 5. 基本ルート

基本の入力ルートは以下。

```txt
repairType
-> RepairWorkCategory
-> PartNameMasterによる対象部品絞り込み
-> RepairWorkName
```

ただし、すべてを必須にはしない。

例:

```txt
internal
-> 動力・巻上
-> 一番受け
-> 一番受けピン入れ替え
```

または:

```txt
internal
-> ムーブメント
-> オーバーホール
```

## 6. 修理区分

修理区分は以下。

```txt
internal = 内装修理
external = 外装修理
```

このドキュメントでは主に `internal` を扱う。

「内装修理」「外装修理」はRepairWorkCategoryのカテゴリレコードにはしない。これらは `repairType` で表現する。

## 7. 修理作業カテゴリ

`RepairWorkCategory` は、作業を大きく分類するためのカテゴリである。

内装カテゴリ例:

```txt
ムーブメント
クォーツ
動力・巻上
輪列
脱進機
調速機
針回し
カレンダー
自動巻
クロノグラフ
地板
```

カテゴリは部品カテゴリと同じ名前になることがあるが、意味は異なる。

```txt
RepairWorkCategory
-> 作業入力・技術料候補・処置分類のためのカテゴリ

PartCategoryMaster
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先などのためのカテゴリ
```

## 8. ムーブメントカテゴリについて

`ムーブメント` カテゴリは採用してよい。

理由:

```txt
ムーブメントは部品としても考えられる
ただし、ムーブメント全体に対する作業も存在する
オーバーホール、磁気抜き、精度調整などはムーブメント全体への処置として自然
```

例:

```txt
内装修理
-> ムーブメント
-> オーバーホール
```

```txt
内装修理
-> ムーブメント
-> 磁気抜き
```

```txt
内装修理
-> ムーブメント
-> 精度調整
```

この場合、必ずしも `PartNameMaster` で「ムーブメント」を選ばせる必要はない。カテゴリとしてのムーブメントで十分に意味が通る。

## 9. 部品名まで絞れるようにする理由

カテゴリだけでは、候補が多くなりすぎる可能性がある。

例:

```txt
動力・巻上
```

このカテゴリ内には以下のような作業が入り得る。

```txt
ゼンマイ交換技術料
香箱修理
香箱真修理
一番受け穴詰め
一番受けピン入れ替え
コハゼ修理
角穴車修理
丸穴車修理
```

カテゴリを選んだ後に候補が多すぎると、選択が面倒になる。そのため、必要に応じて `PartNameMaster` で対象部品まで絞り込めるようにする。

例:

```txt
内装修理
-> 動力・巻上
-> 一番受け
-> 一番受けピン入れ替え
```

## 10. ただし部品名選択を必須にしない理由

部品名まで毎回必須にすると、入力が重くなりすぎる。

また、すべての作業が特定部品に紐づくわけではない。

例:

```txt
オーバーホール
精度調整
磁気抜き
防水検査
動作確認
注油
洗浄
```

これらは特定部品ではなく、ムーブメント全体や機能全体に対する作業である。

そのため、部品名選択は必須ではなく、任意の絞り込み条件とする。

## 11. どの段階でも文字入力検索できるようにする

この設計で最も重要なのは、どの段階でも文字入力検索できること。

可能な入力ルート:

```txt
1. 何も選ばず、いきなり作業名検索
2. 内装修理だけ選んで作業名検索
3. カテゴリまで選んで作業名検索
4. 部品名まで選んで作業名検索
5. カテゴリや部品名を辿って作業名を選択
```

これにより、初心者にも慣れた作業者にも使いやすくなる。

## 12. 具体的な検索例

例: 一番受けピン入れ替え

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
-> 一番受け穴詰め
```

検索で吸収したい表記:

```txt
一番受けピン入れ替え
1番受けピン入替
1受けピン交換
1受けピン入れ替え
1受け軸交換
一番受けピン修理
一受ピン
一番受けピン
```

これらから標準作業名に辿り着けるようにする。

## 13. 検索で吸収したい表記ゆれ

「一番受けピン入れ替え」の場合、以下をaliasまたはsearch keywordとして吸収したい。

```txt
一番受けピン入れ替え
1番受けピン入替
1受けピン交換
1受けピン入れ替え
1受け軸交換
一番受けピン修理
一受ピン
一受けピン
```

ただし、実際に保存する標準名は1つに統一する。

例:

```txt
standardName = 一番受けピン入れ替え
```

FMP由来の表記ゆれを、そのまま正式名にはしない。正式名は標準化された名前に寄せる。

## 14. RepairWorkNameの役割

`RepairWorkName` は、標準化された修理作業名である。

例:

```txt
オーバーホール
磁気抜き
精度調整
ゼンマイ交換技術料
一番受けピン入れ替え
筒カナ修理
ヒゲゼンマイ修正
ガラス交換技術料
```

`RepairWorkName` は、`RepairLineItem` へ保存される作業明細の元データである。

ただし、帳票・共有ページ・PublicCaseには `RepairWorkName` を直接表示しない。選択時点で `RepairLineItem` に表示名・価格・参照IDをsnapshot保存する。

## 15. RepairWorkNameに持たせる情報

`RepairWorkName` には以下を持たせる方針。

必須候補:

```txt
repairType
categoryId
standardName
b2bDisplayName
b2cDisplayName
isActive
sortOrder
```

任意候補:

```txt
targetPartNameId
actionId
detailLabel
searchKeywords
aliases
description
reviewStatus
source
```

`standardName` は社内標準作業名である。`b2bDisplayName` / `b2cDisplayName` は表示粒度を変えるためのdefault値であり、最終表示は `RepairLineItem` のsnapshotを正とする。

## 16. targetPartNameIdの位置づけ

`targetPartNameId` は、`PartNameMaster` への任意参照である。

目的:

```txt
作業名を対象部品で絞り込む
検索を強くする
表記ゆれを減らす
集計しやすくする
PublicCase生成時の構造化情報に使う
```

重要:

```txt
targetPartNameIdは任意
入力UIの必須階層ではない
PartsMasterには紐づけない
```

## 17. PartsMasterには紐づけない

作業マスタが参照してよいのは `PartNameMaster` までである。

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

理由:

```txt
作業マスタは作業名を標準化するためのもの。
実部品レコードは交換部品の仕入・在庫・価格管理のためのもの。
両者を混同すると設計が重くなる。
```

## 18. RepairWorkAction / actionId / detailLabelの位置づけ

`RepairWorkAction` は、修理作業の処置大分類マスタである。

Task 108-3ではschema実装しないが、設計方針としては初期から `RepairWorkAction` をマスタ化する。

`RepairWorkName` は、将来的には `actionLabel` 文字列ではなく、`actionId` で `RepairWorkAction` を参照する。

`RepairWorkAction` の初期候補:

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

`RepairWorkAction` は、検索・分類・集計用の処置大分類として扱う。

自然な作業名は `standardName` として残す。`actionId` / `RepairWorkAction` は表示名そのものではなく、構造化・検索・絞り込みのための項目である。

この12個以外の細かい技術表現は、原則として `RepairWorkAction` へ追加しない。

細かい技術表現は、必要に応じて `standardName`、`detailLabel`、`searchKeywords`、`aliases` で扱う。

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
処置分類を文字列のまま増やすと、検索・分類・集計の軸が壊れる。
「ピン入れ替え」のような細部まで処置大分類化すると、分析軸として使いにくくなる。
作業者向けに自然な名前はstandardNameへ残し、構造化の軸はRepairWorkActionへ分ける。
```

`detailLabel` は、初期schemaでは `RepairWorkName` 上の nullable String として扱う方針とする。

ただし、完全自由入力にはしない。既存候補から選択できるUIを想定し、新規入力は review 扱いにする。

`detailLabel` は候補が増えてきた段階で、`RepairWorkDetailMaster` へ昇格できる設計にする。

## 19. searchKeywords / aliasesの位置づけ

`searchKeywords` と `aliases` は、表記ゆれ吸収のために使う。

例:

RepairWorkName:

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

ただし、FMP由来の表記ゆれをそのまま正式名にはしない。正式名は標準化された名前に寄せる。

## 20. 候補表示の考え方

作業名候補を表示するときは、作業名だけでなく補助情報も表示する。

例:

```txt
一番受けピン入れ替え
カテゴリ: 動力・巻上
対象: 一番受け
処置: ピン入れ替え
```

```txt
ゼンマイ交換技術料
カテゴリ: 動力・巻上
対象: ゼンマイ
処置: 交換
```

これにより、似た名前の作業でも判断しやすくなる。

## 21. 入力UIの基本思想

入力UIは、以下の思想で作る。

```txt
浅く使える
深くも絞れる
どこでも検索できる
自由入力は最後の逃げ道
```

つまり:

```txt
カテゴリだけで候補が十分少なければ、そのまま選ぶ
候補が多ければ部品名で絞る
部品名を選ぶのが面倒なら文字検索する
慣れた作業者はいきなり検索する
候補がなければ新規候補として登録する
```

## 22. 自由入力の扱い

完全自由入力を常用しない。

候補がない場合のみ、新規候補化する。

新規候補化の方針:

```txt
自由入力された作業名を即正式マスタにしない
review状態で保存する
ユーザー確認後に正式候補化する
既存候補へ寄せられる場合は既存候補へ誘導する
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

## 23. RepairLineItemへのsnapshot保存

`RepairWorkName` を選択した結果は、`RepairLineItem` へsnapshot保存する。

保存する想定:

```txt
repairWorkNameId
repairWorkCategoryId
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

`RepairWorkName` はあくまで入力候補であり、案件上の正式な明細は `RepairLineItem` に残る。

## 24. PricingRuleとの関係

`RepairWorkName` は価格本体ではない。

価格は `PricingRule` で扱う。

役割分担:

```txt
RepairWorkName
-> 作業名・カテゴリ・対象部品・表示名defaultの標準化

PricingRule
-> 条件別価格・技術料候補価格

RepairLineItem
-> 案件ごとの実際の明細・価格・表示名snapshot
```

将来的には `PricingRule` に `repairWorkNameId` を追加して、作業名と価格ルールを紐づけることを検討する。

ただし、`PricingRule` を作業マスタ本体にはしない。

## 25. PublicCaseとの関係

`PublicCase` は `RepairWorkName` を直接表示しない。

通常Repairで `RepairLineItem` に保存されたsnapshotから、公開用の WorkItem / PartItem を生成する。

理由:

```txt
後からRepairWorkNameが変更されても、過去の公開事例表示が変わらないようにする
B2B/B2Cで表示名や価格表示方針を分ける
公開事例は公開時点のsnapshotとして固定する
```

## 26. AI / Codex用ルール

今後、AI / Codex は以下を必ず守る。

### 26.1 完全自由入力へ戻さない

```txt
FMP時代のような完全自由入力を通常Repairの標準入力にしない。
```

### 26.2 部品名まで必須にしない

```txt
targetPartNameIdは任意。
部品名まで必ず選ばないと作業名を選べないUIにはしない。
```

### 26.3 ただし部品名まで絞れるようにする

```txt
必要な場合はPartNameMasterで対象部品まで絞れるようにする。
```

### 26.4 どの段階でも検索できるようにする

```txt
repairTypeだけ
categoryIdまで
targetPartNameIdまで
何も選んでいない状態

どの段階でも作業名検索できるようにする。
```

### 26.5 PartsMasterに紐づけない

```txt
RepairWorkNameはPartsMasterに紐づけない。
```

紐づけてよいのは `PartNameMaster` まで。

### 26.6 UIは浅く、データは深く

```txt
UI:
浅く使える

データ:
targetPartNameId / actionId / detailLabel / aliases / searchKeywords を持てる
```

### 26.6.1 RepairWorkActionを増やしすぎない

```txt
RepairWorkActionは初期候補として以下の12個に固定する。

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

```txt
細かい技術表現はRepairWorkActionへ追加しない。
RepairWorkNameは将来的にactionIdでRepairWorkActionを参照する。
一番受けピン入れ替えの処置大分類は交換とし、ピンはdetailLabelなどで扱う。
一番受け穴締めの処置大分類は穴締めとする。
standardNameは自然な作業名として残す。
```

### 26.6.2 detailLabelは初期は文字列、将来はマスタ昇格可能にする

```txt
detailLabelは初期schemaではRepairWorkName上のnullable Stringとして扱う。
ただし完全自由入力にはしない。
既存候補から選択できるUIを想定する。
新規入力はreview扱いにする。
候補が増えてきた段階でRepairWorkDetailMasterへ昇格できる設計にする。
```

### 26.7 旧FMP表記を正式名にしない

```txt
FMP由来の表記ゆれはaliases / searchKeywordsとして扱う。
正式名 standardName は標準化された名前に寄せる。
```

### 26.8 RepairWorkNameを直接帳票表示しない

```txt
帳票・共有ページ・PublicCase表示は RepairLineItem snapshot を使う。
RepairWorkName は入力補助マスタ。
```

## 27. この設計の結論

最終方針:

```txt
完全自由入力
-> 表記ゆれが多すぎるため不採用

カテゴリまで
-> 候補が多くなる可能性があるため不十分

部品名まで必須
-> 入力が重くなるため不採用

部品名まで絞れる + どの段階でも文字入力検索できる
-> 採用
```

この方針により、以下を実現する。

```txt
自由入力による曖昧さを減らせる
入力を重くしすぎない
カテゴリから探せる
部品名から探せる
文字検索でも探せる
人が変わっても同じ標準作業名へ辿り着ける
PublicCaseやB2B/B2C表示にも使いやすい構造化データが残る
```

## 28. Notion用まとめ

Notionに残す場合の短いまとめ:

```txt
内装作業入力は、「部品名まで絞れるが、部品名選択は必須にしない」設計にする。

基本は、
内装修理 -> 作業カテゴリ -> 必要なら対象部品 -> 作業名
の流れ。

ただし、どの段階でも文字検索できるようにする。

RepairWorkNameはPartNameMasterを任意参照できるが、PartsMasterには紐づけない。

作業名の正式表示はstandardNameに統一し、FMP由来の表記ゆれはaliases / searchKeywordsで吸収する。

RepairWorkNameは入力補助マスタであり、帳票・共有ページ・PublicCase表示にはRepairLineItemに保存されたsnapshotを使う。
```

追加方針:

```txt
RepairWorkAction（修理作業処置マスタ）は初期からマスタ化する。
初期候補は、交換 / 修理 / 調整 / 修正 / 研磨 / 洗浄 / 注油 / 製作 / 取付 / 除去 / 穴締め / かしめ。
RepairWorkNameは将来的にactionIdでRepairWorkActionを参照する。
detailLabelは初期schemaではRepairWorkName上のnullable Stringとする。
detailLabelは完全自由入力にせず、既存候補から選択できるUIを想定し、新規入力はreview扱いにする。
detailLabel候補が増えてきた段階で、RepairWorkDetailMasterへ昇格できる設計にする。
```

## 29. 後続Task

この設計を踏まえて、Task 108-3では `RepairWorkName` の構造設計に進む。

特に以下を反映する。

```txt
targetPartNameIdは任意
RepairWorkActionは初期からマスタ化する
RepairWorkNameは将来的にactionIdでRepairWorkActionを参照する
detailLabelは初期はnullable String、将来RepairWorkDetailMasterへ昇格可能にする
PartNameMaster参照まで
PartsMaster参照はしない
部品名まで絞れる
部品名選択は必須にしない
どの段階でも検索できる
aliases / searchKeywordsを検討する
RepairLineItemへsnapshot保存する
```

## 完了条件

このドキュメントは以下を満たす。

```txt
人間用の説明がある
AI/Codex用のルールがある
Notionに貼れる要約がある
schema/code/API/UI/DB/seed/migrationに変更がない
```
