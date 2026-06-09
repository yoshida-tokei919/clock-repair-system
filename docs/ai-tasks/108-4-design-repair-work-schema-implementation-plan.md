# Task 108-4: RepairWork系マスタのschema実装方針

## 1. 概要

Task 108-1〜108-3で整理した作業マスタ方針に基づき、次のschema実装へ入る前にPrisma model案を確定する。

対象:

```txt
RepairWorkAction
RepairWorkCategory
RepairWorkName
```

このTaskではschema実装は行わない。`prisma/schema.prisma`、API、UI、DB、seed、migrationは変更しない。

## 2. 前提

確定済み方針:

```txt
RepairWorkCategory
-> 修理作業カテゴリ
-> 入力補助・標準化・候補選択用のカテゴリマスタ

RepairWorkName
-> 修理作業名
-> 入力補助・標準化・検索用マスタ

RepairWorkAction
-> 修理作業処置マスタ
-> 検索・分類・集計用の処置大分類マスタ
```

正本方針:

```txt
部品マスタと作業マスタは別物。
RepairWorkNameを帳票・共有ページ・PublicCaseへ直接表示しない。
RepairLineItemへ表示名・価格・参照IDをsnapshot保存する。
PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない。
```

既存schemaの参考:

```txt
PartCategoryMaster / PartNameMaster / PartGradeMaster は String id @default(cuid()) と key を持つ。
PartsMaster は実部品レコードで Int id。
RepairLineItem は案件明細本体で Int id。
```

RepairWork系マスタは、部品名マスタ系に近い性質のため、`String @id @default(cuid())` と `key` を持つ方針を第一候補にする。

## 3. 参照ドキュメント

```txt
docs/design/internal-work-selection-ux-and-master-structure.md
docs/ai-tasks/108-0-prepare-internal-work-master-after-repair-line-item.md
docs/ai-tasks/108-1-compare-internal-work-master-model-structure.md
docs/ai-tasks/108-2-design-repair-work-category-structure.md
docs/ai-tasks/108-3-design-repair-work-name-structure.md
```

## 4. RepairWorkAction model方針

`RepairWorkAction` は修理作業処置マスタである。内装・外装共通で使う。

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

model案:

```prisma
model RepairWorkAction {
  id          String   @id @default(cuid())
  key         String   @unique
  displayName String
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)

  workNames   RepairWorkName[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([sortOrder])
  @@index([isActive])
}
```

採用方針:

```txt
id
-> String @default(cuid())

key
-> stable key
-> 例: exchange, repair, adjust, correction, polish, clean, oil, make, install, remove, hole_tightening, staking

displayName
-> 日本語表示名
-> 例: 交換, 修理, 調整, 修正, 研磨, 洗浄, 注油, 製作, 取付, 除去, 穴締め, かしめ

repairType
-> 持たせない
-> 内装・外装共通の処置大分類として使う
```

理由:

```txt
「交換」「修理」「調整」などは内装・外装の両方で使える。
処置そのものは修理区分に依存しない。
stable key と displayName を分けることで、seedやコード参照と画面表示を分離できる。
```

## 5. RepairWorkCategory model方針

`RepairWorkCategory` は修理作業カテゴリである。

model案:

```prisma
model RepairWorkCategory {
  id          String         @id @default(cuid())
  repairType  RepairWorkType
  parentId    String?
  parent      RepairWorkCategory?  @relation("RepairWorkCategoryTree", fields: [parentId], references: [id])
  children    RepairWorkCategory[] @relation("RepairWorkCategoryTree")

  key         String   @unique
  name        String
  displayName String?
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)

  workNames   RepairWorkName[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([repairType])
  @@index([parentId])
  @@index([repairType, parentId])
  @@index([repairType, sortOrder])
  @@index([isActive])
}
```

採用方針:

```txt
repairType
-> 必須
-> INTERNAL / EXTERNAL

parentId
-> nullable
-> self relationを持つ
-> 初期運用は1〜2階層

key
-> stable key
-> repairTypeを含めた一意キーにするか、global unique keyにするかは実装時に最終確認
-> 初期案はglobal unique

name
-> 内部名

displayName
-> 画面表示名
-> nullable。未設定時はnameをfallback表示

publicDisplayName
-> 初期は持たせない
```

理由:

```txt
カテゴリは入力補助・分類用。
公開表示名はRepairWorkNameまたはRepairLineItem snapshot側で扱う。
PartCategoryMasterとは別レイヤーのため、PartCategoryMasterへのrelationは張らない。
```

## 6. RepairWorkName model方針

`RepairWorkName` は修理作業名マスタである。

model案:

