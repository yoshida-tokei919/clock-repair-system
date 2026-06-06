# AI Task 068: FMP公開候補JSONのPublicCase投入設計

## 目的

FMP公開候補中間JSON `docs/data/fmp/generated/public-case-candidates.json` を、将来PublicCase系テーブルへ投入するための設計を整理する。

今回は投入設計のみを作成し、投入スクリプト実装、DB接続、DB更新、migration、seed、API、UI、FMP投入処理、`prisma/schema.prisma` 変更は行わない。

## 前提

- PublicCase系schemaはTask 066で追加済み。
- Task 067でschema差分は大きな問題なしと判断済み。
- FMP公開候補JSONはTask 063で生成済み。
- FMP由来の公開候補は通常 `Repair` へ直接流し込まない。
- WEB_APP由来の将来事例化とは投入経路を分ける。
- 画像は今回のFMP中間JSONには含まれない。
- B2Cでは価格を表示しない。
- B2Bでは安全に紐づいたWorkItem / PartItemのみ価格表示候補にする。

## 参照ファイル

- `prisma/schema.prisma`
- `docs/ai-tasks/063-generate-fmp-public-case-candidates.md`
- `docs/ai-tasks/064-classify-fmp-public-case-warnings.md`
- `docs/ai-tasks/065-design-public-case-db-models.md`
- `docs/ai-tasks/066-implement-public-case-db-models.md`
- `docs/ai-tasks/067-review-public-case-schema-diff.md`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `scripts/generate-fmp-public-case-candidates.ts`

## 投入対象データ

投入対象は `public-case-candidates.json` の公開候補Caseのみ。

Task 063時点の確定件数:

| 項目 | 件数 |
| --- | ---: |
| 公開候補Case | 2,924 |
| 内装候補明細 | 2,624 |
| 外装候補明細 | 711 |
| 内装のみ | 2,245 |
| 外装のみ | 477 |
| 内外装両方 | 202 |
| 警告 | 472 |
| `part_without_publishable_work` | 466 |
| `source_text_normalized` | 6 |

投入対象の主な構造:

- Case単位: `sourceType`, `sourceRepairId`, 時計情報、候補フラグ、合計金額、warnings, excludeReasons
- WorkItem単位: `workItemKey`, `sourceArea`, `sourceSlot`, 原文、正規化原文、公開可否、表示名、技術料、レビュー状態
- PartItem単位: `sourceArea`, `sourceSlot`, 原文、正規化原文、表示名、価格、`relatedWorkItemKey`

## 投入しないデータ

- FMP元CSVの全3,886件のうち、公開候補がないCase
- CSV / Excel / JSON本体への書き戻し結果
- 顧客名、電話番号、住所、メール、顧客管理番号、内部メモ、備考、連絡事項、取引先情報、仕入価格、原価、利益
- 画像データ
- 通常 `Repair` への案件データ
- 既存マスタへの変換結果

## sourceType / sourceRepairId / repairId の扱い

FMP投入では以下を固定する。

```txt
sourceType = FMP
sourceRepairId = 中間JSONのsourceRepairId
repairId = null
```

必須チェック:

- `sourceType` は必ず `FMP`
- `sourceRepairId` は必須
- `sourceRepairId` は空文字不可
- `sourceRepairId` はtrim後に同一JSON内で重複不可
- FMP由来では `repairId` を設定しない

WEB_APP由来の将来事例化では、別投入経路で以下を想定する。

```txt
sourceType = WEB_APP
repairId = Repair.id nullable
sourceRepairId = null またはWEB_APP用source key
```

FMP投入処理ではWEB_APP由来データを扱わない。

## 再投入・重複防止キー案

主キー相当の重複防止キー:

```txt
PublicCase: sourceType + sourceRepairId
```

FMPでは `sourceRepairId` を必須扱いにするため、`sourceType = FMP` と組み合わせて再投入時の照合に使える。

再投入時の推奨モード:

| モード | 方針 |
| --- | --- |
| `dry-run` | DBを書き換えず、作成予定・更新予定・スキップ予定・停止理由を集計する |
| `create-only` | 既存 `sourceType + sourceRepairId` があるCaseはスキップし、新規だけ作成する |
| `replace-fmp-case` | 対象FMP Caseの子データを削除して再作成する。実装時は明示オプション必須 |
| `skip-existing` | 既存Caseを完全スキップし、差分だけレポートする |

最初の実装では `dry-run` と `create-only` を優先する。

`replace-fmp-case` はrollback方針と件数検証が固まるまで実装を急がない。

## 投入順序

### PublicCase

1. JSON全体の事前検証を行う。
2. `critical` 相当の警告や必須項目不足があれば投入停止する。
3. `sourceType + sourceRepairId` で既存Caseを確認する。
4. 新規投入対象のみ `PublicCase` を作成する。
5. 作成後、JSON内の `sourceRepairId` とDBの `PublicCase.id` の対応Mapを持つ。

主なマッピング:

