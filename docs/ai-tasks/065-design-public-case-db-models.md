# AI Task 065: PublicCase系DBモデル設計

## 目的

FMP公開候補中間データを将来Supabase/Postgresへ保存するためのPublicCase系DBモデル案を設計する。

今回は設計ドキュメントのみ作成し、`prisma/schema.prisma`、migration、seed、DB、CSV / Excel / JSON本体は変更しない。

## 前提

- FMP過去案件は通常Repairへ直接流し込まない。
- FMP過去案件は `sourceType = FMP` としてPublicCase系へ取り込む。
- 将来、WEBアプリ上の通常Repair案件から事例化する場合は `sourceType = WEB_APP` として扱う。
- 画像なしでもPublicCaseが成立する。
- B2B / B2Cの公開状態は個別に持つ。
- B2Bは価格表示、B2Cは価格非表示を基本とする。
- 公開時点の表示名、価格、レビュー状態はスナップショットとして保存する。
- `part_without_publishable_work` 466件を吸収するため、PartItemはWorkItemに必須紐づけしない。

## 参照ファイル

- `docs/ai-tasks/062-design-fmp-public-case-intermediate-data.md`
- `docs/ai-tasks/063-generate-fmp-public-case-candidates.md`
- `docs/ai-tasks/064-classify-fmp-public-case-warnings.md`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/analyze-fmp-public-case-warnings.ts`

## 設計方針

- PublicCaseは通常Repairとは別の公開事例専用モデルにする。
- FMP由来とWEB_APP由来を同じPublicCase系モデルで扱えるようにする。
- FMP由来では `sourceRepairId` を保持し、WEB_APP由来では将来的に `repairId` をnullableで持てるようにする。
- 表示用フィールドはスナップショットとして保存し、マスタ更新で過去公開事例の表示が勝手に変わらないようにする。
- WorkItemとPartItemは分離する。
- PartItemの `relatedWorkItemId` はnullableにする。
- 警告・除外理由・レビュー状態は、正規カラムとJSONの併用にする。
- 画像は任意の別テーブル `PublicCaseImage` にする。

## モデル候補

- `PublicCase`
- `PublicCaseWorkItem`
- `PublicCasePartItem`
- `PublicCaseImage`
- `PublicCaseWarning` または warning JSON

補助enum候補:

```txt
PublicCaseSourceType: FMP / WEB_APP
PublicCaseReviewStatus: DRAFT / NEEDS_REVIEW / APPROVED / REJECTED
PublicCasePublishStatus: HIDDEN / READY / PUBLISHED / ARCHIVED
PublicCaseWorkDomain: INTERNAL / EXTERNAL / OUTSOURCED
PublicCasePartDomain: INTERNAL / EXTERNAL
PublicCaseWarningSeverity: CRITICAL / REVIEW / INFO
```

## PublicCase

Case単位の親モデル。

主なカラム案:

```txt
id
sourceType
sourceRepairId
repairId nullable
receivedDate nullable
brandName nullable
modelName nullable
ref nullable
caliber nullable

reviewStatus
b2bPublishStatus
b2cPublishStatus
b2bPublishedAt nullable
b2cPublishedAt nullable

b2bTitle nullable
b2cTitle nullable
b2bSummary nullable/json
b2cSummary nullable/json
publicTags json

showPriceB2b boolean default true
showPriceB2c boolean default false
internalLaborTotal nullable
externalLaborTotal nullable
outsourcedTotal nullable
partsTotal nullable
totalAmount nullable

warnings json
excludeReasons json
sourceSnapshot json

createdAt
updatedAt
```

設計メモ:

- `sourceType + sourceRepairId` はFMP取り込み済み判定に使う。
- `repairId` はWEB_APP由来の通常Repairと将来紐づけるためのnullable参照。
- `sourceSnapshot` には生成JSONの元Case断片を保持できるようにする。
- B2B/B2Cの公開状態は別カラムにする。
- 価格はB2B表示用に保持するが、B2Cでは表示しない。

## PublicCaseWorkItem

公開事例内の作業明細。

主なカラム案:

```txt
id
publicCaseId
sourceArea
sourceSlot nullable
sourceText
normalizedSourceText