```prisma
model RepairWorkName {
  id               String         @id @default(cuid())
  repairType       RepairWorkType

  categoryId       String
  category         RepairWorkCategory @relation(fields: [categoryId], references: [id])

  targetPartNameId String?
  targetPartName   PartNameMaster? @relation(fields: [targetPartNameId], references: [id])

  actionId         String?
  action           RepairWorkAction? @relation(fields: [actionId], references: [id])

  detailLabel      String?

  standardName     String
  b2bDisplayName   String?
  b2cDisplayName   String?
  description      String?

  sortOrder        Int      @default(0)
  isActive         Boolean  @default(true)
  source           RepairWorkSource @default(MANUAL)
  reviewStatus     RepairWorkReviewStatus @default(APPROVED)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([repairType])
  @@index([categoryId])
  @@index([targetPartNameId])
  @@index([actionId])
  @@index([repairType, categoryId])
  @@index([repairType, categoryId, targetPartNameId])
  @@index([repairType, sortOrder])
  @@index([isActive])
  @@index([reviewStatus])
}
```

採用方針:

```txt
repairType
-> 必須
-> 検索・絞り込みを簡単にするためRepairWorkName側にも持つ

categoryId
-> 必須

targetPartNameId
-> optional
-> PartNameMaster参照まで
-> PartsMasterへは紐づけない

actionId
-> optionalから開始する
-> RepairWorkAction参照
```

`actionId` をoptionalから開始する理由:

```txt
オーバーホール、磁気抜き、精度調整など、処置大分類を単純に割り切りにくい作業がある。
初期データ投入時に無理な分類を避ける。
ただし、交換系・修理系など分類しやすい作業は積極的にactionIdを入れる。
将来、運用が安定したらapprovedなRepairWorkNameではactionId必須へ寄せられる。
```

表示名方針:

```txt
standardName
-> 必須
-> 社内標準作業名 / 候補選択名

b2bDisplayName
-> nullable
-> fallbackはstandardName

b2cDisplayName
-> nullable
-> fallbackはstandardNameまたは説明寄り表示名
```

レビュー方針:

```txt
source
-> 初期から持つ

reviewStatus
-> 初期から持つ
-> 自由入力候補やdetailLabel新規入力を即正式化しないため
```

## 7. enum方針

### RepairWorkType

`repairType` はenumにする。

候補:

```prisma
enum RepairWorkType {
  INTERNAL
  EXTERNAL
}
```

理由:

```txt
値が internal / external の2種類に限定されている。
カテゴリ・作業名の両方で使う。
typoを防ぎたい。
```

### RepairWorkReviewStatus

`reviewStatus` はenumにする。

候補:

```prisma
enum RepairWorkReviewStatus {
  APPROVED
  REVIEW
  REJECTED
}
```

理由:

```txt
自由入力候補を即正式化しない運用に必要。
状態数が少なく、固定化しやすい。
画面上の候補表示・管理対象の切り分けに使う。
```

### RepairWorkSource

`source` もenumにする。

候補:

```prisma
enum RepairWorkSource {
  MANUAL
  USER_SUGGESTED
  FMP_MAPPING
  SYSTEM
}
```

理由:

```txt
正式seed、ユーザー入力候補、FMP対応付け候補、システム生成候補を区別できる。
FMP由来候補を通常Repairの正式マスタへ混ぜ込まないための監査情報になる。
```

注意:

```txt
FMP_MAPPINGはFMP過去案件救済との対応付け由来を示すためのsourceであり、FMP救済ルールを通常Repairへ持ち込む意味ではない。
```

## 8. aliases / searchKeywordsの扱い

Task 108-3では `aliases` / `searchKeywords` を検討した。

このTaskでは、初期schemaには入れず後回しにする方針とする。

比較:

| 案 | 内容 | 評価 |
|---|---|---|
| A案 | `RepairWorkName` に `String[]` で持つ | Prisma/PostgreSQL上は可能だが、検索実装方針を先に決めたい |
| B案 | JSONで持つ | 柔軟だが検索・管理が曖昧になりやすい |
| C案 | `RepairWorkNameAlias` 別テーブルを作る | 正規化しやすいが初期modelが増える |
| D案 | 初期schemaでは持たず後回し | 最小実装に向く |

採用はD案。

理由:

```txt
最初にmodelを増やしすぎない。
検索実装時に本当に必要な形が見える。
まずは standardName / displayName / targetPartName / category / action で検索する。
```

将来候補:

```txt
RepairWorkNameAlias
RepairWorkNameSearchKeyword
```

## 9. RepairLineItemとの接続方針

将来的には、`RepairLineItem` へ以下を追加する可能性がある。

```txt
repairWorkNameId
repairWorkCategoryId
repairWorkActionId
targetPartNameId
```

ただし、Task 108-5では追加しない方針とする。

方針:

```txt
まずRepairWork系マスタ単体をschema追加する。
RepairLineItemへの接続は後続Taskで行う。
```

理由:

```txt
現在のRepairLineItem dual writeは安定済み。
一気にRepairLineItem schemaまで触ると影響範囲が広い。
まず作業マスタ単体を追加し、その後seed/API/UIの順で接続する。
```

## 10. PricingRuleとの接続方針

将来的には、`PricingRule` へ以下を追加する可能性がある。

```txt
repairWorkNameId
```

ただし、Task 108-5では追加しない方針とする。

方針:

```txt
PricingRule連携は後続Task。
PricingRuleを作業マスタ本体として扱わない。
```

理由:

```txt
PricingRuleは既存の価格候補ロジックとRepairEntryFormに関わる。
先にRepairWorkName単体を実装し、価格接続は別Taskで安全に行う。
```

## 11. PartNameMasterとの接続方針

`RepairWorkName.targetPartNameId` は、既存の `PartNameMaster.id` へのoptional relationとする。

方針:

```txt
RepairWorkName.targetPartNameId
-> PartNameMaster.id
-> optional
```

行わないこと:

```txt
PartsMasterへのrelation
在庫・価格・仕入先との接続
部品Refとの接続
```

理由:

```txt
RepairWorkNameは作業名を標準化するマスタ。
PartsMasterは実部品レコード。
作業マスタが実部品へ直接紐づくと、在庫・価格・仕入設計と混ざる。
```

## 12. seed方針

Task 108-5でschemaを追加した後、seedはTask 108-6以降で分割する方針とする。

優先順位:

```txt
108-5
-> schema追加のみ

108-6
-> RepairWorkAction 12件のみseed

108-7以降
-> RepairWorkCategory / RepairWorkName のseed候補を最小単位で検討
```

理由:

```txt
RepairWorkAction 12件は確定度が高い。
RepairWorkCategory / RepairWorkName はまだ誤投入リスクがある。
旧Excel大量seed方式には戻さない。
```

## 13. Task 108-5以降の分割案

Task 108-5:

```txt
RepairWorkType / RepairWorkReviewStatus / RepairWorkSource enum追加
RepairWorkAction model追加
RepairWorkCategory model追加
RepairWorkName model追加
既存modelへの最小relation追加
db push / migration / seedは行わない
```

Task 108-6:

```txt
RepairWorkAction 12件のseed案をMarkdownで確認し、実装可否を決める。
```

Task 108-7:

```txt
RepairWorkAction 12件のみseed実装する。
RepairWorkCategory / RepairWorkName seedはまだ行わない。
```

Task 108-8:

```txt
RepairWorkCategoryの最小seed候補を再確認する。
```

Task 108-9:

```txt
RepairWorkNameの最小seed候補を通常Repair入力に必要な範囲で設計する。
```

## 14. 採用案

採用案:

```txt
RepairWorkType
-> enum

RepairWorkReviewStatus
-> enum

RepairWorkSource
-> enum

RepairWorkAction
-> model
-> id String @default(cuid())
-> key stable key
-> displayName Japanese label
-> repairTypeは持たせない

RepairWorkCategory
-> model
-> id String @default(cuid())
-> repairType必須
-> parentId self relation
-> key / name / displayName

RepairWorkName
-> model
-> id String @default(cuid())
-> repairType必須
-> categoryId必須
-> targetPartNameId optional
-> actionId optional
-> detailLabel nullable String
-> standardName必須
-> b2bDisplayName / b2cDisplayName nullable
-> source / reviewStatusを持つ
```

Task 108-5では以下を行わない:

```txt
RepairLineItemへのwork系参照ID追加
PricingRuleへのrepairWorkNameId追加
aliases / searchKeywordsテーブル追加
RepairWorkDetailMaster追加
seed実装
```

## 15. 後回し事項

後回し:

```txt
aliases専用テーブル
searchKeywords専用テーブル
RepairWorkDetailMaster
RepairLineItemへのrepairWorkNameId / repairWorkCategoryId / repairWorkActionId追加
PricingRuleへのrepairWorkNameId追加
PublicCaseWorkItemへのsourceRepairLineItemId連携
RepairEntryFormの作業マスタ検索UI
RepairWorkCategory / RepairWorkName seed
```

## 16. 未解決事項

未解決:

```txt
RepairWorkAction.keyの最終英語名
RepairWorkCategory.keyをglobal uniqueにするか、repairType + key uniqueにするか
RepairWorkNameにkeyを持たせるか
RepairWorkName.standardNameとinternalNameを分けるか
b2bDisplayName / b2cDisplayNameをnullableにするか必須にするか
actionIdを将来的に必須化するか
detailLabelをどのタイミングでRepairWorkDetailMasterへ昇格するか
aliases / searchKeywordsをどの形で実装するか
RepairLineItemへの作業マスタ参照ID追加タイミング
PricingRuleとの接続タイミング
```

## 17. 変更しなかったもの

このTaskでは以下を変更しない。

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
RepairLineItem
PricingRule
```