| JSON | PublicCase |
| --- | --- |
| `sourceType` | `sourceType` |
| `sourceRepairId` | `sourceRepairId` |
| `receivedDate` | `receivedDate` |
| `brandName` | `brandName` |
| `modelName` | `modelName` |
| `ref` | `ref` |
| `caliber` | `caliber` |
| `totalAmount` | `totalAmount` |
| `warnings` | `warnings` |
| `excludeReasons` | `excludeReasons` |
| Case全体の安全な断片 | `sourceSnapshot` |

初期状態:

```txt
reviewStatus = NEEDS_REVIEW
b2bPublishStatus = HIDDEN
b2cPublishStatus = HIDDEN
showPriceB2b = true
showPriceB2c = false
repairId = null
```

### PublicCaseWorkItem

1. `internalWorkItems`, `externalWorkItems`, `outsourcedWorkItems` を結合する。
2. `PublicCase.id` を付与して作成する。
3. 作成後、JSON内の `workItemKey` とDBの `PublicCaseWorkItem.id` の対応MapをCaseごとに持つ。

WorkItemの対応Map:

```txt
caseKey = sourceRepairId
workItemKey = internal-1 / external-1 / outsourced-1 など
value = PublicCaseWorkItem.id
```

### PublicCasePartItem

1. `partItems` をCaseごとに処理する。
2. `relatedWorkItemKey` があり、同Case内の対応WorkItemが存在する場合だけ `relatedWorkItemId` を設定する。
3. `relatedWorkItemKey` がない、または対応WorkItemが見つからない場合は `relatedWorkItemId = null` にする。
4. 未紐づけPartItemは `reviewStatus = NEEDS_REVIEW` とし、`showPriceB2b = false` にする。

### PublicCaseWarning

1. Caseの `warnings` 配列を構造化する。
2. `part_without_publishable_work:*` は `severity = REVIEW` として作成する。
3. `source_text_normalized:*` は `severity = INFO` として作成する。
4. `critical` が検出された場合は投入前に停止するため、通常作成されない。

## WorkItem投入ルール

WorkItemは公開対象・非公開対象の両方を保存する。

理由:

- 公開候補Case内の文脈を残すため
- PartItemの未紐づけ理由を後から追跡するため
- review UIで作業明細を再確認できるようにするため

レビュー状態の変換案:

| JSON reviewStatus | DB reviewStatus |
| --- | --- |
| `reviewed` | `APPROVED` |
| `unreviewed` | `NEEDS_REVIEW` |
| `excluded` | `REJECTED` |
| 未指定 | `DRAFT` |

価格表示:

| 条件 | showPriceB2b | showPriceB2c |
| --- | --- | --- |
| `isPublishable = true` かつ `reviewStatus = reviewed` | true | false |
| `isPublishable = false` | false | false |
| `excludeReason` あり | false | false |
| 価格なし | false | false |

B2Bで表示する技術料は、公開対象かつレビュー済みのWorkItemだけを基本とする。

## PartItem投入ルール

PartItemは公開対象Case内の部品明細として保存する。

レビュー状態の基本:

| 条件 | relatedWorkItemId | reviewStatus | relationStatus | showPriceB2b | showPriceB2c |
| --- | --- | --- | --- | --- | --- |
| `relatedWorkItemKey` が公開WorkItemに解決できる | set | `APPROVED` | `LINKED` | true | false |
| `relatedWorkItemKey` なし | null | `NEEDS_REVIEW` | `UNLINKED` | false | false |
| `relatedWorkItemKey` はあるが解決できない | null | `NEEDS_REVIEW` | `NEEDS_REVIEW` | false | false |
| priceなし | 任意 | 状態に従う | 状態に従う | false | false |

B2Bで部品代を表示するのは、公開対象WorkItemに紐づき、レビュー済みで、価格があり、除外理由がないPartItemだけにする。

## part_without_publishable_work への対応

`part_without_publishable_work` は投入停止理由ではなく、公開前レビュー対象とする。

保存方針:

- PartItemとして保存する
- `relatedWorkItemId = null`
- `reviewStatus = NEEDS_REVIEW`
- `relationStatus = UNLINKED` または `NEEDS_REVIEW`
- `showPriceB2b = false`
- `showPriceB2c = false`
- `PublicCaseWarning` に `code = part_without_publishable_work`、`severity = REVIEW` で保存する

これにより、部品欄の情報は失わず、B2B価格に誤って混ざることを避ける。

## Warning投入ルール

警告は `PublicCase.warnings` JSONにも保存し、検索・分類用には `PublicCaseWarning` にも展開する。

警告文字列の分解:

```txt
part_without_publishable_work:external-1
code = part_without_publishable_work
target = external-1
severity = REVIEW

source_text_normalized:internal-1
code = source_text_normalized
target = internal-1
severity = INFO
```

severity方針:

| code | severity | 投入可否 | 方針 |
| --- | --- | --- | --- |
| `part_without_publishable_work` | `REVIEW` | 可 | 公開前レビュー対象 |
| `source_text_normalized` | `INFO` | 可 | ログ扱い |
| 未知のcritical相当 | `CRITICAL` | 不可 | 投入停止 |
| 未知のwarning code | `REVIEW` | 原則可 | dry-runで件数と代表例を必ず出す |

criticalが1件でもある場合、DB投入は開始しない。

