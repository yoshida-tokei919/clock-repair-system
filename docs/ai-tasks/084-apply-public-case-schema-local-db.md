# AI Task 084: PublicCase schemaのローカルDB反映

## 目的

PublicCase系モデルをローカルDBへ反映し、Prisma Clientを生成する。

今回はFMPデータ投入、seed、API、UI実装は行わない。

## 前提

- Supabase本番DBへの反映は禁止
- FMPデータ投入は禁止
- CSV / Excel / JSON本体は変更しない
- 既存公開ページやRepair入力画面には触らない
- `scripts/generate-fmp-public-case-candidates.ts` は変更しない
- `scripts/dry-run-import-fmp-public-cases.ts` は変更しない

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP専用ルールでPublicCaseに変換する
- 新アプリ通常Repair案件: 構造化データ・マスタからPublicCaseに変換する
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUIで扱う

今回のタスクはDB schema反映確認のみ。

## DB接続先確認

Prisma schemaは以下を参照している。

- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`

確認結果:

- `.env`
  - `DATABASE_URL`: Supabase remote
  - `DIRECT_URL`: Supabase remote
  - `SHADOW_DATABASE_URL`: Supabase remote
- `.env.local`
  - `DATABASE_URL`: `localhost:54322/clock_repair_local`
  - `DIRECT_URL`: `localhost:54322/clock_repair_local`
  - `SHADOW_DATABASE_URL`: `localhost:54322/clock_repair_shadow`

Prisma CLIは通常 `.env` を読むため、そのまま実行するとSupabase remoteへ向く可能性がある。

今回のDB反映系コマンドは、毎回 `.env.local` のlocalhost値をPowerShellで明示的に環境変数へ設定して実行した。

## 実行したコマンド

- `git status --short`
- `.env` / `.env.local` のDB接続先確認
- `npx prisma validate`
- `npx prisma migrate status`
- `npx prisma migrate dev --name add-public-case-models --skip-seed`
- `npx prisma db push --skip-generate`
- `npx prisma generate`
- `npx prisma db pull --print`
- `npx tsc --noEmit --pretty false --incremental false`

## db push / migrate dev の判断理由

既存の `prisma/migrations` があるため、当初は履歴を残す `migrate dev --name add-public-case-models --skip-seed` を選択した。

ただし、ローカルshadow DBで既存migration `20260427_add_repair_movement_fields` が `Repair` テーブルを前提にして失敗した。

エラー:

- `P3006`
- `P1014`
- `The underlying table for model Repair does not exist.`

既存migrationがローカルshadow DBへクリーン適用できない状態だったため、今回はローカルDBへのschema反映確認を目的として `npx prisma db push --skip-generate` に切り替えた。

Supabase remoteには実行していない。

## Prisma validate結果

`.env.local` のlocalhost接続値を明示して実行し、schemaはvalid。

結果:

- `The schema ... is valid`

## Prisma Client generate結果

最初の `npx prisma generate` は、起動中のローカルNext dev serverがPrisma Clientのengine DLLを掴んでいたため失敗した。

該当するローカルNext dev serverプロセスのみ停止後、再実行して成功した。

結果:

- Prisma Client v5.7.0 generated

## PublicCase系テーブル確認結果

`npx prisma db pull --print` でローカルDBをintrospectionし、以下を確認した。

モデル:

- `PublicCase`
- `PublicCaseWorkItem`
- `PublicCasePartItem`
- `PublicCaseImage`
- `PublicCaseWarning`

enum:

- `PublicCaseSourceType`
- `PublicCasePublishStatus`
- `PublicCaseReviewStatus`
- `PublicCaseWarningSeverity`

## 変更しなかったもの

- Supabase本番DB
- FMPデータ投入
- seed
- API
- UI
- CSV / Excel / JSON本体
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/dry-run-import-fmp-public-cases.ts`
- `RepairEntryForm.tsx`
- `PricingRule`
- 既存マスタ

## 次タスク案

- Task 085: PublicCase local DB schema反映後の差分レビュー
- Task 086: FMP PublicCase import script実装
- Task 087: FMP PublicCase import dry-runからlocal DB投入検証
