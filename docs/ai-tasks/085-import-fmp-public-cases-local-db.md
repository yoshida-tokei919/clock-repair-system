# AI Task 085: FMP PublicCaseのローカルDB投入スクリプト実装

## 目的

FMP PublicCase候補データを、ローカルDBのPublicCase系テーブルへ投入する専用import scriptを実装する。

今回はSupabase本番DB投入、FMP以外の通常Repair事例化、API/UI実装は行わない。

## 前提

- `.env` はSupabase remoteを向いている
- `.env.local` は `localhost:54322/clock_repair_local` / `clock_repair_shadow` を向いている
- DB更新系コマンドは `.env.local` のlocalhost値を明示して実行する
- Supabase本番DBへ接続・投入しない
- FMP元CSV / Excelは変更しない
- 生成済みJSONは手編集しない

## FMP過去案件と新アプリ通常案件の切り分け

今回のscriptはFMP過去案件専用。

- FMP過去案件: FMP専用ルールでPublicCaseに変換し、このimport scriptでPublicCase系テーブルへ投入する
- 新アプリ通常Repair案件: 構造化データ・マスタからPublicCaseに変換する
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUIで扱う

新アプリ通常Repairの事例化処理、`RepairEntryForm.tsx`、作業マスタ設計には触れていない。

## DB接続安全確認

script内で `DATABASE_URL` を確認し、以下のいずれかを含まない場合は停止する。

- `localhost`
- `127.0.0.1`
- `host.docker.internal`

remoteっぽいDBでは以下のエラーで停止する。

`Refusing to import: DATABASE_URL does not look like a local database.`

実行時も `.env.local` のlocalhost値をPowerShellで環境変数へ明示した。

## 入力ファイル

入力は以下を使用した。

- `docs/data/fmp/generated/public-case-candidates.json`

理由:

- 全件2,924件を含む中間データである
- dry-run sample JSONはサンプルのみで全件投入に使えない
- 既存dry-run scriptを変更せず、import script側で同等のpayloadを生成できる

## 実装したCLIオプション

- `--dry-run`
  - DBへ書き込まない
  - 入力件数、予定作成件数、重複件数、warning件数、error件数、`importBlocked` を表示
- `--execute`
  - local DB安全チェック後に投入
  - 既存の `sourceType = FMP` + `sourceRepairId` はskip

`--dry-run` と `--execute` はどちらか一方のみ指定可能。

## dry-run結果

初回投入前:

- inputCaseCount: 2,924
- publishCandidateCaseCount: 2,924
- publicCasePayloadCount: 2,924
- workItemPayloadCount: 3,716
- partItemPayloadCount: 1,473
- warningPayloadCount: 1,353
- duplicateCaseCount: 0
- plannedCreateCaseCount: 2,924
- criticalWarningCount: 0
- reviewWarningCount: 488
- infoWarningCount: 865
- importBlocked: false
- errors: 0

投入後の再dry-run:

- duplicateCaseCount: 2,924
- plannedCreateCaseCount: 0

重複skipが動作することを確認した。

## execute結果

local DBに投入した。

- createdCaseCount: 2,924
- createdWorkItemCount: 3,716
- createdPartItemCount: 1,473
- createdWarningCount: 1,353
- criticalWarningCount: 0
- importBlocked: false
- errors: 0

Supabase本番DBへは投入していない。

## 重複防止ルール

FMP由来のPublicCaseは以下で重複判定する。

- `sourceType = FMP`
- `sourceRepairId`

既存がある場合はskipする。

`--replace` は実装していない。

## relatedWorkItem解決

投入時に、各Case内で作成した `PublicCaseWorkItem.id` を `workItemKey` で保持し、PartItemの `relatedWorkItemKey` を実DB IDへ解決する。

解決できない場合:

- `relatedWorkItemId = null`
- `relationStatus = UNLINKED`
- `reviewStatus = NEEDS_REVIEW`
- `showPriceB2b = false`
- `showPriceB2c = false`

DB確認で、未紐づけPartItemの `showPriceB2b = true` は0件だった。

## warning保存

`PublicCaseWarning` へ保存した。

severityは以下へ変換。

- `INFO`
- `REVIEW`
- `CRITICAL`

投入結果:

- warning: 1,353
- criticalWarning: 0

## 価格表示ルール

B2C:

- `showPriceB2c = false`
- 価格を公開しない

B2B:

- `showPriceB2b = true` かつ正の金額がある安全な明細だけ価格表示候補
- 未紐づけPartItemの価格は非表示
- 0円は表示対象にしない

DB確認:

- PublicCaseの `showPriceB2c = true`: 0
- WorkItemの `showPriceB2c = true`: 0
- PartItemの `showPriceB2c = true`: 0
- 未紐づけPartItemの `showPriceB2b = true`: 0

## DB件数確認

local DBで確認した件数:

- PublicCase: 2,924
- PublicCaseWorkItem: 3,716
- PublicCasePartItem: 1,473
- PublicCaseWarning: 1,353
- PublicCaseImage: 0
- duplicate FMP sourceRepairId: 0

## 変更しなかったもの

- Supabase本番DB
- migration
- schema
- seed
- API
- UI
- 既存公開ページ
- CSV / Excel元データ本体
- 生成済みJSON本体の手編集
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/dry-run-import-fmp-public-cases.ts`
- `RepairEntryForm.tsx`
- `PricingRule`
- 既存マスタ

## 次タスク案

- Task 086: ローカルDB投入済みPublicCaseの表示プレビューをDB参照で確認
- Task 087: FMP PublicCase import結果レビュー
- Task 088: PublicCase公開候補一覧UI設計
