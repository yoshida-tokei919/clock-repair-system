# AI Task 030.10: Supabase / Prisma migration baseline整理の調査

## 目的

Supabaseの既存DBとPrisma migration履歴を今後どう安全に扱うか、baseline整理方針を調査・設計する。

今回は調査docsのみ作成する。SupabaseへのDB操作、migration適用、seed実行、schema変更は行わない。

## 前提

Task030.9で、DockerローカルPostgreSQLに対して以下は成功済み。

- PowerShell一時環境変数でローカルDBへ接続
- `prisma db push`
- `scripts/seed-part-standard-masters.ts`
- 件数確認
  - `PartCategoryMaster`: 16
  - `PartNameMaster`: 223
  - `PartGradeMaster`: 3
- `prisma validate`
- `prisma generate`
- `npx.cmd tsc --noEmit`

つまり、現在の `schema.prisma` と標準マスターseed script自体は整合している。

未解決問題は、Prisma migration履歴が空DBから再現できないこと。

## 調査対象

- `.env`
- `prisma/schema.prisma`
- `prisma/migrations/20260427_add_repair_movement_fields/migration.sql`
- `prisma/migrations/20260508_add_part_standard_masters/migration.sql`
- `package.json`
- `scripts/seed-part-standard-masters.ts`
- `docs/ai-tasks/030-8-5-investigate-prisma-migration-history.md`
- `docs/ai-tasks/030-6-design-local-prisma-db-verification.md`
- `docs/design/critical-master-design-principles.md`

`.env` は値を記録せず、定義キーのみ確認した。

確認できたキー:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 現在のmigration状態まとめ

`prisma/migrations/` に存在するmigrationは以下の2件のみ。

| migration | 内容 | 空DB再現性 |
|---|---|---|
| `20260427_add_repair_movement_fields` | 既存 `"Repair"` に `movementMakerId`, `movementCaliberId`, `baseMovementMakerId`, `baseMovementCaliberId` とFKを追加 | 失敗する |
| `20260508_add_part_standard_masters` | `PartCategoryMaster`, `PartNameMaster`, `PartGradeMaster` 作成、`PartsMaster.standardPartNameId`, `PartsMaster.gradeId` 追加 | 前提テーブル `PartsMaster` が必要 |

確認結果:

- 初期migrationが存在しない。
- `Repair` / `Brand` / `Caliber` / `PartsMaster` などの主要テーブルを作成するmigrationがない。
- 最初のmigrationが `ALTER TABLE "Repair"` から始まる。
- `Repair` model に `@@map` はなく、実テーブル名は `"Repair"` 想定。
- 失敗原因はテーブル名の不一致ではなく、前段の `CREATE TABLE "Repair"` がmigration履歴にないこと。

空DBから再現できない理由:

- Prisma migrateはshadow DBでmigrationを先頭から再生する。
- 最初のmigrationが既存DB前提の差分SQLになっている。
- shadow DBには `"Repair"` がないため、`ALTER TABLE "Repair"` で `P3006 / P1014` になる。

## Supabase側で確認すべき項目

Supabaseへ変更系操作を行う前に、読み取り専用で以下を確認する。

- `_prisma_migrations` テーブルの有無
- `_prisma_migrations` に記録されているmigration名
- `Repair` テーブルの有無
- `Brand` テーブルの有無
- `Caliber` テーブルの有無
- `PartsMaster` テーブルの有無
- `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` の有無
- `Repair` に以下のカラムが存在するか
  - `movementMakerId`
  - `movementCaliberId`
  - `baseMovementMakerId`
  - `baseMovementCaliberId`
- `PartsMaster` に以下のカラムが存在するか
  - `standardPartNameId`
  - `gradeId`
- `PartsMaster` に既存データが入っているか
- 標準マスター3テーブルに既存データが入っているか
- 接続先Supabaseが本番用か、開発用か
- backup / restore手段が用意されているか

## 読み取り専用SQL案

Supabase SQL Editor または psql で実行する場合の読み取り専用SQL案。

テーブル一覧:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Prisma migration履歴テーブルの有無:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = '_prisma_migrations';
```

Prisma migration履歴:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;
```

`Repair` カラム確認:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Repair'
ORDER BY ordinal_position;
```

`PartsMaster` カラム確認:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'PartsMaster'
ORDER BY ordinal_position;
```

