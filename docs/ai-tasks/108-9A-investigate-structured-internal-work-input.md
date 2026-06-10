# Task 108-9A: RepairWorkName seedなし前提の内装作業入力構造 調査・設計

## 1. 目的

内装作業マスタを `RepairWorkName` の大量seedから始めず、通常Repairの入力を以下の構造へ寄せるための調査・設計を行う。

```txt
RepairWorkCategory
+ PartNameMaster
+ RepairWorkAction
+ detail
+ price
-> RepairLineItem snapshot
```

このTaskではschema / seed / API / UI / DBは変更しない。`RepairWorkName` のseed候補表も作成しない。

## 2. 前提

作業マスタと部品マスタは別レイヤーとして扱う。

```txt
部品マスタ
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ

作業マスタ
-> 案件入力・作業内容・処置・技術料・B2B/B2C表示名のためのマスタ
```

帳票・共有ページ・PublicCaseは、作業マスタや部品マスタの現在値を直接表示しない。RepairLineItem / EstimateItem / PublicCase側に保存されたスナップショットを表示の正とする。

FMP過去案件の読み仮名削除、表記ゆれ整理、カテゴリ推定、複合作業分解などはFMP専用処理であり、新アプリ通常Repairの入力設計へ持ち込まない。

## 3. 現在の実装状況

### RepairWorkAction

`RepairWorkAction` はschema実装済みで、12件seed済み。

```txt
exchange / 交換
repair / 修理
adjust / 調整
correction / 修正
polish / 研磨
clean / 洗浄
oil / 注油
make / 製作
install / 取付
remove / 除去
hole_tightening / 穴締め
staking / かしめ
```

この12件は処置の大分類であり、細かい技術表現を追加して増やすものではない。細かい差分は `detail`、`standardName`、将来のalias / searchKeywordsで吸収する。

### RepairWorkCategory

`RepairWorkCategory` はschema実装済みで、INTERNALの親カテゴリ11件だけseed済み。

```txt
movement / ムーブメント
quartz / クォーツ
power_winding / 動力・巻上
train_wheel / 輪列
escapement / 脱進機
regulator / 調速機
hand_setting / 針回し
calendar / カレンダー
automatic_winding / 自動巻
chronograph / クロノグラフ
main_plate / 地板
```

外装カテゴリはまだseedしていない。後続Taskで別途設計する。

### RepairWorkName

`RepairWorkName` はschema実装済みだが、seedはまだ入れない。

現行schemaには以下がある。

```txt
repairType
categoryId
targetPartNameId
actionId
detailLabel
standardName
b2bDisplayName
b2cDisplayName
source
reviewStatus
```

ただし、今回の方針では `RepairWorkName` を PartName x Action の全組み合わせとして大量seedしない。将来は、よく使う組み合わせ、表示名テンプレート、レビュー済みユーザー入力、PricingRule接続候補として扱う。

### PartNameMaster

既存の `PartCategoryMaster / PartNameMaster / PartsMaster` は流用方針。Task 109-3で、ユーザー確定済み内装部品名リストに基づく不足分を `PartNameMaster` seedへ追加済み。

重要な扱い:

```txt
五番車
-> クォーツ用の部品名として扱う
-> `fifth_wheel_quartz` を正式参照候補にする
-> train_wheel側の既存 `fifth_wheel` は旧seed / review対象であり、正式参照候補にしない
```

### RepairLineItem

`RepairLineItem` は通常Repairの案件明細本体としてschema実装済み。新規作成API / 更新APIで、既存EstimateItem保存後に同じpayloadから二重書きされる。

schema確認結果として、現行 `RepairLineItem` に存在する構造化関連フィールドは `pricingRuleId` と表示名snapshot群である。`repairWorkCategoryId` / `repairWorkActionId` / `targetPartNameId` / `detailLabelSnapshot` / `repairWorkNameId` はまだ存在しない。

現行schemaに実在する主な保存項目:

```txt
lineType
partsMasterId
pricingRuleId
relatedWorkLineItemId
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
gradeNameSnapshot
notesForCustomerSnapshot
quantity
unitPrice
amount
showPriceB2b
showPriceB2c
sortOrder
internalMemo / customerMemo / publicMemo
```

