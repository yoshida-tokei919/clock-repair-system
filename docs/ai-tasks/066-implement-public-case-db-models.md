# AI Task 066: PublicCase系DBモデル最小実装

## 目的

FMP過去データ由来の公開事例候補と、将来のWEBアプリ案件由来の公開事例を保存できるように、PublicCase系DBモデルを `prisma/schema.prisma` に最小追加した。

今回はDBモデル追加のみを対象とし、migration、seed、DB投入、API、UI、公開ページ、FMP投入処理は実装しない。

## 追加したモデル一覧

- `PublicCase`
- `PublicCaseWorkItem`
- `PublicCasePartItem`
- `PublicCaseImage`
- `PublicCaseWarning`

## 追加したenum一覧

- `PublicCaseSourceType`
- `PublicCasePublishStatus`
- `PublicCaseReviewStatus`
- `PublicCaseWarningSeverity`

## 各モデルの役割

### PublicCase

公開事例のCase単位スナップショットを保持する。

FMP由来の場合は `sourceType = FMP` と `sourceRepairId` を使い、通常Repairへ直接流し込まない。WEBアプリ由来の場合は `sourceType = WEB_APP` とし、将来的に `repairId` で `Repair` と任意に紐づけられる。

B2B/B2Cの公開状態、価格表示可否、ブランド・モデル・型番・キャリバー、金額合計、表示用summary、警告・除外理由、元データスナップショットを保持できる。

### PublicCaseWorkItem

公開事例に表示する作業明細を保持する。

内装、外装、外注などの元領域、元slot、原文、正規化原文、ルール一致、公開可否、レビュー状態、表示名、技術料、分類情報、ルールスナップショットを保存できる。

### PublicCasePartItem

公開事例に表示する部品明細を保持する。

Caseには必ず紐づけるが、対応するWorkItemへの紐づけは任意とする。FMP中間データで確認された `part_without_publishable_work` を取り込めるように、部品だけ存在する状態を許容する。

### PublicCaseImage

将来の写真追加用モデル。

写真なしでもPublicCaseが成立するように、画像は独立した任意の子テーブルとして追加した。

### PublicCaseWarning

公開候補生成時やレビュー時の警告を構造化して保持する。

Case本体にも `warnings` JSONを持てるが、検索・分類・対応状況確認が必要な警告はこのモデルへ展開できる。

## PartItem.relatedWorkItemId を nullable にした理由

Task 064で `part_without_publishable_work` が466件確認されている。

これは「部品欄はあるが、同slotに公開候補WorkItemがない」ケースであり、WorkItemへの必須紐づけにするとFMP過去データの公開候補を自然に保持できない。

そのため `PublicCasePartItem.relatedWorkItemId` は nullable とし、部品明細は `PublicCase` へ直接紐づけた上で、対応WorkItemが判断できる場合だけ任意で紐づける設計にした。

## FMP / WEB_APP の扱い

- FMP由来: `sourceType = FMP`、`sourceRepairId` を保持し、`repairId` は原則 `null`
- WEBアプリ由来: `sourceType = WEB_APP`、将来的に `repairId` で `Repair` と任意に紐づけ可能

FMP過去案件は通常Repairへ直接流し込まず、PublicCase専用のスナップショットとして保存する。

## 既存Repairへの影響

既存 `Repair` には `publicCases PublicCase[]` のリレーションのみを追加した。

既存フィールド、既存enum、既存マスタ、既存UIに破壊的変更は加えていない。

## まだ実装していないこと

- migration作成
- seed作成
- DB投入
- FMP中間JSONの取り込み処理
- API
- UI
- 公開ページ
- RepairEntryForm連動
- PricingRule連動

## 確認結果

- `npx prisma format`: 実行済み。ただし既存schema全体へ整形差分が出たため、最終差分には反映しない。
- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

## 次タスク案

- Task 067: FMP中間JSONをPublicCaseへ投入する読み取り/投入設計
- Task 068: 公開候補一覧UI設計
- Task 069: PublicCase公開ページ設計
