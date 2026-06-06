# AI Task 067: PublicCase schema差分レビュー

## 目的

Task 066で追加したPublicCase系schema差分について、既存モデルへの影響、FMP / WEB_APPのsource設計、B2B/B2C公開状態、nullable relation、unique / index、onDelete、Postgres上の懸念を確認する。

今回はレビューのみとし、`prisma/schema.prisma` の追加変更、migration、seed、DB更新、API、UI、FMP投入処理は行わない。

## 参照ファイル

- `prisma/schema.prisma`
- `docs/ai-tasks/065-design-public-case-db-models.md`
- `docs/ai-tasks/066-implement-public-case-db-models.md`
- `docs/ai-tasks/064-classify-fmp-public-case-warnings.md`

## schema差分概要

`git diff -- prisma/schema.prisma` の差分は以下に限定されている。

- 既存 `Repair` へ `publicCases PublicCase[]` を追加
- `PublicCaseSourceType` enumを追加
- `PublicCasePublishStatus` enumを追加
- `PublicCaseReviewStatus` enumを追加
- `PublicCaseWarningSeverity` enumを追加
- `PublicCase` modelを追加
- `PublicCaseWorkItem` modelを追加
- `PublicCasePartItem` modelを追加
- `PublicCaseImage` modelを追加
- `PublicCaseWarning` modelを追加

`prisma format` による既存schema全体の整形差分は最終差分に残っていない。

## 既存モデルへの影響

既存モデルへの変更は `Repair.publicCases PublicCase[]` のリレーション追加のみ。

既存 `Repair` の既存フィールド、既存relation、既存enum、`PricingRule`、既存マスタには変更なし。FMP過去案件を通常 `Repair` へ直接流し込む構造にもなっていない。

この点は最小影響に収まっている。

## 追加モデルレビュー

### PublicCase

Case単位の公開事例スナップショットとして必要な項目を持っている。

- `sourceType`
- `sourceRepairId`
- nullable `repairId`
- 時計情報の表示用項目
- B2B/B2C個別公開状態
- B2B/B2C個別タイトル・summary
- B2B/B2C価格表示フラグ
- 金額合計
- `warnings`
- `excludeReasons`
- `sourceSnapshot`

FMP由来とWEB_APP由来を同じテーブルで扱いつつ、通常Repairへの必須依存を避けられている。

### PublicCaseWorkItem

作業明細の原文、正規化原文、公開可否、レビュー状態、表示名、価格、ルールスナップショットを保持できる。

内装・外装・外注は `sourceArea` の文字列で表現している。enum化していないため柔軟だが、投入時のtypo防止はスクリプト側で必要。

### PublicCasePartItem

Caseへ必ず紐づき、WorkItemへは任意で紐づく設計になっている。

`relatedWorkItemId Int?` と nullable relation により、`part_without_publishable_work` を失わず保存できる。

### PublicCaseImage

画像なしでもPublicCaseが成立し、将来画像を追加できる別テーブルになっている。

### PublicCaseWarning

警告を構造化して保持できる。`PublicCase.warnings Json?` との併用は可能だが、後続設計でどちらを検索・表示の正とするか決める必要がある。

## 追加enumレビュー

- `PublicCaseSourceType`: `FMP` / `WEB_APP` で目的に合う
- `PublicCasePublishStatus`: `HIDDEN` / `READY` / `PUBLISHED` / `ARCHIVED` でB2B/B2Cの公開状態管理に使える
- `PublicCaseReviewStatus`: `DRAFT` / `NEEDS_REVIEW` / `APPROVED` / `REJECTED` で初期レビューと公開前確認に使える
- `PublicCaseWarningSeverity`: `CRITICAL` / `REVIEW` / `INFO` で064の警告分類と合う

enumは最小限で、既存enumへの影響もない。

## nullable設計レビュー

- `PublicCase.repairId` は nullable
- `PublicCase.repair` は optional relation
- `PublicCase.sourceRepairId` は nullable
- `PublicCasePartItem.relatedWorkItemId` は nullable
- `PublicCaseImage` は子テーブルで任意

FMP由来では `repairId = null` を許容できる。WEB_APP由来では将来的に `repairId` で通常Repairへ任意に紐づけできる。

`PublicCasePartItem.relatedWorkItemId` が nullable であるため、部品のみ存在するFMPデータも保存可能。

## B2B/B2C公開状態レビュー

`PublicCase` に以下が分離されている。

- `b2bPublishStatus`
- `b2cPublishStatus`
- `b2bPublishedAt`
- `b2cPublishedAt`
- `showPriceB2b`
- `showPriceB2c`

WorkItem / PartItemにも `showPriceB2b` / `showPriceB2c` があるため、B2Bでは価格表示、B2Cでは価格非表示という設計に対応できる。

ただし、実際のB2C価格非表示はschemaだけで保証されない。APIや公開ページ側ではB2C用selectを分け、価格カラムを返さない実装にする必要がある。

## FMP / WEB_APP source設計レビュー

`sourceType` により `FMP` と `WEB_APP` を区別できる。

FMP由来:

- `sourceType = FMP`
- `sourceRepairId = FMP修理ID`
- `repairId = null`

WEB_APP由来:

