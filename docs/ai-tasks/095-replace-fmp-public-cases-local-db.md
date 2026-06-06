# AI Task 095: FMP PublicCaseのローカルDB replace投入

## 目的

092で再生成したブランドカナ・searchText・コピー除外反映済みのFMP PublicCase候補を、ローカルDB上の既存FMP由来PublicCaseとreplace投入する。

今回はローカルDBのみを対象とし、Supabase本番DBには接続・投入しない。

## 前提

- 094で `scripts/import-fmp-public-cases.ts` に `--replace` modeを追加済み。
- 093でローカルDBに `brandNameKana` / `brandDisplayName` / `searchText` カラムを反映済み。
- 092で `public-case-candidates.json` はコピー含有Case除外後の2,914件に再生成済み。
- `.env` はSupabase remote、`.env.local` はlocalhost DBを向いている。
- Prisma/tsx実行時は `.env.local` のlocalhost値をプロセス環境変数へ明示する。

## FMP過去案件と新アプリ通常案件の切り分け

今回のreplace投入はFMP過去案件専用。

- FMP過去案件: brand-kana-approved、コピー除外、FMP専用クリーニングを経由してPublicCaseへreplace投入する。
- 新アプリ通常Repair案件: 将来、Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseを生成する。
- PublicCase化後: FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

## DB接続先確認

確認結果:

- `.env`: Supabase remote
- `.env.local`: `localhost:54322/clock_repair_local`

実行時は以下を明示した。

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:DIRECT_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:SHADOW_DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public'
```

Supabase本番DBには接続・投入していない。

## 実行前dry-run結果

実行コマンド:

```powershell
npx tsx scripts/import-fmp-public-cases.ts --dry-run --replace
```

結果:

- existingFmpCaseCount: 2,924
- existingFmpWorkItemCount: 3,716
- existingFmpPartItemCount: 1,473
- existingFmpWarningCount: 1,353
- existingFmpImageCount: 0
- plannedCreateCaseCount: 2,914
- plannedCreateWorkItemCount: 3,705
- plannedCreatePartItemCount: 1,468
- plannedCreateWarningCount: 1,349
- plannedCreateImageCount: 0
- expectedFinalCaseCount: 2,914
- expectedFinalWorkItemCount: 3,705
- expectedFinalPartItemCount: 1,468
- expectedFinalWarningCount: 1,349
- expectedFinalImageCount: 0
- criticalWarningCount: 0
- importBlocked: false
- errors: 0
- publicCandidateCopyKeywordCount: 0
- showPriceB2cTrueCount: 0
- brandNameKanaPresentCount: 2,787
- brandDisplayNamePresentCount: 2,901
- searchTextPresentCount: 2,914

dry-run結果が期待値どおりだったため、localhost DBに対してexecute replaceへ進んだ。

## execute replace結果

実行コマンド:

```powershell
npx tsx scripts/import-fmp-public-cases.ts --execute --replace
```

結果:

- createdCaseCount: 2,914
- createdWorkItemCount: 3,705
- createdPartItemCount: 1,468
- createdWarningCount: 1,349
- createdImageCount: 0
- criticalWarningCount: 0
- importBlocked: false
- errors: 0

## DB件数確認

replace後のローカルDB件数:

- PublicCase: 2,914
- PublicCaseWorkItem: 3,705
- PublicCasePartItem: 1,468
- PublicCaseWarning: 1,349
- PublicCaseImage: 0
- FMP sourceRepairId 重複: 0

## brandNameKana / brandDisplayName / searchText 確認

- PublicCase.brandNameKana 非null件数: 2,787
- PublicCase.brandDisplayName 非null件数: 2,901
- PublicCase.searchText 非null件数: 2,914

`brandDisplayName` が2,901件なのは、公開候補内にブランド名自体が空のCaseが13件あるため。`brandDisplayName` はnullableであり、表示側ではモデル名・Ref・作業名へfallbackする前提。

## コピー除外確認

- PublicCase / searchText / 表示対象に `コピー` を含む公開候補: 0

## B2C価格非表示確認

- PublicCase.showPriceB2c = true: 0
- PublicCaseWorkItem.showPriceB2c = true: 0
- PublicCasePartItem.showPriceB2c = true: 0

## B2B価格安全確認

- 未紐づけPartItemの showPriceB2b = true: 0

未紐づけ部品の価格はB2Bにも表示しない状態を維持している。

## DBプレビュー確認

`http://localhost:3000/dev/public-case-db-preview` へHTTP確認を試したが、localhost:3000のdev serverに接続できなかった。

`.next-dev.err.log` に触れない方針のため、今回のタスクではdev server起動は行っていない。DBプレビュー画面での表示確認は次タスクで実施する。

## 変更しなかったもの

- Supabase本番DB接続・投入なし
- schema変更なし
- migration作成なし
- seed作成なし
- PublicCase再生成なし
- generated JSON / CSV 本体変更なし
- CSV / Excel元データ変更なし
- 公開ページ実装なし
- 検索実装なし
- RepairEntryForm / PricingRule / 既存マスタ変更なし

## 次タスク案

- Task 096: DBプレビュー画面でreplace後のbrandDisplayName / searchText / コピー除外表示確認
- Task 097: PublicCase本番反映前のmigration整理方針確認
- Task 098: 公開ページ検索UI設計
