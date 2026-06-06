# AI Task 093: PublicCaseブランドカナ・検索フィールドのローカルDB反映

## 目的

Task 091で `prisma/schema.prisma` に追加したPublicCaseのブランドカナ・表示名・検索用フィールドを、ローカルDBへ反映し、カラムとindexが作成されることを確認する。

今回はローカルDBへのschema反映確認のみを行い、FMP import再実行、PublicCase再生成、migration作成、seed作成、公開ページ実装、検索実装は行わない。

## 前提

- 091で `PublicCase.brandNameKana`、`PublicCase.brandDisplayName`、`PublicCase.searchText`、`@@index([brandNameKana])` をschemaに追加済み。
- 092で生成物は新フィールド対応済み。
- 085時点でローカルDBには旧PublicCaseデータ2,924件を投入済み。
- 追加カラムはnullableなので、既存データは更新せずnullのままでよい。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件:

- `brand-kana-approved` を使ってPublicCase候補を再生成する。
- コピー含有Caseは除外する。
- FMP専用クリーニングルールを使う。

新アプリ通常Repair:

- Brand / BrandMaster のカナ名・aliasと構造化データからPublicCaseを生成する。
- FMP専用クリーニングには依存しない。

PublicCase化後:

- 同じB2C/B2B公開ページ、同じカードUIで扱う。
- 閲覧者にはFMP由来か新アプリ由来かを見分けさせない。

## DB接続先確認

確認結果:

- `.env`: Supabase remote を向いている。
- `.env.local`: `localhost:54322/clock_repair_local` と `localhost:54322/clock_repair_shadow` を向いている。

Prisma CLIは通常 `.env` を読むため、DB反映系コマンドでは毎回 `.env.local` のlocalhost値をプロセス環境変数として明示した。

`db push` 実行時のPrisma出力でも、接続先が以下であることを確認した。

- database: `clock_repair_local`
- schema: `public`
- host: `localhost:54322`

Supabase本番DBには反映していない。

## 実行したコマンド

`.env.local` のlocalhost値を明示したうえで、以下を実行した。

```powershell
npx prisma validate
npx prisma db push --skip-generate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

追加カラム確認には、Prisma Clientから `information_schema.columns` と `pg_indexes` を読み取った。

実行していない:

```powershell
npx prisma migrate dev
npx prisma migrate deploy
npx tsx scripts/import-fmp-public-cases.ts --execute
```

## db push を使った理由

今回はローカルDB検証段階のため、migration作成ではなく `db push --skip-generate` を使った。

理由:

- 084でも既存migration / shadow DB都合で `migrate dev` が失敗している。
- 今回は本番反映ではなく、ローカルDBで新カラムを検証する段階。
- 本番反映前にmigration整理は別タスクで行う。
- 既存PublicCaseデータのreplace再投入前に、nullableカラムが作成できることを優先した。

## 追加カラム確認結果

`information_schema.columns` で以下を確認した。

| column_name | data_type | is_nullable |
| --- | --- | --- |
| brandDisplayName | text | YES |
| brandNameKana | text | YES |
| searchText | text | YES |

`pg_indexes` で以下を確認した。

```text
PublicCase_brandNameKana_idx
CREATE INDEX "PublicCase_brandNameKana_idx" ON public."PublicCase" USING btree ("brandNameKana")
```

## 既存データの扱い

既存PublicCaseデータは更新していない。

読み取り確認結果:

- `PublicCase` 件数: 2,924
- `brandNameKana` / `brandDisplayName` / `searchText` のいずれかが非nullの既存行: 0

FMPデータのreplace再投入は次タスク以降で行う。

## Prisma validate結果

成功。

```text
The schema at ... prisma/schema.prisma is valid
```

## Prisma Client generate結果

成功。

```text
Generated Prisma Client (v5.7.0)
```

## tsc結果

成功。

```powershell
npx tsc --noEmit --pretty false --incremental false
```

## 変更しなかったもの

- Supabase本番DBには接続・反映していない。
- migrationは作成していない。
- seedは作成していない。
- FMP import再実行はしていない。
- `scripts/import-fmp-public-cases.ts --execute` は実行していない。
- PublicCase再生成はしていない。
- generated JSON / CSV 本体は変更していない。
- CSV / Excel 元データ本体は変更していない。
- 公開ページ実装、検索実装はしていない。
- `RepairEntryForm.tsx`、`PricingRule`、既存マスタデータは変更していない。

## 次タスク案

- Task 094: FMP PublicCase import --replace設計
- Task 095: FMP PublicCase replace dry-run
- Task 096: ローカルDBへブランドカナ反映済みPublicCaseをreplace再投入