isRuleMatched
isPublishable
reviewStatus
excludeReason nullable

normalizedWorkName nullable
b2bDisplayName nullable
b2cDisplayName nullable
laborPrice nullable
showPriceB2b boolean default true
showPriceB2c boolean default false

category nullable
partName nullable
action nullable
actionDetail nullable
attributes json
ruleSnapshot json

sortOrder
createdAt
updatedAt
```

設計メモ:

- 内装、外装、外注を `sourceArea` で分ける。
- `sourceText` はFMP原文、`normalizedSourceText` は突合用正規化後。
- `ruleSnapshot` に、変換時点のExcelルール由来情報を残す。
- 公開対象外WorkItemも、公開候補Case内の文脈として保存可能にする。

## PublicCasePartItem

公開事例内の部品明細。

主なカラム案:

```txt
id
publicCaseId
relatedWorkItemId nullable

sourceArea
sourceSlot nullable
sourceText
normalizedSourceText
displayName nullable
price nullable

showPriceB2b boolean default true
showPriceB2c boolean default false
relationStatus
reviewStatus
excludeReason nullable
metadata json

sortOrder
createdAt
updatedAt
```

設計メモ:

- `relatedWorkItemId` はnullableにする。
- `part_without_publishable_work` 466件は、WorkItemに紐づかないPartItemとして保存できる。
- B2Bで部品代を表示するかは、`reviewStatus` と `showPriceB2b` で制御する。
- B2Cでは価格非表示のため `showPriceB2c` は原則false。
- `relationStatus` は `LINKED / UNLINKED / NEEDS_REVIEW` などを想定する。

## PublicCaseImage

公開事例画像。

主なカラム案:

```txt
id
publicCaseId
storagePath nullable
url nullable
altText nullable
caption nullable
imageRole nullable
isPrimary boolean default false
reviewStatus
sortOrder
createdAt
updatedAt
```

設計メモ:

- PublicCaseは画像なしで成立する。
- 画像は後から追加できる。
- FMP初期取り込みでは0件でもよい。
- 将来、Repair写真や外部ストレージと紐づける場合もPublicCase本体とは分ける。

## B2B/B2C公開状態

PublicCaseにB2B/B2Cの公開状態を個別に持つ。

候補:

```txt
b2bPublishStatus: HIDDEN / READY / PUBLISHED / ARCHIVED
b2cPublishStatus: HIDDEN / READY / PUBLISHED / ARCHIVED
b2bPublishedAt
b2cPublishedAt
```

価格表示:

```txt
showPriceB2b = true
showPriceB2c = false
```

WorkItem / PartItemにも表示制御を持たせ、B2Bでは技術料と部品代を分けて表示できるようにする。

## スナップショット設計

PublicCaseは公開事例としてのスナップショットを持つ。

保存するもの:

- 表示名
- B2B/B2Cタイトル
- B2B/B2Cサマリー
- 価格
- 公開タグ
- 変換時点のルール情報
- FMP元データの安全な断片
- warning / excludeReasons

理由:

- ルールやマスタが更新されても、過去公開事例の表示が勝手に変わらないようにするため。
- FMP過去案件の元データを再解釈したときに差分検証できるようにするため。

## FMP過去案件との関係

FMP由来は以下を保持する。

```txt
sourceType = FMP
sourceRepairId = FMP修理ID
repairId = null
sourceSnapshot = 生成JSONの安全な元情報
```

FMP過去案件は通常Repairへ流し込まない。

PublicCaseへの取り込み済み判定は、`sourceType + sourceRepairId` を使う。

## WEB_APP新規案件との関係

WEB_APP由来は将来的に以下を想定する。

```txt
sourceType = WEB_APP
sourceRepairId = null または内部生成ID
repairId = 通常Repairのid
```

通常RepairからPublicCaseを作る場合も、公開時点の表示名・価格・コメントをスナップショット化する。

通常Repairの更新でPublicCaseが自動的に変わる設計にはしない。

## part_without_publishable_work への対応

064で `part_without_publishable_work` は466件。

対応する設計:

- `PublicCasePartItem.relatedWorkItemId` はnullable。
- WorkItemに紐づかない部品も保存可能にする。
- `relationStatus = UNLINKED` または `NEEDS_REVIEW` を持たせる。
- `warning` または `metadata` に `part_without_publishable_work` を残す。
- B2B表示では、レビュー済みになるまで部品代表示から除外する案を推奨。

これにより、部品欄はあるが対応WorkItemがないデータを失わず、誤ってB2B価格表示に混ぜることも避けられる。

## JSONで持つ項目と正規カラムにする項目

正規カラムにする項目:

- `sourceType`
- `sourceRepairId`
- `repairId`
- `brandName`
- `modelName`
- `ref`
- `caliber`
- `reviewStatus`
- `b2bPublishStatus`
- `b2cPublishStatus`
- `isPublishable`
- `sourceArea`
- `sourceSlot`
- `normalizedSourceText`
- `b2bDisplayName`
- `b2cDisplayName`
- `laborPrice`
- `price`
- `relatedWorkItemId`
- `sortOrder`

JSONで持つ項目:

- 変換ルールの詳細スナップショット
- warning一覧
- excludeReasons一覧
- sourceSnapshot
- attributes
- metadata
- publicTags
- B2B/B2C summary配列

方針:

- 検索・絞り込み・一覧表示に使うものは正規カラム。
- 監査、再生成、レビュー補助、詳細表示だけに使うものはJSON。

## インデックス案

候補:

```txt
PublicCase(sourceType, sourceRepairId) unique
PublicCase(repairId)
PublicCase(brandName)
PublicCase(modelName)
PublicCase(ref)
PublicCase(caliber)
PublicCase(b2bPublishStatus)
PublicCase(b2cPublishStatus)
PublicCase(reviewStatus)
PublicCaseWorkItem(publicCaseId)
PublicCaseWorkItem(sourceArea)
PublicCaseWorkItem(normalizedSourceText)
PublicCaseWorkItem(isPublishable)
PublicCasePartItem(publicCaseId)
PublicCasePartItem(relatedWorkItemId)
PublicCasePartItem(sourceArea)
PublicCaseImage(publicCaseId)
```

Postgresでは、将来必要なら `publicTags` や `warnings` JSONBにGIN indexを検討する。

## 容量見積もり

FMP初期候補:

```txt
PublicCase: 2,924件
PublicCaseWorkItem: 内装2,624 + 外装711 + 除外WorkItem381程度 = 約3,716件以上
PublicCasePartItem: 数百〜数千件規模
PublicCaseImage: 初期0件
Warning: JSON保存ならPublicCase内472件相当
```

この規模ならPostgres上の通常テーブルで十分扱える。

画像はDBにバイナリ保存せず、Storage等に置き、DBにはURLまたはstoragePathだけを保存する。

## schema.prisma 実装時の注意

- 今回は `prisma/schema.prisma` を変更しない。
- 実装時はenum名、既存命名規則、既存Relation方針に合わせる。
- `sourceType + sourceRepairId` のunique制約は、`sourceRepairId` nullable問題を考慮する。
- `repairId` はnullable Relationにする。
- `relatedWorkItemId` はnullable Relationにする。
- 金額は既存の価格型に合わせる。迷う場合は整数円で扱う。
- JSONB相当のフィールドはPrismaの `Json` を想定する。
- FMP由来の公開候補を投入しても通常Repairの件数や運用ステータスに影響しないようにする。
- B2Cで価格が漏れないよう、表示層だけでなくデータ取得層でもB2C用selectを分ける。

## 次タスク案

- Task 066: PublicCase DBモデル最小実装
- Task 067: FMP中間JSONをPublicCaseへ投入する読み取り/投入設計
- Task 068: 公開候補一覧UI設計