標準マスターテーブル有無:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PartCategoryMaster', 'PartNameMaster', 'PartGradeMaster')
ORDER BY table_name;
```

標準マスター件数確認:

```sql
SELECT 'PartCategoryMaster' AS table_name, COUNT(*) AS count FROM "PartCategoryMaster"
UNION ALL
SELECT 'PartNameMaster' AS table_name, COUNT(*) AS count FROM "PartNameMaster"
UNION ALL
SELECT 'PartGradeMaster' AS table_name, COUNT(*) AS count FROM "PartGradeMaster";
```

`PartsMaster` 既存データ件数:

```sql
SELECT COUNT(*) AS count
FROM "PartsMaster";
```

標準マスター参照カラムの有無:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'PartsMaster'
  AND column_name IN ('standardPartNameId', 'gradeId')
ORDER BY column_name;
```

重要:

- `ALTER` / `DROP` / `DELETE` / `UPDATE` / `INSERT` は使わない。
- `prisma migrate dev` をSupabaseへ実行しない。
- `prisma db push` をSupabaseへ実行しない。
- seed scriptをSupabaseへ実行しない。

## 解決案比較

### 案A: Supabase現DBをbaselineとして扱い、以後のmigrationだけ管理する

内容:

- Supabaseに現在あるschemaを既存baselineと見なす。
- 過去の初期migration欠落は無理に再現しない。
- 必要に応じて `prisma migrate resolve` で既存migrationを適用済み扱いにする。
- 今後のmigrationだけ正しく管理する。

メリット:

- 既存Supabaseデータを壊しにくい。
- 現実のDB状態を基準にできる。
- 今後のmigration運用へ移行しやすい。

デメリット:

- 空DBから完全再現できる履歴にはならない可能性が残る。
- baseline時点のschemaを別途ドキュメント化する必要がある。
- `migrate resolve` の対象を誤ると履歴だけが進み、実DBとの差分が残る。

危険性:

- 実DBに存在しない変更を「適用済み」と誤ってresolveすると、後続のschema/APIで壊れる。

必要な確認:

- `_prisma_migrations` の有無と内容
- `Repair` movement系カラムの有無
- 標準マスター3テーブルと `PartsMaster` 追加カラムの有無
- Supabaseが本番か開発か
- backup取得状況

Supabaseへの影響:

- 読み取り調査だけならなし。
- `migrate resolve` はDBテーブル本体ではなくmigration履歴に影響するため、実行前に明確な手順とbackupが必要。

### 案B: 現在の schema.prisma からbaseline migrationを新規作成する

内容:

- 現在schema全体を再現するbaseline migrationを新規作成する。
- ローカル新規DBで空DBから再現可能にする。
- 既存Supabaseではbaselineを適用済み扱いにするか、別管理にするか検討する。

メリット:

- 新規ローカルDB / CIで再現性を確保できる。
- migration履歴の品質を立て直せる。
- 今後のschema変更を安全に検証しやすい。

デメリット:

- 既存の2 migrationとの関係整理が必要。
- Supabaseの実DBと現在schemaが完全一致していない場合、baseline化が危険。
- baseline migrationを既存Supabaseへそのまま適用すると、既存テーブル作成で衝突する。

危険性:

- baselineを実DBへ誤適用すると、テーブル存在衝突やデータ破壊のリスクがある。

既存migrationとの関係:

- 既存2件を保持するか、baseline後の履歴として再構成するかの設計が必要。

Supabaseへの影響:

- baseline migration自体はSupabaseへ直接適用しない方がよい。
- 適用済み扱いにする場合は `migrate resolve` を慎重に使う。

### 案C: 既存migration履歴を修正・再構成する

内容:

- 既存migrationを編集または再作成して、空DBから再現可能にする。

メリット:

- migration履歴をきれいにできる。
- ローカルDBの `migrate dev` が通る状態を作れる。

デメリット:

- すでにcommit済み/共有済みのmigrationを変更するため危険。
- Supabaseの `_prisma_migrations` と衝突しやすい。
- 既存データがあるDBでは影響範囲が大きい。

危険性:

- 履歴改変により、どのDBに何が適用済みか分からなくなる。
- 既存Supabaseに対して最も事故りやすい。

推奨可否:

- 現時点では推奨しない。
- どうしても行う場合は、Supabase clone / dump restore環境で検証してからにする。

### 案D: Supabaseには手動SQLまたは db push で反映する

内容:

- Prisma migration管理を一旦諦め、Supabaseへ直接schema差分を反映する。

メリット:

- 目先の変更を早く反映できる。
- migration履歴の複雑さを避けられる。

デメリット:

- migration履歴と実DBのズレがさらに広がる。
- 後続のDB変更が追跡しづらくなる。
- 手順ミスの検出が難しい。

危険性:

- `db push` をSupabaseへ誤実行すると、意図しない差分反映が起きる可能性がある。
- 手動SQLはrollback設計なしだと危険。

推奨可否:

- 原則推奨しない。
- ただし緊急時に限り、読み取り調査・backup・差分SQLレビュー・rollback手順が揃っている場合のみ検討する。

## 標準マスター変更の安全適用方針

対象変更:

- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`
- `PartsMaster.standardPartNameId`
- `PartsMaster.gradeId`
- seed
  - カテゴリ16件
  - 部品名223件
  - グレード3件

安全な流れ:

1. Supabaseが本番用か開発用か確認する。
2. backup / rollback手順を確認する。
3. 読み取り専用SQLで現schemaを確認する。
4. `_prisma_migrations` の有無と内容を確認する。
5. `Repair` movement系カラムが既に存在するか確認する。
6. 標準マスター3テーブルと `PartsMaster.standardPartNameId` / `gradeId` が既に存在するか確認する。
7. 実DBが `20260427_add_repair_movement_fields` 相当を既に含むなら、そのmigrationをどう扱うか決める。
8. 標準マスター変更が未適用なら、`20260508_add_part_standard_masters` 相当のSQLを適用する方法を設計する。
9. 適用方法を選ぶ前に、ローカルまたはSupabase cloneで同じ手順を再現する。
10. seed scriptは標準マスター3テーブルの存在確認後にだけ実行する。

seed scriptをSupabaseに実行してよい条件:

- 対象DBが本番か開発か明確である。
- backup取得済みである。
- 接続先が意図したSupabase DBである。
- `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` が存在する。
- `PartCategoryMaster.key`, `PartNameMaster.key`, `PartGradeMaster.key` のunique制約が存在する。
- seed scriptがupsertのみで、delete / deleteMany を使わないことを再確認済みである。
- seed投入件数と内容をレビュー済みである。

適用方法の第一候補:

- まずは案Aを軸に、Supabase現DBをbaselineとして扱う。
- そのうえで `20260508_add_part_standard_masters` をどう履歴管理するかを決める。
- 既に標準マスター変更がSupabaseにない場合は、migrationとして適用する方針を優先する。
- ただし、既存 `_prisma_migrations` 状態によっては `migrate resolve` が必要になる。

避けること:

- Supabaseへいきなり `prisma db push`。
- Supabaseへいきなり seed script。
- `_prisma_migrations` を確認せず `migrate resolve`。
- 本番/開発区別が不明なまま変更系SQL。

## package / script上の注意

`package.json` には Prisma seed 設定がある。

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

Task030の標準マスターseedは独立script。

```text
scripts/seed-part-standard-masters.ts
```

そのため、`npx prisma db seed` ではなく、明示的に以下を使う前提。

```powershell
npx.cmd tsx scripts/seed-part-standard-masters.ts
```

Supabaseに対して実行する場合も、必ず実行前に接続先表示を確認する。

## 推奨する次Task

### Task030.11: Supabase読み取り専用schema確認

目的:

- Supabase SQL Editorまたはpsqlで読み取り専用SQLを実行し、現DB状態を確認する。

確認:

- `_prisma_migrations`
- 主要テーブル有無
- `Repair` movement系カラム有無
- `PartsMaster` 標準マスター参照カラム有無
- 標準マスター3テーブル有無
- 対象DBが本番か開発か

### Task030.12: Supabase baseline方針決定

目的:

- Task030.11の読み取り結果をもとに、案A/B/C/Dのどれで進むか決める。

推奨:

- まず案Aを第一候補として検討する。
- 必要に応じてbaseline migration案と `migrate resolve` 方針を設計する。

### Task030.13: 標準マスターmigrationをSupabaseへ安全適用する手順設計

目的:

- `20260508_add_part_standard_masters` 相当の変更をSupabaseへ安全に入れる手順を作る。

含める:

- backup
- 適用前SQL確認
- 適用手順
- 適用後確認
- rollback方針

### Task030.14: Supabase backup / rollback手順整理

目的:

- 本番/開発DBを問わず、DB変更前に戻せる状態を作る。

### Task031: PartsFormでDBマスター候補を読む設計

注意:

- Supabaseのbaseline整理と標準マスター適用方針が固まるまで、PartsForm接続へ進むのは慎重にする。
- UI接続だけ先に進めると、環境ごとのDB状態差で壊れる可能性がある。

## 今回変更していないこと

- Supabaseへ接続していない。
- Supabaseへmigrationを実行していない。
- Supabaseへ `prisma db push` を実行していない。
- Supabaseへseedを実行していない。
- DBを書き換えていない。
- `.env` は変更していない。
- `prisma/schema.prisma` は変更していない。
- migrationファイルは変更していない。
- TypeScript / React / API / UI は変更していない。
- `package.json` は変更していない。
- stashは触っていない。
- Task025 / Task026 には触っていない。
