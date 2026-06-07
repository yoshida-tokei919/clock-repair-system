# Task 108-1: RepairWorkCategory / RepairWorkName 採用方針の記録

## 1. 概要

内装作業マスタのmodel命名・構造について、A〜D案を比較し、B案を採用する。

採用する作業マスタ名:

```txt
RepairWorkCategory
RepairWorkName
```

このTaskでは設計方針の記録のみ行う。schema実装、migration、seed、API、UI、DB操作は行わない。

## 2. 前提

正本方針:

```txt
部品マスタと作業マスタは別物。
作業マスタは入力補助・標準化・候補選択の元データ。
帳票・共有ページ・PublicCaseへは作業マスタ名を直接表示しない。
RepairLineItemに表示名スナップショットを保存する。
EstimateItemは見積発行時点スナップショット。
PublicCaseは公開用スナップショット。
PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない。
旧Excel由来候補や107-5大量seed案をそのまま正式マスタ化しない。
```

RepairLineItemまでの現在地:

```txt
RepairLineItem
→ 通常Repairの正式な案件明細本体

EstimateItem
→ 見積発行時点のスナップショット明細

PublicCase
→ RepairLineItemなどの確定明細から生成する公開用スナップショット
```

作業マスタは、このRepairLineItemへ接続する入力補助・標準化レイヤーとして設計する。

## 3. A〜D案比較

| 案 | model名 | 概要 | メリット | デメリット | 判断 |
|---|---|---|---|---|---|
| A案 | `WorkCategoryMaster` + `WorkNameMaster` | 汎用的な作業カテゴリ・作業名マスタ | 名前が短い。一般的なマスタ名として理解しやすい。 | Repair用の作業マスタであることが名前から弱い。将来、修理以外の作業や社内作業と混ざる可能性がある。部品マスタの `PartCategoryMaster` / `PartNameMaster` と並べたとき用途が曖昧。 | 不採用 |
| B案 | `RepairWorkCategory` + `RepairWorkName` | Repairで使う作業カテゴリ・作業名マスタ | Repair用だと明確。内装・外装を共通モデルで扱える。RepairLineItem、PricingRule、PublicCaseへ接続しやすい。部品マスタと混同しにくい。 | 名前はやや長い。Repair以外の作業管理へ使う場合は用途が限定される。 | 採用 |
| C案 | `InternalWorkMaster` / `ExternalWorkMaster` | 内装・外装で別modelにする | 内装・外装の違いをmodel名で明確にできる。 | 内装・外装で同じ構造が重複する。PricingRuleやRepairLineItemへの接続が分裂する。外装追加時に同じ設計を繰り返しやすい。 | 不採用 |
| D案 | `RepairWorkCategory` + `RepairWorkMaster` | カテゴリと作業本体という名前にする | Repair用であることは明確。作業名以外の属性も含む本体として見える。 | `RepairWorkMaster` が作業名なのか作業セットなのか曖昧。`RepairWorkName` より候補選択用の名称マスタとしての役割が伝わりにくい。 | 不採用 |

## 4. B案採用の結論

B案を採用する。

```txt
RepairWorkCategory
→ 修理作業カテゴリ

RepairWorkName
→ 修理作業名
```

採用理由:

```txt
Repairで使う作業マスタだと分かりやすい。
部品マスタと混同しにくい。
内装・外装を共通モデルで扱える。
RepairLineItemへ接続しやすい。
PricingRuleと接続しやすい。
PublicCase生成にも使いやすい。
WorkCategoryMaster / WorkNameMaster より用途が明確。
InternalWorkMaster / ExternalWorkMaster のように分裂しにくい。
```

## 5. RepairWorkCategoryの役割

`RepairWorkCategory` は、修理作業のカテゴリを表す。

想定する責務:

```txt
内装 / 外装の区分を持つ。
作業カテゴリの階層を持てる。
入力時のドリルダウン選択に使う。
RepairWorkNameを分類する。
RepairLineItemへcategory path snapshotを渡す元データになる。
```

想定項目案:

```txt
id
parentId nullable
repairType
key
name
displayOrder
isActive
createdAt
updatedAt
```

`repairType`:

```txt
internal
external
```

方針:

```txt
内装作業・外装作業は同じRepairWorkCategoryで扱う。
初期はinternalを優先する。
externalは同じ構造で後続設計できるようにする。
```

## 6. RepairWorkNameの役割

`RepairWorkName` は、修理作業名を表す。

想定する責務:

```txt
Repair入力時の作業候補。
技術料明細の標準化。
B2B/B2C/帳票/PublicCase下書き向け表示名defaultの元データ。
PricingRuleとの接続元。
RepairLineItemへsnapshot保存する元データ。
自由入力を減らし、候補がない場合だけ候補化するための土台。
```

想定項目案:

```txt
id
categoryId
repairType
key
name
kana nullable
searchText
defaultInternalName
defaultEstimateDisplayName
defaultB2bDisplayName
defaultB2cDisplayName
defaultPublicCaseDisplayName nullable
targetLabel nullable
actionLabel nullable
treatmentLabel nullable
displayOrder
isActive
createdAt
updatedAt
```

初期方針:

```txt
初期は完成名として持つ。
例: オーバーホール、精度調整、ゼンマイ交換、巻真交換。
```

将来の余地:

```txt
targetLabel
actionLabel
treatmentLabel
```

