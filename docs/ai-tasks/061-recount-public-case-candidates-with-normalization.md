# AI Task 061: 原文正規化後の公開事例候補数再集計

## 目的

AI Task 060で特定した制御文字による突合差分を踏まえ、読み取り専用スクリプトに原文正規化を追加し、公開事例候補数を再集計する。

今回はCSV / Excel本体、DB、既存マスタ、既存UIは変更しない。

## 正規化ルール

突合用キーにのみ、以下の正規化を適用する。

```ts
function normalizeRepairWorkNameForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .trim();
}
```

対象:

- `null` / `undefined` は空文字として扱う
- 前後空白を `trim`
- 制御文字を除去
- 改行、タブ、垂直タブなどの制御文字も除去

注意:

- CSV / Excel本体は変更しない
- 元原文は確認用に保持し、正規化は突合用キーだけに使う
- 未レビュー221種類を正規化によって掲載候補へ戻さない
- `交換` は引き続き `交換技術料` 扱いとし、部品名付き作業名へ自動分解しない

## 正規化前の件数

`scripts/investigate-public-case-counts.ts` の正規化前集計。

| 項目 | 件数 |
| --- | ---: |
| 内装掲載候補明細数 | 2621 |
| 外装掲載候補明細数 | 710 |
| 内外装どちらか候補ありの修理ID数 | 2921 |
| 内装のみ候補あり | 2243 |
| 外装のみ候補あり | 477 |
| 内装・外装の両方候補あり | 201 |

## 正規化後の件数

`scripts/investigate-public-case-counts.ts` の正規化後集計。

| 項目 | 件数 |
| --- | ---: |
| 内装掲載候補明細数 | 2624 |
| 外装掲載候補明細数 | 711 |
| 内外装どちらか候補ありの修理ID数 | 2924 |
| 内装のみ候補あり | 2245 |
| 外装のみ候補あり | 477 |
| 内装・外装の両方候補あり | 202 |

## 内装掲載候補明細数

正規化後、内装掲載候補明細数は `2624` 件になった。

正規化で追加一致した内装3件:

| 修理ID | CSV側の値 | Excelルール側の値 | 原因 |
| --- | --- | --- | --- |
| 13259 | `電池交換\x0B` | `電池交換` | CSV側末尾の制御文字 |
| 15152 | `電池交換\x0B` | `電池交換` | CSV側末尾の制御文字 |
| 13459 | `半OH\x0B` | `半OH` | CSV側末尾の制御文字 |

## 外装掲載候補明細数

正規化後、外装掲載候補明細数は `710` 件から `711` 件になった。

正規化で追加一致した外装1件:

| 修理ID | CSV側の値 | Excelルール側の値 | 原因 |
| --- | --- | --- | --- |
| 14841 | `インデックス取付\x0B\x0B` | `インデックス取付` | CSV側末尾の制御文字 |

## 内外装どちらか候補ありの修理ID数

正規化後の修理ID単位の公開候補数は以下。

| 区分 | 修理ID数 |
| --- | ---: |
| 内外装どちらか候補あり | 2924 |
| 内装のみ候補あり | 2245 |
| 外装のみ候補あり | 477 |
| 内装・外装の両方候補あり | 202 |

## CSV / Excel本体を変更していないこと

今回の変更は読み取り専用集計スクリプトと調査レポートのみ。

- `docs/data/fmp/source/fmp-repair-export-original.csv` は変更していない
- `docs/data/fmp/internal-repair/内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx` は変更していない
- `docs/data/fmp/external-repair/外装修理_第3次レビュー候補.xlsx` は変更していない
- DB接続、DB更新、migration、seedは行っていない
- 既存マスタ、既存UI、`RepairEntryForm.tsx`、`PricingRule` は変更していない

## 実行確認

```powershell
npx tsx scripts/investigate-public-case-counts.ts
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx tsx scripts/investigate-public-case-counts.ts`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

## 次タスク案

- Task 062: 公開事例用中間データ設計
- Task 063: FMP公開事例候補の読み取り専用プレビュー出力
- Task 064: 公開事例取り込み処理の最小実装
