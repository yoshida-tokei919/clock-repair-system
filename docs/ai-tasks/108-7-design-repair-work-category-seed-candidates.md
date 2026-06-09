# Task 108-7: RepairWorkCategory seed候補の整理

## 目的

Task 108-6で `RepairWorkAction` 12件のseedまで完了したため、次に `RepairWorkCategory`（修理作業カテゴリ）の初期seed候補を整理する。

このTaskではMarkdown設計のみ行う。`prisma/seed.ts` は変更せず、DB操作も行わない。

## 前提

`RepairWorkCategory` は作業入力・検索・分類のためのカテゴリであり、部品カテゴリではない。

```txt
RepairWorkCategory
-> 作業入力・作業分類用

PartCategoryMaster
-> 部品管理・在庫・仕入・部品検索用
```

両者は名前が似る場合があっても別レイヤーとして扱う。

## 基本方針

### 内装修理 / 外装修理はカテゴリレコードにしない

```txt
内装修理 / 外装修理
-> repairType で表現する
-> RepairWorkCategoryのレコードにはしない
```

初期seedでは親カテゴリのみを投入候補にする。

```txt
parentId = null
```

理由:

```txt
初期カテゴリを細かくしすぎない
入力UIを重くしない
必要になった時に小カテゴリを追加できる
```

## seed判断の区分

| 判断 | 意味 |
| --- | --- |
| yes | 初期seedする候補 |
| review | 候補として残すが初期seed前に確認する |
| no | 初期seedしない |

## name / displayName方針

`name` はstable keyとして扱う。

`displayName` は日本語表示名として扱う。

初期seed実装時は、`repairType + parentId + name` を冪等性の基準にする。ただし `parentId = null` を含むunique制約の扱いは、seed実装時にPrisma / PostgreSQLで確認する。

## 内装修理カテゴリ候補

| name | displayName | repairType | parentId | sortOrder | seed判断 | 理由 | 想定作業例 |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| movement | ムーブメント | INTERNAL | null | 10 | review | 全体カテゴリとして便利だが広すぎるため、初期seedで使うか要確認。部品としてのムーブメントとは別物として扱う必要がある。 | オーバーホール、内部点検、動作確認 |
| quartz | クォーツ | INTERNAL | null | 20 | yes | 電池、二次電池、回路、コイル、接点などクォーツ固有作業の入力分類として必要。 | 電池交換、回路交換、コイル修理、接点修理 |
| power_winding | 動力・巻上 | INTERNAL | null | 30 | yes | ゼンマイ、香箱、巻真、巻上げ不良などの入力分類として必要。 | ゼンマイ交換、香箱修理、巻真交換、巻上げ不良修理 |
| train_wheel | 輪列 | INTERNAL | null | 40 | yes | 二番車、三番車、四番車など機械式輪列系の入力分類として必要。 | 二番車修理、三番車修理、四番車修理 |
| escapement | 脱進機 | INTERNAL | null | 50 | yes | アンクル、ガンギ車、振り石など脱進機周辺の入力分類として必要。 | アンクル修理、ガンギ車調整、振り石修正 |
| regulator | 調速機 | INTERNAL | null | 60 | yes | テンプ、天真、ヒゲゼンマイ、精度調整の分類として必要。 | テンプ調整、天真修理、ヒゲゼンマイ修正、精度調整 |
| hand_setting | 針回し | INTERNAL | null | 70 | yes | 針回し、ツヅミ車、キチ車、カンヌキ、オシドリ周辺の分類として必要。 | 針回し不良修理、ツヅミ車修理、カンヌキ修理 |
| calendar | カレンダー | INTERNAL | null | 80 | yes | 日車、曜車、日送り、曜送り、早送り周辺の分類として必要。 | 日送り修理、曜送り修理、カレンダー修理 |
| automatic_winding | 自動巻 | INTERNAL | null | 90 | yes | ローター、ローター真、切替車、自動巻車などの分類として必要。 | ローター修理、ローター真かしめ、切替車修理 |
| chronograph | クロノグラフ | INTERNAL | null | 100 | review | 通常Repairでの初期必要度を確認してから採用する。旧Excel由来候補をそのまま取り込まない。 | クロノグラフ作動不良修理、リセット不良修理 |
| main_plate | 地板 | INTERNAL | null | 110 | review | 部品カテゴリ寄りになりやすいため、作業分類として初期seedするか要確認。 | 地板修理、ネジ穴修正、受け座修正 |

