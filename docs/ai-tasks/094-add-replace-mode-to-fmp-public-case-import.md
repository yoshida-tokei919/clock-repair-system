# AI Task 094: FMP PublicCase import scriptへのreplace mode追加

## 目的

既存ローカルDBに投入済みのFMP由来PublicCaseを、092で再生成したコピー除外・ブランドカナ・searchText対応済みデータへ安全に入れ替えられるよう、FMP専用import scriptに `--replace` modeを追加する。

今回はDB更新は行わず、`--dry-run --replace` で削除予定件数・作成予定件数・replace後の想定件数を確認する。

## 前提

- 092で `public-case-candidates.json` はコピー含有Case除外後の2,914件に再生成済み。
- 093でローカルDBのPublicCaseに `brandNameKana` / `brandDisplayName` / `searchText` カラムは反映済み。
- 既存ローカルDBには旧FMP由来PublicCaseが2,924件投入済み。
- `.env` はSupabase remote、`.env.local` はlocalhost DBを向いているため、DB読み込み時もlocalhost値を明示する。
- 今回は `--execute` / `--execute --replace` は実行しない。

## FMP過去案件と新アプリ通常案件の切り分け

今回追加したreplace modeはFMP過去案件専用のimport scriptにだけ適用する。

- FMP過去案件: FMP専用生成ロジック、ブランドカナapproved mapping、コピー除外、読み仮名削除などを経由してPublicCaseへ投入する。
- 新アプリ通常Repair案件: 将来、Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseを生成する。
- PublicCase化後: FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

## 追加したCLIオプション

既存:

```powershell
npx tsx scripts/import-fmp-public-cases.ts --dry-run
npx tsx scripts/import-fmp-public-cases.ts --execute
```

追加:

```powershell
npx tsx scripts/import-fmp-public-cases.ts --dry-run --replace
npx tsx scripts/import-fmp-public-cases.ts --execute --replace
```

今回実行したのは `--dry-run --replace` のみ。

## replace mode の仕様

`--replace` 指定時は、既存のFMP由来PublicCaseを全て入れ替える想定にする。

- 対象は `sourceType = FMP` のPublicCase。
- dry-runでは削除予定件数として表示するだけでDB更新しない。
- execute replaceでは、既存FMP由来PublicCaseと関連子テーブルを削除してから、現在の `public-case-candidates.json` を全件投入する。
- 通常executeでは従来通り `sourceType = FMP` + `sourceRepairId` が既存ならskipする。
- replaceでは先にFMP由来データを削除するため、skipではなく全件再投入予定にする。

## dry-run replace の結果

localhost DBを明示して以下を実行した。

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:DIRECT_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:SHADOW_DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public'
npx tsx scripts/import-fmp-public-cases.ts --dry-run --replace
```

結果:

- mode: `dry-run replace`
- inputCaseCount: 2,914
- publishCandidateCaseCount: 2,914
- publicCasePayloadCount: 2,914
- workItemPayloadCount: 3,705
- partItemPayloadCount: 1,468
- warningPayloadCount: 1,349
- criticalWarningCount: 0
- importBlocked: false
- errors: 0

## 削除予定件数

- plannedDeleteCaseCount: 2,924
- plannedDeleteWorkItemCount: 3,716
- plannedDeletePartItemCount: 1,473
- plannedDeleteWarningCount: 1,353
- plannedDeleteImageCount: 0

## 作成予定件数

- plannedCreateCaseCount: 2,914
- plannedCreateWorkItemCount: 3,705
- plannedCreatePartItemCount: 1,468
- plannedCreateWarningCount: 1,349
- plannedCreateImageCount: 0

## expected final 件数

replace後のFMP由来データ想定件数:

- expectedFinalCaseCount: 2,914
- expectedFinalWorkItemCount: 3,705
- expectedFinalPartItemCount: 1,468
- expectedFinalWarningCount: 1,349
- expectedFinalImageCount: 0

## safety guard

script内で以下を確認する。

- `DATABASE_URL` に `localhost` / `127.0.0.1` / `host.docker.internal` のいずれかが含まれない場合は停止する。
- `--execute` は `--dry-run` と同時指定できない。
- critical warningが1件以上ある場合は `importBlocked = true`。
- errorsがある場合は `importBlocked = true`。
- 公開候補内に `コピー` が残っている場合は `importBlocked = true`。

今回、`--execute` と `--execute --replace` は実行していない。

## cascade / 明示削除方針

schema上はPublicCase子テーブルに `onDelete: Cascade` が設定されている。

ただし、replace execute実装ではより明示的に以下の順で削除する方針にした。

1. PublicCaseWarning
2. PublicCaseImage
3. PublicCasePartItem
4. PublicCaseWorkItem
5. PublicCase

これにより、cascade設定に依存しすぎず、削除対象件数を把握しやすい。

## brandNameKana / brandDisplayName / searchText 確認

`--dry-run --replace` で以下を確認した。

- brandNameKanaPresentCount: 2,787
- brandDisplayNamePresentCount: 2,901
- searchTextPresentCount: 2,914

`brandDisplayName` が2,914件ではなく2,901件なのは、公開候補内にブランド名自体が空のCaseが13件あるため。今回のreplace modeでは生成済みデータを手編集せず、そのまま確認結果として扱う。

## コピー除外確認

- publicCandidateCopyKeywordCount: 0

092でコピー含有Caseは公開候補から除外済みであり、今回のdry-run replace対象には残っていない。

## 実行した確認コマンド

```powershell
git status --short
npx tsc --noEmit --pretty false --incremental false
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:DIRECT_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public'
$env:SHADOW_DATABASE_URL='postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public'
npx tsx scripts/import-fmp-public-cases.ts --dry-run --replace
```

`npx tsc --noEmit --pretty false --incremental false` は成功。

## 変更しなかったもの

- DB更新なし
- `--execute` / `--execute --replace` 実行なし
- schema変更なし
- migration作成なし
- seed作成なし
- PublicCase再生成なし
- generated JSON / CSV 本体変更なし
- CSV / Excel元データ変更なし
- 公開ページ・検索実装なし
- RepairEntryForm / PricingRule / 既存マスタ変更なし

## 次タスク案

- Task 095: ローカルDBで `--execute --replace` を実行し、FMP由来PublicCaseを2,914件へ入れ替え
- Task 096: DBプレビューでbrandDisplayName / searchText反映後の表示確認
- Task 097: Supabase反映前のmigration整理方針確認
