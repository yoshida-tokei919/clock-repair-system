# AI Task 092: FMP PublicCase生成へのブランドカナ・コピー除外反映

## 目的

FMP過去案件のPublicCase候補生成ロジックへ、確認済みブランドカナマッピング、ブランド表示名、検索用 `searchText`、コピー表記除外を反映する。

今回は生成物の再生成とdry-run payload確認までを行い、DB投入、migration、schema変更、PublicCase import再実行、公開ページ実装、検索実装は行わない。

## 前提

- Task 089で `brand-kana-approved.csv/json` を作成済み。
- Task 091で `PublicCase.brandNameKana`、`brandDisplayName`、`searchText` のschema受け皿を追加済み。
- `brand-kana-approved` は手編集せず、読み取り専用で使う。
- カナなしブランドは `brandNameKana = null` とし、`brandDisplayName` は英字ブランド名のみ。
- `未確認（BRAND）` のような表示名は作らない。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件:

- `brand-kana-approved` を使ってPublicCase候補を再生成する。
- コピー含有Caseは除外する。
- FMP専用クリーニング、読み仮名suffix削除、`○○` 補正を使う。

新アプリ通常Repair:

- Brand / BrandMaster のカナ名・aliasと構造化データからPublicCaseを生成する。
- FMP専用クリーニングには依存しない。

PublicCase化後:

- FMP由来でもWEB_APP由来でも同じB2C/B2B公開ページ、同じカードUIで扱う。
- 閲覧者にはFMP由来か新アプリ由来かを見分けさせない。

## brand-kana-approved の読み込み

`scripts/generate-fmp-public-case-candidates.ts` で以下を読み込むようにした。

- `docs/data/fmp/generated/brand-kana-approved.json`

読み込み後、`sourceBrandName` をキーに `Map<string, BrandKanaApproved>` を作り、FMP元ブランド名と完全一致で照合する。

使い方:

- `sourceBrandName`: FMP元ブランド名との照合キー
- `approvedBrandName`: `brandName`
- `approvedBrandNameKana`: `brandNameKana`
- `approvedDisplayName`: `brandDisplayName`

## brandNameKana / brandDisplayName 付与ルール

マッピングあり:

- `brandName = approvedBrandName`
- `brandNameKana = approvedBrandNameKana`。空欄の場合は `null`
- `brandDisplayName = approvedDisplayName`

マッピングなし:

- `brandName = FMP元ブランド名`
- `brandNameKana = null`
- `brandDisplayName = FMP元ブランド名`

例:

- OMEGA -> `brandNameKana = オメガ`, `brandDisplayName = オメガ（OMEGA）`
- ROLEX -> `brandNameKana = ロレックス`, `brandDisplayName = ロレックス（ROLEX）`
- SEIKO -> `brandNameKana = セイコー`, `brandDisplayName = セイコー（SEIKO）`
- DOLCE GEAR -> `brandNameKana = null`, `brandDisplayName = DOLCE GEAR`

## searchText 生成ルール

PublicCase候補に `searchText` を追加した。

入れるもの:

- `sourceBrandName`
- `sourceBrandName` の小文字・大文字
- `approvedBrandName`
- `approvedBrandName` の小文字・大文字
- `approvedBrandNameKana`
- `brandDisplayName`
- モデル名
- Ref
- Cal
- 公開対象WorkItemの `normalizedWorkName`
- B2B表示名
- B2C表示名
- 交換部品名

入れないもの:

- 顧客情報
- 取引先情報
- 内部メモ
- 原価
- 利益
- warning詳細
- `sourceRepairId`
- 非公開コメント
- コピーを含む除外対象

検証結果:

- public候補内で `searchText` に `sourceRepairId` を含む件数: 0
- public候補内で `コピー` を含む件数: 0

## コピー除外ルール

以下に `コピー` を含むCaseは公開候補から除外する。

- sourceBrandName
- brandName
- brandNameKana
- brandDisplayName
- modelName
- Ref
- Cal
- WorkItem sourceText
- WorkItem B2B/B2C表示名
- PartItem sourceText
- PartItem displayName