## B2B/B2C公開状態と価格表示

PublicCase初期状態:

```txt
b2bPublishStatus = HIDDEN
b2cPublishStatus = HIDDEN
reviewStatus = NEEDS_REVIEW
showPriceB2b = true
showPriceB2c = false
```

B2C:

- Case / WorkItem / PartItemすべて `showPriceB2c = false`
- 将来の公開APIでは価格カラムを返さない
- B2C表示名は短い作業名候補として使う

B2B:

- WorkItemは公開対象・レビュー済み・価格ありなら `showPriceB2b = true`
- PartItemは公開WorkItemに紐づき・レビュー済み・価格ありなら `showPriceB2b = true`
- 未紐づけPartItem、除外WorkItem、未レビューWorkItem、価格なし明細は `showPriceB2b = false`

公開状態は投入直後はすべて `HIDDEN` とし、自動公開しない。

## dry-run設計

投入スクリプト実装時は、DB更新前に必ずdry-runを実行できるようにする。

dry-runで行うこと:

- JSON読み込み
- schema相当の入力検証
- `sourceRepairId` 必須チェック
- JSON内重複チェック
- warning分類
- critical検出
- 作成予定件数の集計
- 既存DBと照合する場合は読み取りのみ
- WorkItem key解決シミュレーション
- PartItemの `relatedWorkItemId` 解決可否シミュレーション
- B2B/B2C価格表示フラグの算出
- 投入停止理由の一覧化

dry-run出力案:

```txt
casesToCreate
casesToSkipExisting
workItemsToCreate
partItemsToCreate
warningsToCreate
unlinkedPartItems
criticalWarnings
reviewWarnings
infoWarnings
priceVisibleB2bWorkItems
priceVisibleB2bPartItems
priceHiddenB2cItems
```

dry-runが期待件数と一致しない場合は、本投入を禁止する。

## 件数検証

投入前の期待値:

| 項目 | 期待値 |
| --- | ---: |
| PublicCase | 2,924 |
| 内装候補WorkItem | 2,624 |
| 外装候補WorkItem | 711 |
| Warning総数 | 472 |
| `part_without_publishable_work` | 466 |
| `source_text_normalized` | 6 |

投入後の検証:

- `PublicCase` の `sourceType = FMP` 件数
- `PublicCase.sourceRepairId` のnull件数が0であること
- `PublicCase.repairId` の非null件数が0であること
- `PublicCaseWorkItem` の総数
- `PublicCaseWorkItem.isPublishable = true` の内装・外装件数
- `PublicCasePartItem.relatedWorkItemId is null` の件数
- `PublicCasePartItem.reviewStatus = NEEDS_REVIEW` かつ `showPriceB2b = false` の未紐づけ件数
- `PublicCaseWarning` のseverity別件数
- `PublicCaseWarning.code` 別件数
- B2C価格表示フラグが全件falseであること

特に確認する不変条件:

```txt
FMP PublicCase repairId non-null count = 0
FMP PublicCase sourceRepairId null count = 0
B2C showPrice true count = 0
critical warning count = 0
unlinked part item showPriceB2b true count = 0
```

## rollback / 再投入方針

初回投入はtransaction単位で行う。

推奨方針:

1. dry-runで件数一致を確認する。
2. 本投入はバッチ単位または全体transactionで行う。
3. エラー時はtransaction rollbackする。
4. 成功後は件数検証を行う。
5. 再投入は `sourceType + sourceRepairId` で既存判定する。

再投入モード:

- 安全優先: 既存Caseはskipする。
- 修正反映: 明示オプション付きでFMP Case単位に子データを削除して再作成する。
- 全削除再投入: migration直後の初期検証環境だけで許可し、本番では禁止または強い確認を必須にする。

rollback用に残すべき情報:

- 実行日時
- 入力JSONファイルパス
- 入力JSONのhash
- 作成した `sourceRepairId` 一覧
- 作成件数
- skip件数
- warning件数

実装時に専用import logテーブルが未定の場合は、まずdry-runレポートファイルで代替し、DB投入ログテーブルは別タスクで検討する。

## 実装時の注意

- FMP投入スクリプトはDB更新を行うため、読み取り専用スクリプトとは分ける。
- FMP由来は `repairId = null` を徹底する。
- WEB_APP由来事例化ロジックと同じ関数に混ぜすぎない。
- `sourceArea`、`relationStatus`、warning codeは定数化してtypoを防ぐ。
- `receivedDate` は `2019/10/06` 形式をDateへ変換する。変換不能な場合はdry-runで警告にする。
- `PublicCase.warnings` JSONと `PublicCaseWarning` の二重保存は、JSONを元配列スナップショット、Warningテーブルを検索用展開として扱う。
- `sourceSnapshot` には公開禁止情報を入れない。
- B2C向けAPIや公開ページでは価格カラムをselectしない。
- 投入直後は `HIDDEN` とし、自動公開しない。
- `git add .`、commit、pushは行わない。

## 次タスク案

- Task 069: FMP PublicCase import dry-run script
- Task 070: FMP PublicCase import実装
- Task 071: 公開候補一覧UI設計
