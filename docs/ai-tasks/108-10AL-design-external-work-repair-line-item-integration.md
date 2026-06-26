# Task 108-10AL: 外装作業入力・RepairLineItem接続設計

作成日: 2026-06-26

対象ブランチ: `wip-publiccase-workmaster-20260606`

参照資料:

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AJ-implement-pricing-rule-candidate-filter.md`
- `docs/ai-tasks/108-10AJ-ui-require-customer-type-selection.md`
- `docs/ai-tasks/108-10AK-delete-null-customer-type-pricing-rules.md`
- `C:\Users\yoshi\Downloads\外装作業マスタ_最新化版_20260626.md`

## 目的

外装作業入力を、現行の `RepairLineItem` / `PricingRule` / `PartNameMaster` / `PartsMaster` 方針と矛盾しない形で設計する。

今回は docs 設計のみとし、schema / migration / seed / UI / API / PartsMaster 検索系 / 帳票 / 共有ページ / PublicCase 実装は変更しない。

## 背景

内装作業と PricingRule は、108-10AJ / 108-10AJ-ui / 108-10AK までで以下の方針に寄った。

- 修理明細は `RepairLineItem` 中心。
- `PricingRule` は作業マスタ本体ではなく、条件別の価格候補・参考価格。
- `PricingRule` は `repairWorkNameId` と構造 field を持つ。
- 顧客種別は必ず `customerType = business` または `customerType = individual`。
- `customerType = null` は旧データ / 不正データ扱い。
- 帳票 / 共有ページ / PublicCase はマスタ直参照ではなく、案件側 snapshot を使う。

次に外装作業を設計するが、外装はまだ正式 schema 化しない。まず、現行の明細構造へどう接続するかを決める。

## 現在の前提

### 部品マスタと作業マスタは別物

`PartsMaster` は実部品・在庫・価格・写真・仕入先・ブランド / Ref / サイズ等を扱う実部品マスタである。

`PartNameMaster` は標準部品名マスタであり、`RepairLineItem.targetPartNameId` は LABOR 行の作業対象部品名として `PartNameMaster` を参照する。

`RepairLineItem.partsMasterId` は PART 行の実部品 ID であり、`PartsMaster` を参照する。`targetPartNameId` と `partsMasterId` を混同しない。

### 作業マスタは表示の正本ではない

外装作業マスタは入力補助・表記ゆれ防止・候補選択の元データである。帳票 / 共有ページ / PublicCase に直接表示しない。

表示の正本は `RepairLineItem` の snapshot とする。

### FMP過去案件と新アプリ通常Repairは分ける

FMP過去案件には救済変換・表記ゆれ整理・確認対象抽出が必要だが、新アプリ通常 Repair の構造化入力を FMP 救済ルールで歪めない。

### 外装技術料方針

108-10AL 時点では、初期外装入力で内装のような価格自動入力を主軸にしない方針だった。

108-10AP でこの方針は上書きされた。外装 PricingRule 不要、外装価格候補不要、外装技術料は完全手入力のみ、という方針は撤回し、外装も `PricingRule` 候補選択式にする。RepairLineItem snapshot 方針は維持する。

基本は以下とする。

```txt
外装部品カテゴリ / 部品名 / 属性 / 処置 / 処置詳細を選ぶ
-> 表示作業名を自動生成する
-> PricingRule候補選択、または技術料を手入力する
```

## 外装作業入力構造

外装作業入力は、以下を基本構造とする。

| 項目 | 役割 | 初期保存先の考え方 |
| --- | --- | --- |
| 外装部品カテゴリ | 外装作業の大分類 | `RepairWorkCategory.repairType = EXTERNAL` の候補 |
| 外装部品名 | 作業対象部品名 | `PartNameMaster` 候補を使い、LABOR 行では `targetPartNameId` |
| 位置 | 部品特定属性 | 初期 schema では snapshot / detail 表現。正式 field は後続設計 |
| 素材 | 部品特定属性 | 初期 schema では snapshot / detail 表現。正式 field は後続設計 |
| サイズ | 部品特定属性 | 初期 schema では snapshot / detail 表現。正式 field は後続設計 |
| 色 | 部品特定属性 | 初期 schema では snapshot / detail 表現。正式 field は後続設計 |
| バリエーション | 部品特定属性 | 初期 schema では snapshot / detail 表現。正式 field は後続設計 |
| 処置 | 交換 / 取付 / 修理など | `RepairWorkAction` 候補 |
| 処置詳細 | 部品名 + 処置に紐づく詳細 | 初期は `detailLabelSnapshot`。将来 detail master 化候補 |
| 表示作業名 | 案件明細に出す確定名 | `itemNameSnapshot` / `b2bDisplayNameSnapshot` / `b2cDisplayNameSnapshot` |
| 技術料 | 外装 LABOR 行の金額 | 108-10AP 以降は `PricingRule` 候補選択、または手入力 `unitPrice` |
| B2B/B2C表示用snapshot | 表示先ごとの確定名 | `RepairLineItem` snapshot |

例:

```txt
カテゴリ: ケース・風防
部品名: ガラス
処置: 交換
B2B表示: ガラス交換技術料
B2C表示: ガラス交換
技術料: PricingRule候補選択、または手入力
```

例:

```txt
カテゴリ: リューズ・チューブ
部品名: リューズ
処置: 除去
処置詳細: 折れ込み巻芯
B2B表示: リューズ折れ込み巻芯除去技術料
B2C表示: リューズ折れ込み巻芯除去
技術料: PricingRule候補選択、または手入力
```

## RepairLineItem接続案

### 推奨案

外装技術料は `RepairLineItem.lineType = LABOR` として扱う。

外装交換部品は `RepairLineItem.lineType = PART` として扱い、必要に応じて `relatedWorkLineItemId` で外装 LABOR 行へ紐づける。

```txt
外装技術料
-> RepairLineItem.lineType = LABOR
-> repairWorkCategoryId = EXTERNALカテゴリ
-> targetPartNameId = PartNameMasterの標準部品名
-> repairWorkActionId = 外装でも使う処置
-> detailLabelSnapshot = 処置詳細
-> display snapshot = B2B/B2C用の確定表示名
-> unitPrice = PricingRule候補選択価格、または手入力技術料