- `sourceType = WEB_APP`
- `repairId = Repair.id` を任意設定
- `sourceRepairId` は null または将来の内部source key

通常RepairへFMP過去案件を直接流し込まない前提に合っている。

## part_without_publishable_work 466件への対応確認

064で確認した `part_without_publishable_work` 466件は、以下の設計で吸収できる。

- `PublicCasePartItem.publicCaseId` は必須
- `PublicCasePartItem.relatedWorkItemId` は nullable
- `relationStatus` で `UNLINKED` / `NEEDS_REVIEW` 相当を表現できる
- `reviewStatus` と `excludeReason` を保持できる
- `PublicCaseWarning` または `PublicCase.warnings` に警告を残せる

よって、部品欄はあるが同slotに公開候補WorkItemがないケースを取り込み前に落とさず保持できる。

## onDelete / relation レビュー

`PublicCase.repair` は `onDelete: SetNull`。

通常Repairが削除されてもPublicCaseの公開スナップショットを残せるため、WEB_APP由来の将来連携として妥当。

PublicCase配下の以下は `onDelete: Cascade`。

- `PublicCaseWorkItem`
- `PublicCasePartItem`
- `PublicCaseImage`
- `PublicCaseWarning`

PublicCaseを削除した場合に子データも削除されるため、親子関係として自然。

`PublicCasePartItem.relatedWorkItem` は `onDelete: SetNull`。

WorkItemを削除しても部品明細が消えず、`part_without_publishable_work` と同様の状態へ戻せるため妥当。

## unique / index レビュー

`@@unique([sourceType, sourceRepairId])` は、FMP再取り込み時の重複判定キーとして使える。

注意点:

- Postgresでは nullable unique に複数の `NULL` を許容する。
- そのため、`sourceRepairId = null` のWEB_APP由来PublicCaseを複数保存できる。
- FMP由来では投入処理側で `sourceRepairId` 必須にする必要がある。

これは危険なglobal uniqueではなく、FMPの重複防止に使える一方、WEB_APPの複数事例を妨げない。設計意図には合っている。

indexは以下の検索に対応している。

- `repairId`
- ブランド・モデル・Ref・Caliber
- B2B/B2C公開状態
- review状態
- WorkItemのCase、sourceArea、正規化原文、公開可否
- PartItemのCase、関連WorkItem、sourceArea
- WarningのCase、code、severity

現時点の2,924件規模では過剰な負荷は想定しにくい。ただし、`b2bPublishStatus`、`b2cPublishStatus`、`reviewStatus`、`isPublishable` は低カーディナリティになりやすく、将来データ量が増えたら単体indexより複合indexや部分indexを検討する余地がある。

## 懸念点

1. `@@unique([sourceType, sourceRepairId])` はnullable uniqueのため、FMP由来で `sourceRepairId` がnullの誤投入はDB制約だけでは防げない。
2. `PublicCase.warnings Json?` と `PublicCaseWarning` が併存しており、後続設計でsource of truthを決めないと二重管理になりうる。
3. `sourceArea`、`relationStatus`、`imageRole` がStringのため、投入スクリプト側で値の統制が必要。
4. `showPriceB2b` のdefaultがWorkItem / PartItemともにtrueのため、未レビュー・非公開・未紐づけ部品を保存する場合は投入時に明示的にfalseへ落とす運用が必要。
5. B2C価格非表示はschemaのフラグだけでは保証されないため、API・公開ページ実装時に価格カラムを返さない設計が必要。
6. enumはPostgres migration後に値の変更がやや重くなるため、公開状態・レビュー状態の語彙はmigration前に再確認する。

## 修正が必要そうな点

現時点で `prisma validate` を止めるschema不整合や、migration前に必ず修正すべき重大問題は見つからなかった。

ただし、migrationへ進む前に以下は方針確認を推奨する。

- FMP投入処理で `sourceType = FMP` の場合に `sourceRepairId` を必須扱いにする。
- `part_without_publishable_work` のPartItemは、投入時に `relationStatus = UNLINKED` または `NEEDS_REVIEW`、必要に応じて `showPriceB2b = false` にする。
- `warnings Json?` と `PublicCaseWarning` の役割分担を決める。

## 修正不要と判断した点

- `Repair` への追加が `publicCases PublicCase[]` のみである点
- FMP由来で `repairId null` を許容する点
- WEB_APP由来で `repairId` をnullable relationにする点
- `PublicCasePartItem.relatedWorkItemId` を nullable にする点
- PublicCase配下の子テーブルを `onDelete: Cascade` にする点
- `PublicCase.repair` と `PublicCasePartItem.relatedWorkItem` を `onDelete: SetNull` にする点
- 価格を整数円の `Int` とする点
- snapshot、warning、metadataをPrisma `Json` として持つ点

## 確認結果

```powershell
npx prisma validate
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

補足:

- `npx prisma validate` は通常実行ではPrisma schema-engine取得がネットワーク制限で失敗したため、同じコマンドを権限付きで再実行して成功。

## 次タスク案

- Task 068: PublicCase migration前の制約・default最終確認
- Task 069: FMP中間JSONをPublicCaseへ投入する設計
- Task 070: 公開候補一覧UI設計