これにより、「ゼンマイ + 交換」のような構造化や分析へ後から進められる。ただし初期実装で処置マスタを分けない。

## 7. PartCategoryMaster / PartNameMaster / PartsMasterとの関係

部品マスタは既存を維持する。

```txt
PartCategoryMaster
PartNameMaster
PartsMaster
```

役割分離:

```txt
PartCategoryMaster / PartNameMaster
→ 部品カテゴリ・標準部品名。

PartsMaster
→ 部品実体、在庫、価格、サイズ、写真、仕入先、海外検索、グレードなど。

RepairWorkCategory / RepairWorkName
→ Repair入力時の作業カテゴリ・作業名・処置・技術料・表示名default。
```

重要:

```txt
部品交換技術料は作業マスタ側。
交換対象部品の実体は部品マスタ側。
PublicCaseでの交換部品表示は、RepairLineItem / PublicCase snapshotを元にする。
```

例:

```txt
RepairWorkName: ゼンマイ交換
PartsMaster: ゼンマイ
RepairLineItem:
  LABOR ゼンマイ交換
  PART ゼンマイ
```

## 8. RepairLineItemとの接続方針

RepairWorkNameを選択した時点で、RepairLineItemへ参照IDとsnapshotを保存する。

想定するRepairLineItem側の保存項目:

```txt
repairWorkNameId または workNameId相当
pricingRuleId
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
quantity
unitPrice
amount
showPriceB2b
showPriceB2c
sortOrder
```

方針:

```txt
作業マスタ現在値を帳票・共有ページ・PublicCase表示時に後読みしない。
RepairLineItemへ保存したsnapshotを正とする。
RepairWorkNameが後で変更されても、過去RepairLineItemの表示名・価格は勝手に変わらない。
```

注意:

```txt
現在のRepairLineItem schemaには、作業マスタ参照IDはまだ追加しない。
RepairWorkCategory / RepairWorkNameのschema方針が固まってから追加する。
```

## 9. PricingRuleとの接続方針

PricingRuleは価格ルールとして残す。

接続方針:

```txt
PricingRuleを作業マスタ本体にしない。
PricingRule.suggestedWorkNameは移行期間fallbackとして残す。
将来的にPricingRuleへrepairWorkNameIdを追加する案を検討する。
RepairWorkName選択後、条件に合うPricingRuleから価格候補を取得する。
RepairLineItemへpricingRuleIdと価格snapshotを保存する。
```

検索条件の候補:

```txt
repairWorkNameId
customerType
brandId
modelId
caliberId
movementMakerId
movementCaliberId
baseMovementMakerId
baseMovementCaliberId
```

ただし、movement系条件の追加は別Taskで扱う。

## 10. PublicCaseとの関係

PublicCaseは公開事例用の別スナップショット。

方針:

```txt
PublicCase表示時にRepairWorkCategory / RepairWorkNameを後読みしない。
RepairLineItemへ保存されたB2B/B2C表示名snapshotや価格表示フラグからPublicCase下書きを生成する。
PublicCase生成後はPublicCase自身のsnapshotを正とする。
```

B2C:

```txt
価格非表示を基本とする。
作業名は一般ユーザー向けに粗くしてよい。
内部管理文言は出さない。
```

B2B:

```txt
showPriceB2b = true かつ正の価格のみ表示。
0円は表示しない。
未紐づけPartItem価格は表示しない。
部品代ラベルは使わず、必要なら「交換部品」。
内部管理文言・コピー表記は出さない。
```

## 11. FMP過去案件との切り分け

FMP過去案件:

```txt
FMP原文
→ FMP専用クリーニング
→ RepairWorkNameへの対応付け候補
→ PublicCase候補
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
internal / external
→ RepairWorkCategory
→ RepairWorkName
→ RepairLineItem
→ EstimateItem snapshot
→ PublicCase下書き
```

FMP専用クリーニングや推定を、新アプリ通常Repairの入力設計へ持ち込まない。

旧Excel由来候補は参考資料として扱い、正式なRepairWorkName初期seedとしてそのまま採用しない。

## 12. 次Task案

Task 108-2:

```txt
RepairWorkCategory / RepairWorkName の最小フィールド案を設計する。
repairType、階層、表示名default、target/action/treatment、isActive、displayOrderを整理する。
schema実装はまだ行わない。
```

Task 108-3:

```txt
RepairWorkName選択時にRepairLineItemへsnapshot保存する項目を、現在のRepairLineItem schemaとの差分として整理する。
schema実装はまだ行わない。
```

Task 108-4:

```txt
内装RepairWorkCategory / RepairWorkNameの初期候補を、旧Excel大量seedではなく、通常Repair入力に必要な最小候補として再設計する。
```

## 13. 未解決事項

未解決:

```txt
RepairWorkCategory / RepairWorkName のID型
repairTypeをStringにするかenumにするか
parentId階層の深さ制限
RepairWorkName.keyの命名規則
defaultPublicCaseDisplayNameを初期から持つか
targetLabel / actionLabel / treatmentLabelを初期から持つか
PricingRuleへrepairWorkNameIdをいつ追加するか
RepairLineItemへ作業マスタ参照IDをいつ追加するか
relatedWorkLineItemIdの本格紐づけ方法
外装作業候補をいつ同じモデルへ流し込むか
```

## 14. 変更しなかったもの

このTaskでは以下を変更していない。

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
