# AI Task 071: FMP生成物とGit管理方針

## 目的

FMP由来データ、生成JSON/CSV、dry-run出力について、Git管理すべきものとGit管理しないものを整理する。

必要最小限の `.gitignore` 更新を行い、FMP元データや全件生成物が誤ってGit管理対象にならないようにする。

## 前提

- DB接続、DB更新、migration、seed、API、UI実装は行わない。
- `prisma/schema.prisma` は変更しない。
- CSV / Excel / JSON本体の内容は変更しない。
- FMP元データと全件生成物は、実データや業務詳細を多く含むためGit管理しない方針。
- sample JSONとsummaryは小さく、レビュー証跡としてGit管理候補にする。

## 調査したファイル

- `.gitignore`
- `docs/ai-tasks/070-review-fmp-public-case-dry-run-payload.md`
- `docs/ai-tasks/069-dry-run-import-fmp-public-cases.md`
- `docs/data/fmp/`

確認コマンド:

```powershell
git status --short
rg --files docs/data/fmp
rg --files docs/data/fmp/generated
Get-ChildItem docs/data/fmp -Recurse -File | Select-Object FullName,Length
git status --short -uall docs/data/fmp
```

## docs/data/fmp 配下の分類

| ファイル | サイズ | 分類 | 方針 |
| --- | ---: | --- | --- |
| `docs/data/fmp/source/fmp-repair-export-original.csv` | 647,100 | FMP元CSV | Git管理しない |
| `docs/data/fmp/internal-repair/内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx` | 102,718 | FMPレビューExcel | Git管理しない |
| `docs/data/fmp/external-repair/外装修理_第3次レビュー候補.xlsx` | 86,511 | FMPレビューExcel | Git管理しない |
| `docs/data/fmp/generated/public-case-candidates.json` | 3,732,713 | 全件生成JSON | Git管理しない |
| `docs/data/fmp/generated/public-case-candidates.csv` | 210,921 | 全件生成CSV | Git管理しない |
| `docs/data/fmp/generated/public-case-candidates.sample.json` | 27,993 | sample JSON | Git管理候補 |
| `docs/data/fmp/generated/import-dry-run/import-summary.json` | 2,507 | dry-run summary | Git管理候補 |
| `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json` | 23,576 | sample JSON | Git管理候補 |
| `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json` | 13,185 | sample JSON | Git管理候補 |
| `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json` | 10,119 | sample JSON | Git管理候補 |
| `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json` | 6,303 | sample JSON | Git管理候補 |

## Git管理する候補

- `docs/ai-tasks/*.md`
- `scripts/*.ts`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/*.sample.json`

理由:

- 設計・調査・dry-run結果のレビュー証跡になる。
- sample / summaryは小さく、全件データではない。
- 次タスクのレビューで参照しやすい。

ただし、sample JSONにも実修理ID、ブランド、作業名、部品名、価格が含まれる。公開リポジトリや外部共有リポジトリでは、sampleもGit管理しない判断が安全。

## Git管理しない候補

- `docs/data/fmp/source/`
- `docs/data/fmp/internal-repair/`
- `docs/data/fmp/external-repair/`
- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.csv`
- `docs/data/fmp/generated/import-dry-run/` 配下の全件payload JSON

理由:

- FMP元データは業務データそのもの。
- Excelレビュー資料もFMP由来の実データを含む。
- 全件生成JSON/CSVは修理ID、作業名、部品名、価格などを大量に含む。
- 再生成可能な派生データであり、Git差分が大きくなりやすい。

## .gitignore方針

`docs/data/fmp/` 全体を無条件ignoreにはしない。

理由:

- sample JSONやsummaryをレビュー証跡として残せるようにするため。
- 将来、匿名化済みの小さなfixtureやREADMEを置ける余地を残すため。

今回の方針:

- FMP元データのディレクトリをignoreする。
- generated配下の全件JSON/CSVをignoreする。
- import dry-run配下は原則JSONをignoreし、`import-summary.json` と `*.sample.json` だけ除外解除する。

## .gitignore変更内容

`.gitignore` に以下を最小追記した。

```gitignore
# FMP source files and full generated data
/docs/data/fmp/source/
/docs/data/fmp/internal-repair/
/docs/data/fmp/external-repair/
/docs/data/fmp/generated/public-case-candidates.json
/docs/data/fmp/generated/public-case-candidates.csv
/docs/data/fmp/generated/import-dry-run/*.json
!/docs/data/fmp/generated/import-dry-run/import-summary.json
!/docs/data/fmp/generated/import-dry-run/*.sample.json
```

変更後、`git status --short -uall docs/data/fmp` でGit管理候補として見えるものは以下のみ。

```txt
?? docs/data/fmp/generated/import-dry-run/import-summary.json
?? docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json
?? docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json
?? docs/data/fmp/generated/import-dry-run/warning-payload.sample.json
?? docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json
?? docs/data/fmp/generated/public-case-candidates.sample.json
```

## 注意点

- sample JSONにも実データ断片は含まれる。
- sampleには修理ID、ブランド、モデル、Ref、作業名、部品名、価格が含まれる場合がある。
- 個人情報・顧客情報は生成対象に含めない方針だが、sampleを外部公開する場合は再確認が必要。
- 全件生成物は再生成可能なため、Git管理しない。
- 今回は `.gitignore` 更新のみで、既存CSV / Excel / JSON本体の内容は変更していない。
- `.gitignore` により今後の全件import payload JSONも原則ignoreされる。

## 次タスク案

- Task 072: B2B表示金額とPublicCase.totalAmountの扱い整理
- Task 073: 外装表示名クリーニング対象の抽出
- Task 074: FMP PublicCase import script実装
