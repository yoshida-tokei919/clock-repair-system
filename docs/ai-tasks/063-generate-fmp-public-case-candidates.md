# AI Task 063: FMP公開事例候補中間データ生成

## 目的

FMP過去データから、PublicCase系テーブルへ取り込む前段階の公開事例候補中間データを生成する。

今回はDB投入用ではなく、出力形と件数を確認するための読み取り専用生成。DB接続、DB更新、schema変更、migration、seed、既存マスタ変更、CSV / Excel本体変更、通常Repairへの投入は行わない。

## 参照ファイル

- `docs/ai-tasks/059-investigate-public-case-candidate-counts.md`
- `docs/ai-tasks/060-investigate-internal-public-case-count-diff.md`
- `docs/ai-tasks/061-recount-public-case-candidates-with-normalization.md`
- `docs/ai-tasks/062-design-fmp-public-case-intermediate-data.md`
- `scripts/investigate-public-case-counts.ts`
- `docs/data/fmp/source/fmp-repair-export-original.csv`
- `docs/data/fmp/internal-repair/内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx`
- `docs/data/fmp/external-repair/外装修理_第3次レビュー候補.xlsx`

## 作成したスクリプト

- `scripts/generate-fmp-public-case-candidates.ts`

このスクリプトは以下を行う。

- FMP CSVをヘッダーなしとして読み、057の列順を仮ヘッダーにする
- 内装修理Excelの `掲載判定_全件` を読み取る
- 外装修理Excelの `確認済みサマリー` を読み取る
- 061の正規化ルールで突合用キーを作る
- Case / WorkItem / PartItem の中間データを生成する
- 公開候補Caseだけを `docs/data/fmp/generated/` へ出力する

行わないこと:

- DB接続
- DB更新
- Prisma schema変更
- migration作成
- seed作成
- CSV / Excel本体の変更
- 通常Repairへの投入

## 生成した中間データ

- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`

`public-case-candidates.json` は公開候補Case全件。

`public-case-candidates.sample.json` は先頭20件のサンプル。

`public-case-candidates.csv` は一覧確認用のCase単位サマリー。

## 出力構造

### Case単位

主なフィールド:

```ts
{
  sourceType: "FMP",
  sourceRepairId: string,
  receivedDate?: string,
  brandName?: string,
  modelName?: string,
  ref?: string,
  caliber?: string,
  hasPublishableInternalWork: boolean,
  hasPublishableExternalWork: boolean,
  isPublishCandidate: boolean,
  b2bCandidate: boolean,
  b2cCandidate: boolean,
  totalAmount?: number,
  internalWorkItems: WorkItem[],
  externalWorkItems: WorkItem[],
  outsourcedWorkItems: WorkItem[],
  partItems: PartItem[],
  warnings: string[],
  excludeReasons: string[]
}
```

### WorkItem単位

主なフィールド:

```ts
{
  workItemKey: string,
  sourceArea: "internal" | "external" | "outsourced",
  sourceSlot: 1 | 2 | 3,
  sourceText: string,
  normalizedSourceText: string,
  isRuleMatched: boolean,
  isPublishable: boolean,
  normalizedWorkName?: string,
  b2bDisplayName?: string,
  b2cDisplayName?: string,
  laborPrice?: number,
  reviewStatus?: "reviewed" | "unreviewed" | "excluded",
  excludeReason?: string
}
```

### PartItem単位

主なフィールド:

```ts
{
  sourceArea: "internal" | "external",
  sourceSlot: 1 | 2 | 3,
  sourceText: string,
  normalizedSourceText: string,
  displayName?: string,
  price?: number,
  relatedWorkItemKey?: string
}
```

## 正規化ルール

061で確定したルールを使う。

```ts
function normalizeRepairWorkNameForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .trim();
}
```

正規化は突合用キーだけに適用する。CSV / Excel本体は変更しない。

## 件数確認

スクリプト実行結果:

| 項目 | 件数 |
| --- | ---: |
| FMP元Case件数 | 3,886 |
| 生成したCase件数 | 2,924 |
| 公開候補Case件数 | 2,924 |
| 内装候補明細数 | 2,624 |
| 外装候補明細数 | 711 |
| 内装のみ | 2,245 |
| 外装のみ | 477 |
| 内外装両方 | 202 |
| sample JSONの件数 | 20 |
| 警告件数 | 472 |
| 除外WorkItem件数 | 381 |
| Case単位の除外理由件数 | 364 |

061の期待値と一致した。

期待値:

| 項目 | 期待値 | 実績 |
| --- | ---: | ---: |
| 内装候補明細 | 2,624 | 2,624 |
| 外装候補明細 | 711 | 711 |
| 候補あり修理ID | 2,924 | 2,924 |
| 内装のみ | 2,245 | 2,245 |
| 外装のみ | 477 | 477 |
| 内外装両方 | 202 | 202 |

## 警告と除外理由

警告は公開候補生成を止めるものではなく、後続レビューで確認するための情報。

現在の警告コード:

- `source_text_normalized:*`: CSV原文に制御文字などがあり、突合用キーで正規化した
- `part_without_publishable_work:*`: 部品欄はあるが、同じslotに公開候補WorkItemがない

除外WorkItemは、公開候補Case内に含まれるが公開対象ではない作業明細。

主な除外理由:

- `internal_work_unreviewed`
- `internal_work_excluded`
- `internal_rule_unmatched`
- `external_rule_unmatched_or_unreviewed`
- `external_work_not_public`
- `external_work_moved_to_internal`
- `external_display_name_missing`
- `outsourced_work_not_public_candidate`

## 実行確認

```powershell
npx tsx scripts/generate-fmp-public-case-candidates.ts
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx tsx scripts/generate-fmp-public-case-candidates.ts`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

## 注意点

- 生成JSONは公開候補Caseのみを含む。
- FMP元Case全3,886件のうち、候補がないCaseは出力対象外。
- B2B/B2C候補フラグは現時点では公開候補Caseに対して両方true。
- B2C表示名は初期候補であり、最終的な公開タグ・表記は後続タスクで整理する。
- 外装の表示名にはレビューExcel由来の表記が残るため、PublicCase化前に表示名クリーニング方針を確認する。
- 写真は今回の中間データには含めていない。

## 次タスク案

- Task 064: PublicCase系DBモデル設計
- Task 065: 公開候補一覧UI設計
- Task 066: 生成JSONのレビュー用プレビュー設計
