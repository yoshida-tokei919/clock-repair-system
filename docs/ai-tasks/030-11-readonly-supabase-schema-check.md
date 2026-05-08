# AI Task 030.11: Supabase読み取り専用schema確認

## 目的

Supabaseの実DB状態を、読み取り専用SQLだけで確認する。

今回は現状確認のみで、DB変更・migration・seed・db push は行わない。

## 実施方法

`.env` の接続設定をPowerShellプロセス内で読み込み、Prisma Clientの `$queryRawUnsafe` で読み取り専用 `SELECT` のみ実行した。

実行した確認は以下。

- `SELECT current_database(), current_user`
- `_prisma_migrations` テーブル有無
- `_prisma_migrations` 内容確認。ただしテーブルが存在しない場合は未実行
- `public` schema のテーブル一覧
- `Repair` カラム一覧
- `PartsMaster` カラム一覧
- 標準マスター3テーブル有無
- 標準マスター3テーブル件数。ただしテーブルが存在しない場合は未実行
- 主要テーブル件数。ただしテーブルが存在しない場合は未実行

実行していないこと:

- `ALTER`
- `DROP`
- `DELETE`
- `UPDATE`
- `INSERT`
- `CREATE`
- `TRUNCATE`
- `prisma migrate dev`
- `prisma migrate deploy`
- `prisma db push`
- seed script

## 接続先DB確認結果

```text
current_database: postgres
current_user: postgres
```

接続先のホスト名やURLは記録していない。

## _prisma_migrations確認結果

確認SQL:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = '_prisma_migrations';
```

結果:

```text
0 rows
```

確認結果:

- `_prisma_migrations` は `public` schema に存在しない。
- migration記録は確認できなかった。
- `20260427_add_repair_movement_fields` が適用済み扱いかは、この接続先DB上では確認不能。
- `20260508_add_part_standard_masters` が適用済み扱いかも、この接続先DB上では確認不能。

## public table一覧要約

確認SQL:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

結果:

```text
0 rows
```

確認結果:

- `public` schema にテーブルは存在しない。
- `Repair` は存在しない。
- `PartsMaster` は存在しない。
- `Brand` は存在しない。
- `Caliber` は存在しない。
- `PartCategoryMaster` は存在しない。
- `PartNameMaster` は存在しない。
- `PartGradeMaster` は存在しない。

## Repairカラム確認結果

確認SQL:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Repair'
ORDER BY ordinal_position;
```

結果:

```text
0 rows
```

確認結果:

- `Repair` テーブル自体が存在しない。
- `movementMakerId` は確認できない。
- `movementCaliberId` は確認できない。
- `baseMovementMakerId` は確認できない。
- `baseMovementCaliberId` は確認できない。

## PartsMasterカラム確認結果

確認SQL:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'PartsMaster'
ORDER BY ordinal_position;
```

結果:

```text
0 rows
```

確認結果:

- `PartsMaster` テーブル自体が存在しない。
- `standardPartNameId` は確認できない。
- `gradeId` は確認できない。
- 既存 `grade` は確認できない。
- 既存 `partType` は確認できない。
- 既存 `category` は確認できない。
- 既存 `subcategory` は確認できない。
- 既存 `nameJp` は確認できない。
- 既存 `nameEn` は確認できない。

## 標準マスター3テーブル確認結果

確認SQL:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PartCategoryMaster', 'PartNameMaster', 'PartGradeMaster')
ORDER BY table_name;
```

結果:

```text
0 rows
```

確認結果:

- `PartCategoryMaster` は存在しない。
- `PartNameMaster` は存在しない。
- `PartGradeMaster` は存在しない。

件数確認:

- テーブルが存在しないため実行していない。

## 主要テーブル件数

対象テーブルが存在しないため、件数確認は実行していない。

| table | 件数確認 |
|---|---|
| `Repair` | table not found |
| `PartsMaster` | table not found |
| `Brand` | table not found |
| `Caliber` | table not found |

## 本番/開発DBらしさの所見

今回確認した接続先では、`public` schema にアプリ用テーブルが1つも存在しない。

そのため、この接続先DBは少なくとも現在の時計修理アプリが稼働している本番相当DBには見えない。

考えられる可能性:

- `.env` の接続先が、アプリで実データを持つSupabase DBではない。
- Supabase projectは存在するが、まだPrisma schemaが反映されていない空DBである。
- アプリ本体が別のDB、別project、または別schemaを参照している。
- Supabase側で `public` 以外のschemaを使っている可能性もゼロではないが、Prisma schemaは `public` 前提のため、現設定とは整合しない。

現時点では、このDBを本番DBまたは開発DBと断定しない。

## baseline判断への影響

今回の接続先DBでは `_prisma_migrations` も主要テーブルも存在しないため、Supabase現DBをbaseline扱いにするための材料は得られなかった。

むしろ、以下を先に確認する必要がある。

- `.env` のSupabase接続先が本当にアプリ実DBなのか。
- 現在アプリが実際に利用しているDB接続先はどこか。
- Supabase管理画面上の対象projectが本番/開発どちらか。
- 実データがあるDBの接続情報が別に存在するか。

## 次Task推奨

### Task030.12: 実アプリDB接続先の特定

目的:

- 現在アプリが実際に使っているDB接続先を特定する。

確認候補:

- Vercel / Railway / 実行環境の環境変数
- Supabase project URL
- Supabase dashboard上の table editor
- ローカル `.env` が最新か
- `DATABASE_URL` / `DIRECT_URL` / `SHADOW_DATABASE_URL` が同じprojectを指しているか

### Task030.13: Supabase対象projectのschema再確認

目的:

- 実DB接続先が確定したあと、同じ読み取り専用SQLで再確認する。

### Task030.14: baseline方針決定

目的:

- 実DBの `_prisma_migrations` とschema状態を確認してから、baseline / migrate resolve / migration適用 / seed実行方針を決める。

## 今回変更していないこと

- DBを書き換えていない。
- Supabaseへ変更系SQLを実行していない。
- migrationを実行していない。
- `prisma db push` を実行していない。
- seed scriptを実行していない。
- `.env` は変更していない。
- `prisma/schema.prisma` は変更していない。
- migrationファイルは変更していない。
- TypeScript / React / API / UI は変更していない。
- `package.json` は変更していない。
- stashは触っていない。
- Task025 / Task026 には触っていない。