除外されたCaseには、候補生成内部で以下を付ける。

- `excludeReasons`: `contains_copy_keyword`
- `warnings`: `contains_copy_keyword`
- `searchText`: 生成しない
- `isPublishCandidate`: false
- `b2bCandidate`: false
- `b2cCandidate`: false

公開候補JSONには含めず、監査用に以下へ出力した。

- `docs/data/fmp/generated/public-case-excluded-copy-keyword.json`

## 再生成したファイル

- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`
- `docs/data/fmp/generated/public-case-display-name-cleanup-audit.json`
- `docs/data/fmp/generated/public-case-excluded-copy-keyword.json`
- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`

## 件数確認

再生成前:

- 公開候補Case件数: 2,924
- 内装候補明細: 2,624
- 外装候補明細: 711

再生成後:

- 公開候補Case件数: 2,914
- 内装候補明細: 2,616
- 外装候補明細: 709
- WorkItem payload件数: 3,705
- PartItem payload件数: 1,468
- Warning payload件数: 1,349
- critical warning件数: 0
- importBlocked: false
- errors: 0

公開候補Caseは10件減少した。コピー含有Caseは全体で21件検出され、そのうち元々公開候補だった10件が公開候補から除外された。

## コピー除外件数

- コピー含有Case検出件数: 21
- 公開候補から減少した件数: 10

監査ファイル:

- `docs/data/fmp/generated/public-case-excluded-copy-keyword.json`

例:

- `ROLEX(コピー）`
- `(コピー）`
- `PATEK  PHILIPPE（コピー）`
- `スピードマスター（コピー）`

## brand表示確認

確認結果:

OMEGA:

- `brandName = OMEGA`
- `brandNameKana = オメガ`
- `brandDisplayName = オメガ（OMEGA）`

ROLEX:

- `brandName = ROLEX`
- `brandNameKana = ロレックス`
- `brandDisplayName = ロレックス（ROLEX）`

SEIKO:

- `brandName = SEIKO`
- `brandNameKana = セイコー`
- `brandDisplayName = セイコー（SEIKO）`

カナなし例:

- `sourceBrandName = DOLCE GEAR`
- `brandName = DOLCE GEAR`
- `brandNameKana = null`
- `brandDisplayName = DOLCE GEAR`

## searchText確認

OMEGA例:

```text
OMEGA omega オメガ オメガ（OMEGA） シーマスター 196.1114 1538 オーバーホール
```

ROLEX例:

```text
ROLEX rolex ロレックス ロレックス（ROLEX） サブマリーナ 16610 3135 動作修理 ベゼルバネ ベゼルクリックバネ
```

SEIKO例:

```text
SEIKO seiko セイコー セイコー（SEIKO） 1400-5050 オーバーホール 回路
```

確認:

- `sourceRepairId` は `searchText` に含まれていない。
- warning詳細は `searchText` に含めていない。
- public候補内に `コピー` を含むCaseは残っていない。

## dry-run payload反映

`scripts/dry-run-import-fmp-public-cases.ts` へ以下を反映した。

- `brandNameKana`
- `brandDisplayName`
- `searchText`

dry-run sample payloadでも上記フィールドが出力されることを確認した。

dry-run結果:

- `publicCasePayloadCount`: 2,914
- `criticalWarningCount`: 0
- `importBlocked`: false
- `errors`: []
- `showPriceB2cTrueCount`: 0

## 変更しなかったもの

- DB投入はしていない。
- `scripts/import-fmp-public-cases.ts --execute` は実行していない。
- DB schemaは変更していない。
- migrationは作成していない。
- seedは作成していない。
- Supabase本番DBには接続していない。
- CSV / Excel元データ本体は変更していない。
- `brand-kana-approved.csv/json` は手編集していない。
- 公開ページ実装、検索実装はしていない。
- 新アプリ通常Repair、`RepairEntryForm.tsx`、`PricingRule`、既存マスタは変更していない。

## 次タスク案

- Task 093: FMP PublicCase生成結果レビュー
- Task 094: import --replace設計
- Task 095: ローカルDBへのPublicCase replace再投入