以下は現行schemaには存在しない。現行保存項目ではなく、現在のギャップまたは将来追加候補として扱う。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
repairWorkNameId
```

### PricingRule

`PricingRule` は価格ルールとして残す。現行schemaは `suggestedWorkName` が技術料候補名・価格候補名を兼ねており、RepairEntryFormでは `getPricingRules()` から候補を取得している。

現行の主な項目:

```txt
brandId
modelId
caliberId
customerType
minPrice
maxPrice
suggestedWorkName
notes
```

現時点では、`RepairWorkCategory` / `RepairWorkAction` / `PartNameMaster` / `RepairWorkName` への構造化参照は持っていない。

### RepairEntryForm

現行のRepairEntryFormは、`lineItems` を `type / name / price / quantity / partsMasterId` 中心で扱っている。

技術料候補は `getPricingRules(brandId, modelId, caliberId)` の結果を `suggestedWorkName` で表示している。保存payloadも `item.name` を中心に `EstimateItem` と `RepairLineItem` へ流れる。

つまり、現行UIはまだ以下を入力できない。

```txt
RepairWorkCategory選択
PartNameMasterによる対象部品選択
RepairWorkAction選択
detail入力
構造化表示名プレビュー
```

### 帳票・共有ページ・PublicCase

帳票・共有ページは主に `Estimate -> EstimateItem` を参照する。共有ページやPDF生成には `PartsMaster.grade / notes2` を後読みする箇所が残っている。

PublicCaseは公開事例用の別スナップショットであり、RepairWorkNameやPartNameMasterを直接表示するものではない。通常RepairからPublicCaseへ進む場合も、RepairLineItemなど確定済み明細スナップショットから生成する方針を維持する。

## 4. 現在のギャップ

### categoryIdを保存できるか

現行のRepairLineItemには `repairWorkCategoryId` がないため、保存できない。現行UIにもカテゴリ選択がない。

### actionIdを保存できるか

現行のRepairLineItemには `repairWorkActionId` がないため、保存できない。現行UIにも処置選択がない。

### targetPartNameIdを保存できるか

現行のRepairWorkNameには `targetPartNameId` があるが、RepairLineItemにはない。通常Repair入力で「対象部品」を直接案件明細へ保存する受け皿がない。

### detailを保存できるか

現行のRepairWorkNameには `detailLabel` があるが、RepairLineItemには明細時点の `detailLabelSnapshot` がない。入力時の詳細ラベルを確定明細として残せない。

### 表示名スナップショットを保存できるか

RepairLineItemには以下の表示名スナップショットがある。

```txt
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
```

ただし、これらは現行の `item.name` から作られており、カテゴリ・対象部品・処置・詳細から生成された表示名ではない。

### PricingRuleと構造化入力を接続できるか

現行PricingRuleは `suggestedWorkName` 中心で、構造化されたカテゴリ・対象部品・処置・詳細を持たない。構造化入力に対して価格候補を出すには、後続でPricingRuleへ参照IDまたは検索キーを追加する設計が必要。

### EstimateItemで構造化入力をsnapshotできるか

現行EstimateItemは `itemName / quantity / unitPrice / type / partsMasterId` のみ。見積発行時点で構造化IDや表示名種別をsnapshotするには不足している。

ただし、当面は `RepairLineItem -> EstimateItem` の生成時に、EstimateItemへは帳票用の確定表示名だけを渡す段階移行も可能。

### PublicCase下書きを生成できるか

現行PublicCaseはFMP由来PublicCaseを表示する導線が中心。通常RepairからPublicCase下書きを生成する場合は、RepairLineItemのB2B/B2C表示名・価格表示フラグ・交換部品表示のスナップショットを使う設計が必要。

## 5. RepairWorkNameを大量seedしない理由

`RepairWorkName` を以下のように作ると、管理対象がすぐ膨らむ。

```txt
PartNameMaster x RepairWorkAction
```

問題:

```txt
実際には使わない作業名が大量に混ざる
過去に除外した候補が再登場しやすい
部品名と処置の単純結合では不自然な名称ができる
表示名生成の責務がseedテーブルへ寄りすぎる
PricingRuleやPublicCase表示との境界が曖昧になる
```

そのため、当面は `RepairWorkName` seed候補表を作らない。構造化入力とスナップショット保存の受け皿を先に設計する。

## 6. 推奨する将来データ構造

### RepairLineItemへの追加候補

通常Repairの正式明細本体として、RepairLineItemに以下の追加を検討する。

```txt
repairWorkCategoryId Int?
repairWorkActionId Int?
targetPartNameId String?
repairWorkNameId Int?
detailLabelSnapshot String?
categoryNameSnapshot String?
targetPartNameSnapshot String?
actionNameSnapshot String?
workDisplayNameSnapshot String?
```

既存の表示名snapshotは維持する。

```txt
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
```

使い分け案:

```txt
workDisplayNameSnapshot
-> 構造化入力から生成された社内標準作業名

itemNameSnapshot
-> 明細の基本表示名。初期はworkDisplayNameSnapshotと同値でもよい

estimateDisplayNameSnapshot
-> 見積書・納品書向けの表示名

b2bDisplayNameSnapshot
-> B2B共有ページ・B2B PublicCase向け