外装交換部品
-> RepairLineItem.lineType = PART
-> partsMasterId = 実部品がある場合だけ
-> relatedWorkLineItemId = 対応する外装LABOR行
-> itemNameSnapshot = 交換部品名
-> unitPrice = 交換部品価格
```

`RepairLineItem` 自体には現時点で `repairType` field がない。そのため、内装 / 外装の区別は短期では以下から判断する。

- `repairWorkCategory.repairType = EXTERNAL`
- `RepairWorkName.repairType = EXTERNAL` 由来の候補
- snapshot 上の `categoryNameSnapshot` / `targetPartNameSnapshot` / `actionNameSnapshot`
- UI 側の入力モード

### addItemCategoryの扱い

現行 UI の `addItemCategory` は `internal | part_external` で、実質的には「技術料追加」と「交換部品追加」の切替に近い。

外装入力で `addItemCategory = external` を schema 的な区分として増やすのは、初期実装では避ける。理由は、外装も技術料は LABOR、交換部品は PART であり、内装 / 外装は line type ではなく repair type で区別すべきだからである。

ただし UI では、ユーザーの作業導線として以下のようなモード名は持ってよい。

```txt
技術料: 内装
技術料: 外装
交換部品
```

この UI モードは DB schema の `lineType` とは別物として扱う。

### 既存fieldの流用可否

| field | 外装での利用 | 方針 |
| --- | --- | --- |
| `lineType` | 利用する | 外装技術料は LABOR、交換部品は PART |
| `repairWorkCategoryId` | 利用する | `repairType = EXTERNAL` の外装カテゴリを参照 |
| `targetPartNameId` | 利用する | 外装対象部品名も `PartNameMaster` 由来 |
| `repairWorkActionId` | 利用する | 外装処置も `RepairWorkAction` を使う |
| `detailLabelSnapshot` | 利用する | 処置詳細を snapshot 保存 |
| `itemNameSnapshot` | 利用する | 表示作業名の正本 |
| `b2bDisplayNameSnapshot` | 利用する | B2B / アプリ内部用 |
| `b2cDisplayNameSnapshot` | 利用する | B2C 公開用 |
| `unitPrice` | 利用する | PricingRule候補選択価格、または手入力技術料 |
| `pricingRuleId` | 任意 | PricingRule候補を選択した場合に参照 |
| `relatedWorkLineItemId` | 利用する | PART 行を LABOR 行に紐づける |

### 初期schema追加を避けられる範囲

初期の最小外装入力は、現行 schema だけでも成立する。

成立する理由:

- 外装技術料は `LABOR` 行として保存できる。
- 外装交換部品は `PART` 行として保存できる。
- 対象部品名、処置、処置詳細、表示名、価格 snapshot を既存 field に保存できる。
- 内装 / 外装は `RepairWorkCategory.repairType` で分けられる。

ただし、外装属性を構造化検索・集計・再利用するには将来 schema 追加が必要である。

### 将来schema変更が必要な候補

外装属性を単なる表示名や detail に閉じ込めると、後から検索・集計・PartsMaster 連携が弱くなる。

将来の最小候補は以下。

| field候補 | 目的 | 優先度 |
| --- | --- | --- |
| `repairType` または `workSide` on `RepairLineItem` | 明細単体で内装 / 外装を判定 | 中 |
| `externalPositionSnapshot` | 3H / 6H / 2H / センターなど | 高 |
| `externalMaterialSnapshot` | サファイア / ミネラル等 | 中 |
| `externalSizeSnapshot` | サイズ違い | 中 |
| `externalColorSnapshot` | 色違い | 中 |
| `externalVariantSnapshot` | 純正 / FIT / 特殊仕様など | 中 |
| `workScopeSnapshot` | 仕上げ系のケース / ブレスレット等 | 高 |

ただし 108-10AL では schema 追加しない。108-10AP の方針変更後、schema / API 影響は 108-10AR 以降で調査する。

## PartNameMaster / PartsMaster の関係

### 比較

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A. 既存 `PartNameMaster` を内装 / 外装共用 | 標準部品名マスタを共通化し、必要ならカテゴリや属性で外装候補を分ける | `targetPartNameId` の意味が維持される。RepairLineItem / PricingRule と整合しやすい | 内装 / 外装で同名部品が混ざる可能性がある |
| B. `ExternalPartNameMaster` 新設 | 外装対象部品名を別 model にする | 外装専用の属性を持たせやすい | `targetPartNameId` の参照先が分裂する。RepairLineItem / PricingRule が複雑になる |
| C. `PartCategoryMaster` / `PartNameMaster` に side 区分を持たせる | `side = internal / external / both` のように分類する | 共通 model のまま外装候補を絞れる | schema 追加が必要。既存 seed / UI 影響を確認する必要がある |

### 推奨案

短期は A を採用する。つまり、外装対象部品名も既存 `PartNameMaster` を使う。

理由:

- `RepairLineItem.targetPartNameId` は標準部品名 ID であり、`PartsMaster` ID ではないという現行方針を維持できる。
- `PricingRule.targetPartNameId` と同じ意味で扱える。
- 外装作業を `RepairLineItem` に載せるために参照先を増やさずに済む。
- `PartsMaster` は実部品・在庫・価格・写真・仕入先であり、作業対象部品名とは分けられる。

中期は C を検討する。`PartNameMaster` に `side` あるいは適用範囲を持たせ、内装候補 / 外装候補 / 共通候補を UI で絞れるようにする。

B の `ExternalPartNameMaster` 新設は、現時点では非推奨とする。標準部品名の参照先が分裂し、`RepairLineItem` / `PricingRule` / PublicCase 生成で扱いが複雑になるためである。

## 外装カテゴリ・部品名方針

外装カテゴリ候補は、最新化版資料に合わせて以下を初期候補の方向性とする。

| key候補 | 表示名 | 方針 |
| --- | --- | --- |
| `case_glass` | ケース・風防 | ケース、裏蓋、ガラス、風防、サイクロプスレンズ等 |
| `crown_tube` | リューズ・チューブ | リューズ、チューブ、各種パッキン等 |
| `pushers` | プッシャー | プッシャー、チューブ、スプリング、ネジ、ピン等 |
| `bezel` | ベゼル | ベゼル、インサート、スプリング、ネジ、ルミナスポイント等 |
| `dial_hands` | 文字盤・針 | 文字盤、インデックス、各種針、蓄光等 |
| `bracelet_band` | ブレス・バンド | ブレスレット、バンド、コマ、クラスプ、バックル、尾錠、バネ棒等 |

今回の docs では seed 実装しない。108-10AM で初期 seed 候補として再整理する。

注意点:

- 尾錠はバックルに勝手に寄せない。
- 中留はクラスプの別名候補として扱う。
- サイクロプスレンズはケース・風防系に入れる。
- 位置は処置ではなく部品属性。
- ガラス / 風防 / ミネラルクリスタル / サファイアガラス / サファイアクリスタルは自動同一視しない。
- `Mineral` はミネラルクリスタル、`Sapphire` はサファイアクリスタルの方向だが、過去データの自動寄せは確認対象にする。

## 外装処置・処置詳細方針

### 処置候補

外装処置は `RepairWorkAction` を使う方針とする。初期候補の方向性は以下。

```txt
交換
取付
修理
修正
調整
加工
製作
接着
研磨
仕上げ
簡易仕上げ
洗浄
検査
塗装
サビ取り
乾燥
除去
溶接
ロウ付け
```

既存の内装用 `RepairWorkAction` と共通 model で扱うが、外装 seed 候補として不足するものは後続 Task で追加可否を確認する。

注意点:

- 交換と取付は別処置。
- 取り付け / 取付けは取付へ正規化する。
- ロー付けはロウ付けへ正規化する。
- 針位置修正のような処置は作らない。
- 位置は処置ではなく部品属性。

### 処置詳細

処置詳細は、外装部品名 + 処置に紐づけて候補表示する。

```txt
外装部品名
+ 処置
-> 処置詳細候補
```

全候補を一括表示しない。候補がない場合は新規入力を許可し、review 扱いまたは次回候補化の対象にする。

処置詳細は外装部品マスタには反映しない。部品名そのものと、作業上の詳細表現を混同しないためである。

例:

```txt
針 + 修正 + ハカマ
針 + 修正 + 曲がり
針 + 塗装 + 蓄光
リューズ + 除去 + 折れ込み巻芯
ケースネジ + 加工 + タップ
サイクロプスレンズ + 研磨
```

## 仕上げ系の扱い

仕上げ系は通常の `外装部品名 x 処置` だけでは扱いにくい。

理由:

- 対象がケースとブレスレットの複数範囲になりやすい。
- 金額で内容が変わる場合がある。
- OHセット割引など、FMP過去案件では文脈依存の判断が必要になる。
- `仕上げ` / `簡易仕上げ` だけでは作業範囲が不明になる。

### 推奨

初期実装では、仕上げ系を外装例外作業、または作業範囲つき作業として扱う。

候補:

```txt
ケース・ブレスレット仕上げ
ケース仕上げ
ブレスレット仕上げ
ケース・ブレスレット簡易仕上げ
ケース簡易仕上げ
ブレスレット簡易仕上げ
```

RepairLineItem への snapshot は、作業範囲込みの表示名を保存する。

```txt
itemNameSnapshot: ケース・ブレスレット仕上げ
b2bDisplayNameSnapshot: ケース・ブレスレット仕上げ技術料
b2cDisplayNameSnapshot: ケース・ブレスレット仕上げ
actionNameSnapshot: 仕上げ
detailLabelSnapshot: ケース・ブレスレット
```

将来は `workScopeSnapshot`、または仕上げ系専用の作業範囲 field を検討する。108-10AL では schema 追加しない。

## 外装PricingRule方針

108-10AP で方針変更した。初期外装作業では価格自動入力を主軸にしない、技術料は手入力、`PricingRule` は将来の参考価格候補に留める、という 108-10AL 時点の方針は撤回する。

108-10AP 以降の推奨方針:

- 外装も `PricingRule` を使う。
- 外装も内装と同じように候補選択式にする。
- 表示作業名の自動生成を優先する。
- 短期の基本条件は `customerType + brandId + targetPartNameId + repairWorkActionId`。
- `brandId` は外装では基本条件とする。
- `customerType` は外装でも必ず `business` / `individual`。
- `customerType = null` の外装 PricingRule は作らない、表示しない、fallback しない。
- 価格違いは別候補として保持する。
- 手入力済み価格は候補再取得で自動上書きしない。

短期は以下を条件候補にする。

```txt
brandId
targetPartNameId
repairWorkActionId
customerType
```

中期以降、必要になれば `modelId`、`ref`、`detailLabel`、`material`、`size`、`variant`、`exteriorAttributeSnapshot` を条件追加候補として検討する。今回 schema 変更はしない。

## B2B/B2C表示ルール

### B2B / アプリ内部

B2B とアプリ内部では、技術料と交換部品を分ける。

```txt
ガラス交換技術料 3,000円
交換部品: ミネラルクリスタル 2,000円
```

ルール:

- 技術料は外装 LABOR 行。
- 交換部品は外装 PART 行。
- ラベルは「交換部品」を使う。
- 「部品代」ラベルは使わない。
- B2B価格表示は `showPriceB2b = true` かつ正の価格だけ。
- 0円、内部価格、原価、利益、未紐づけ PART 価格は出さない。

### B2C

B2C では価格を出さず、短い作業名を表示する。

例:

```txt
ガラス交換
リューズ修理
針ハカマ修正
ケース仕上げ
```

B2C表示もマスタを直接読まず、`RepairLineItem.b2cDisplayNameSnapshot` から PublicCase 用 snapshot へ渡す。

## PublicCase接続方針

外装作業マスタは PublicCase に直接表示しない。

新アプリ通常 Repair:

```txt
構造化外装入力
-> RepairLineItem LABOR / PART
-> RepairLineItem snapshot
-> PublicCase下書き生成
-> PublicCaseWorkItem / PublicCasePartItem snapshot
```

FMP過去案件:

```txt
FMP専用変換ルール
-> 確認対象整理
-> PublicCase用snapshot
```

FMP過去案件の救済ルールは、新アプリ通常 Repair の入力ルールへ混ぜない。

## 未決事項

- `RepairLineItem` に `repairType` / `workSide` を持たせるか。
- 外装属性の位置 / 素材 / サイズ / 色 / バリエーションを snapshot field として追加するか。
- `PartNameMaster` に `side = internal / external / both` のような適用範囲を持たせるか。
- 外装処置詳細をいつ `RepairWorkDetailMaster` のような専用 master に昇格するか。
- 仕上げ系を例外作業 master にするか、作業範囲 field を持つ通常作業にするか。
- 外装 PART 行と LABOR 行の紐づけを必須にする範囲。
- 外装PricingRule候補の取得順、候補ラベルの表示方法。
- `ref` 条件を PricingRule に持たせる場合の schema 方針。

## 推奨案

108-10AL 時点の推奨は以下。

1. 外装技術料は `RepairLineItem.lineType = LABOR` で扱う。
2. 外装交換部品は `RepairLineItem.lineType = PART` で扱い、必要に応じて `relatedWorkLineItemId` で LABOR 行へ紐づける。
3. 内装 / 外装の区別は短期では `RepairWorkCategory.repairType = EXTERNAL` と UI 入力モードで扱う。
4. 外装対象部品名は短期では既存 `PartNameMaster` を使う。`ExternalPartNameMaster` は作らない。
5. `PartsMaster` は実部品・在庫マスタとして分け、作業マスタや LABOR 対象部品名に混ぜない。
6. 108-10AP 以降、外装も `PricingRule` 候補選択式にする。候補がない場合や例外価格は手入力できる。
7. 外装 PricingRule の基本条件は `customerType + brandId + targetPartNameId + repairWorkActionId`。`customerType` は必ず `business` / `individual`。
8. 帳票 / 共有ページ / PublicCase は `RepairLineItem` snapshot を正とし、外装作業マスタを直接表示しない。
9. 仕上げ系は、初期は作業範囲込みの例外作業名として snapshot 保存する。
10. schema / API 影響は 108-10AR 以降で別途調査する。

## 後続Task

- 108-10AM: 外装カテゴリ・部品名 seed候補設計
- 108-10AN: 外装部品名 seed実装
- 108-10AO: 外装処置・処置詳細 seed候補設計
- 108-10AP: 外装PricingRule方針修正・ドリルダウン価格候補設計
- 108-10AQ: 外装処置 seed実装
- 108-10AR: 外装PricingRule schema/API影響調査
- 108-10AS: 外装PricingRule候補取得設計
- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計

推奨順:

```txt
1. 108-10AM: 外装カテゴリ・部品名 seed候補設計
2. 108-10AN: 外装部品名 seed実装
3. 108-10AO: 外装処置・処置詳細 seed候補設計
4. 108-10AP: 外装PricingRule方針修正・ドリルダウン価格候補設計
5. 108-10AQ: 外装処置 seed実装
6. 108-10AR: 外装PricingRule schema/API影響調査
7. 108-10AS: 外装PricingRule候補取得設計
8. 108-10AT: 外装作業入力UI設計
9. 108-10AU: 外装PricingRule保存設計
```