## 内装修理カテゴリ no候補

現時点で明示的な `no` は置かない。

ただし、以下のようなカテゴリは初期seedしない方針とする。

```txt
部品名そのものだけのカテゴリ
処置名そのものだけのカテゴリ
旧Excel由来の細かすぎる分類
FMP救済専用カテゴリ
```

## 五番車の扱い

五番車はクォーツカテゴリで扱う方針を維持する。

機械式輪列カテゴリには初期採用しない。

```txt
五番車
-> クォーツ側で採用
-> 機械式輪列カテゴリには初期採用しない
```

機械式で該当が出た場合は、伝え車 / 中間車 / 出車など既存名称で扱えるか確認し、必要時のみ追加検討する。

## 外装修理カテゴリ候補

外装作業マスタの詳細設計は後続Taskで扱う。ただし `RepairWorkCategory` は内外装共通modelのため、外装カテゴリも初期候補として整理する。

| name | displayName | repairType | parentId | sortOrder | seed判断 | 理由 | 想定作業例 |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| glass_crystal | ガラス・風防 | EXTERNAL | null | 10 | yes | ガラス交換、風防交換、研磨など外装入力の基本カテゴリとして必要。 | ガラス交換、風防交換、風防研磨 |
| case_waterproof_finish | ケース・防水・外装仕上げ | EXTERNAL | null | 20 | yes | ケース修理、防水検査、外装仕上げを初期分類としてまとめる。広すぎる場合は後で分割する。 | ケース修理、防水検査、外装仕上げ |
| crown_pusher | リューズ・プッシャー | EXTERNAL | null | 30 | yes | リューズ、チューブ、プッシャー関連の入力分類として必要。 | リューズ交換、チューブ修理、プッシャー修理 |
| dial_hands_index | 文字盤・針・インデックス | EXTERNAL | null | 40 | yes | 文字盤、針、インデックス関連の作業分類として必要。部品カテゴリとは分ける。 | 針取付、文字盤修理、インデックス取付 |
| bracelet_band_clasp | ブレス・バンド・クラスプ | EXTERNAL | null | 50 | yes | ブレス調整、バンド交換、クラスプ修理などの入力分類として必要。 | ブレス調整、バンド交換、クラスプ修理 |
| other_external | その他外装 | EXTERNAL | null | 60 | review | 逃げカテゴリとして便利だが乱用を避けるため、初期seed前に運用方針を確認する。 | 外装その他作業 |

## 外装修理カテゴリ no候補

現時点で明示的な `no` は置かない。

ただし、以下は外装作業カテゴリでは扱わない。

```txt
外装部品のサイズ
素材
写真
仕入先
在庫
海外検索用分類
```

これらは部品マスタ側の責務とする。

## 初期seed yes / review / noまとめ

### yes

内装修理:

```txt
クォーツ
動力・巻上
輪列
脱進機
調速機
針回し
カレンダー
自動巻
```

外装修理:

```txt
ガラス・風防
ケース・防水・外装仕上げ
リューズ・プッシャー
文字盤・針・インデックス
ブレス・バンド・クラスプ
```

### review

内装修理:

```txt
ムーブメント
クロノグラフ
地板
```

外装修理:

```txt
その他外装
```

### no

現時点で明示的な `no` カテゴリはなし。

## PartCategoryMasterとの関係

`RepairWorkCategory` と `PartCategoryMaster` は別レイヤー。

例:

```txt
RepairWorkCategory: カレンダー
-> カレンダー周辺の作業入力分類

PartCategoryMaster: カレンダー系部品
-> 日車、曜車、日送り車などの部品管理分類
```

作業カテゴリは、部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索のための分類にはしない。

## FMP過去案件との関係

FMP過去案件の表記ゆれ整理、カテゴリ推定、複合作業分解はFMP専用処理として扱う。

新アプリ通常Repairの `RepairWorkCategory` seedは、FMP救済ルールや旧Excel由来候補をそのまま正式マスタ化しない。

## 後続Taskで確認すること

```txt
reviewカテゴリを初期seedに含めるか
RepairWorkCategory seed実装時のupsert where設計
parentId = null と @@unique([repairType, parentId, name]) の扱い
nameをstable keyとして使うか、keyフィールド追加を優先するか
外装カテゴリの詳細設計
```

## 変更しなかったもの

以下は変更していない。

```txt
prisma/schema.prisma
prisma/seed.ts
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
```