b2cDisplayNameSnapshot
-> B2C共有ページ・B2C PublicCase向け
```

`repairWorkNameId` は必須にしない。よく使う組み合わせやレビュー済み候補を選んだ場合だけ参照できる任意IDとする。

### RepairWorkNameの位置づけ

RepairWorkNameは、初期入力の必須マスタではなく、以下の用途へ寄せる。

```txt
よく使う組み合わせ
レビュー済みの入力候補
表示名テンプレート
PricingRule接続候補
検索候補
```

PartName x Action の全組み合わせをseedする場所にはしない。

### detailの扱い

`detail` は自由な作業名ではなく、対象部品より細かい作業箇所・要素を示す。

例:

```txt
targetPartName = 一番受け
action = 修理
detail = ブッシュ
display = 一番受けブッシュ修理
```

detail は当面 snapshot 文字列として扱う。RepairLineItem側に `detailLabelSnapshot` のような文字列を持たせる案が自然だが、完全自由入力にはせず、既存候補から選択できるUIを想定し、新規入力はreview扱いにする。

外装設計などで detail 候補が増え、表記ゆれや検索要件が明確になった場合のみ、将来的に detail 候補マスタ化を検討する。現時点では `RepairWorkDetailMaster` の新設は前提にしない。

## 7. PricingRule接続案

PricingRuleは価格ルールとして残す。作業マスタ本体にはしない。

将来追加候補:

```txt
repairWorkCategoryId Int?
repairWorkActionId Int?
targetPartNameId String?
repairWorkNameId Int?
detailLabel String?
```

互換性のため、`suggestedWorkName` は残す。

役割:

```txt
RepairWorkCategory / PartNameMaster / RepairWorkAction / detail
-> 入力構造・検索・分類

PricingRule
-> 条件別価格候補

RepairLineItem
-> 案件ごとの確定価格・表示名・参照IDのsnapshot
```

PricingRule検索は将来的に以下の順で広げる。

```txt
brand / model / caliber
+ repairWorkCategoryId
+ repairWorkActionId
+ targetPartNameId
+ detailLabel
+ customerType
```

ただし、初期は `suggestedWorkName` 互換を残し、既存導線を壊さない。

## 8. UI案

内装作業入力は、以下の順で選べるようにする。

```txt
1. repairType = INTERNAL
2. RepairWorkCategory
3. targetPartNameId / PartNameMaster
4. RepairWorkAction
5. detail
6. 価格
7. 表示名プレビュー
```

UI上はドリルダウンだけに固定しない。どの段階でも文字入力検索できるようにする。

```txt
カテゴリから探す
部品名から探す
処置から絞る
作業名プレビューから探す
```

detailは「作業名を自由入力する欄」ではない。対象部品より細かい箇所を補う欄とする。

新規入力されたdetailや組み合わせは即正式マスタ化せず、review扱いで保存する。

## 9. 表示名生成案

基本形:

```txt
targetPartName + detail + actionDisplayName
```

例:

```txt
ゼンマイ + null + 交換
-> ゼンマイ交換

一番受け + ブッシュ + 修理
-> 一番受けブッシュ修理

ローター真 + null + かしめ
-> ローター真かしめ
```

targetPartNameがない作業も許容する。

例:

```txt
category = ムーブメント
targetPartName = null
action = 調整
standardName = 精度調整
```

```txt
category = ムーブメント
targetPartName = null
action = 修理
standardName = オーバーホール
```

この場合は単純生成ではなく、よく使う候補またはテンプレートとして `RepairWorkName` を使う余地がある。

## 10. 非採用方針

今回の時点では以下を行わない。

```txt
RepairWorkName seed候補表を作らない
PartName x Action の全組み合わせを作らない
過去に除外した候補を復活させない
RepairWorkActionを12件より増やさない
FMP専用クリーニングを通常Repairへ持ち込まない
RepairWorkNameを帳票・共有ページ・PublicCaseへ直接表示しない
部品マスタ全体仕様を作業マスタ設計へ混ぜない
```

## 11. 次Task案

### Task 108-9B

RepairLineItem / PricingRuleに必要なschema差分を設計する。

対象:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
repairWorkNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
workDisplayNameSnapshot
```

### Task 108-9C

内装作業入力UIを設計する。

対象:

```txt
カテゴリ選択
対象部品選択
処置選択
detail候補選択
表示名プレビュー
価格候補
review扱いの新規入力
```

### Task 108-9D

表示名スナップショット生成ルールを設計する。

対象:

```txt
社内表示名
帳票表示名
B2B表示名
B2C表示名
PublicCase向け表示名
```

## 12. 未解決事項

```txt
RepairLineItemへどの構造化IDを追加するか
EstimateItemへ構造化IDを持たせるか、表示名snapshotだけにするか
PricingRuleを構造化検索へどう段階移行するか
targetPartNameなし作業をRepairWorkNameテンプレートで扱うか
detail候補をどこに保存するか
RepairWorkNameをいつ、どの条件で正式候補化するか
PublicCase下書き生成時にRepairLineItemのどのsnapshotを使うか
```

## 13. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
prisma/schema.prisma
prisma/seed.ts
src/**
scripts/**
DB
migration
RepairEntryForm
RepairLineItem保存処理
PricingRule
帳票/PDF/LINE
PublicCase
```
