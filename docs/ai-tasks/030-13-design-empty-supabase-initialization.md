# AI Task 030.13: 空Supabase初期化方針設計

## 目的

現時点で時計修理業務管理アプリは業務で一切使用していない。

そのため、既存業務データ保護よりも、今後安全に使えるDB構造を整えることを優先する。

Task030.11 / Task030.12 で、現在確認しているSupabase projectは `public` schemaにアプリ用テーブルが存在しない空DBであり、Railway productionの `DATABASE_URL` も同じSupabase projectを指している可能性が高いことが分かった。

今回は、空Supabaseを今後の実アプリDBとして初期化する方針を設計する。

このTaskでは、SupabaseへのDB変更、migration、`db push`、seedは実行していない。

## 読んだファイル

- `docs/ai-tasks/030-11-readonly-supabase-schema-check.md`
- `docs/ai-tasks/030-12-identify-actual-app-database.md`
- `docs/ai-tasks/030-8-5-investigate-prisma-migration-history.md`
- `docs/ai-tasks/030-10-investigate-supabase-prisma-baseline.md`
- `docs/ai-tasks/030-6-design-local-prisma-db-verification.md`
- `docs/design/critical-master-design-principles.md`
- `prisma/schema.prisma`
- `schema.sql`
- `scripts/seed-part-standard-masters.ts`

## 前提整理

確認済み:

- アプリはまだ業務で使用していない。
- 実運用データはない前提でよい。
- Task030.11で確認したSupabase DBは、`public` schemaにテーブルが存在しない。
- `_prisma_migrations` も存在しない。
- `Repair` / `PartsMaster` / `Brand` / `Caliber` も存在しない。
- `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` も存在しない。
- Task030.12で、`.env` の `DATABASE_URL` / `DIRECT_URL` / `SHADOW_DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` は同じSupabase project refを指していることを確認した。
- ローカルDocker PostgreSQLでは、`prisma db push` と標準マスターseedが成功済み。
- Prisma migration履歴は空DBから再現できない。
- 失敗原因は、最初のmigration `20260427_add_repair_movement_fields` が `ALTER TABLE "Repair"` から始まり、`Repair` を作る初期migrationが存在しないため。

追加前提:

- 業務データ保護より、今後安全に使えるDB構造を整えることを優先する。
- ただしDB操作は雑に行わない。
- 対象DB確認、実行前チェック、docs記録を必須にする。

## 空Supabaseを実DBとして初期化してよい条件

以下をすべて満たす場合に限り、現在の空Supabaseを今後の実アプリDBとして初期化してよい。

1. Supabase project ref確認
   - Railway productionの `DATABASE_URL` が、Task030.11 / Task030.12で確認した空Supabase project refを指している。
   - `DIRECT_URL` が同じprojectを指している。
   - `NEXT_PUBLIC_SUPABASE_URL` も同じprojectを指している。
   - project refは秘密情報ではないが、チャットではマスクして扱う。

2. Supabase DB状態確認
   - Supabase Table Editorで `public` schemaにアプリ用テーブルがない。
   - 読み取りSQLで `public` schemaのテーブル一覧が空である。
   - `_prisma_migrations` が存在しない。
   - `Repair` / `PartsMaster` / `Brand` / `Caliber` が存在しない。
   - 標準マスター3テーブルも存在しない。

3. 業務利用状態確認
   - このアプリはまだ業務で一切使用していない。
   - Railway productionで実データ登録を行っていない。
   - Supabase Storageに本番写真や顧客データがない、またはDB初期化とは切り分けて扱える。

4. 運用方針確認
   - このSupabase projectを今後の実アプリDBとして使う。
   - 空DBへ現在の `schema.prisma` を反映することを許可する。
   - 標準マスターseedを初期データとして投入することを許可する。

5. 実行前安全確認
   - 実行コマンドごとに接続先表示を確認する。
   - Supabaseへの `db push` / seed は、ローカルDB検証と同じ手順で一つずつ実行する。
   - 実行結果をTask docsに記録する。

## 初期化方式比較

### 案A: `prisma db push` で現在schemaをSupabaseに反映

内容:

- 現在の `prisma/schema.prisma` を正として、空Supabaseへ直接反映する。
- Prisma migration履歴は使わない。
- 初期DB作成後に標準マスターseedを実行する。

メリット:

- 空DBに現在のschemaを最短で反映できる。
- ローカルDocker DBで同じ方式が成功済み。
- 現在の `schema.prisma` とPrisma Clientの整合を優先できる。
- 既存の壊れたmigration履歴に引きずられない。
- 業務未使用・空DBという前提では、実務上のリスクが低い。

デメリット:

- `_prisma_migrations` に初期schema作成履歴が残らない。
- 今後 `prisma migrate dev/deploy` を健全に使うには、別途baseline整理が必要。
- `db push` を継続運用すると、変更履歴が追いづらくなる。

空DB・業務未使用なら許容できるか:

- 短期的には許容できる。
- 今回の目的が「空Supabaseを今後の実DBとして初期化すること」であれば、第一候補にできる。
- ただし、初期化後にbaseline migrationを整えるTaskを必ず分けて実施する。

注意点:

- Supabaseが空であることを再確認してから実行する。
- Railway productionの接続先が同じprojectであることを確認してから実行する。
- `db push` はSupabaseに対して強い操作なので、接続先確認なしに実行しない。

### 案B: 現在schemaからbaseline migrationを作って適用

内容:

- 現在の `schema.prisma` 全体から初期baseline migrationを作る。
- 空DBから現在schemaを再現可能にする。
- そのbaselineをSupabaseへ適用するか、適用済み扱いにするかを設計する。

メリット:

- 今後のPrisma migration運用が健全になる。
- 空DBからの再現性を確保できる。
- CIや新規開発DBで `prisma migrate dev` を使いやすくなる。
- DB変更履歴をGitで追いやすい。

デメリット:

- 既存の壊れたmigration 2件との関係整理が必要。
- 既存migrationを残すか、退避するか、baseline後に再構成するかを決める必要がある。
- Supabaseへ適用する場合、`_prisma_migrations` の扱いを誤ると履歴が壊れる。
- 手順が複雑で、今回すぐに実DBを初期化する目的からは遠回り。

既存の壊れたmigrationとの関係:

- `20260427_add_repair_movement_fields` は既存 `Repair` 前提の差分migrationであり、baselineより前には置けない。
- `20260508_add_part_standard_masters` は `PartsMaster` 前提の差分migrationであり、baselineより前には置けない。
- baselineを作るなら、既存2件をどう扱うかを別Taskで明確に決める必要がある。

評価:

- 長期的には必要。
- ただし、空Supabase初期化の即時手段としては案Aより重い。
- 初期化後のmigration健全化Taskとして扱うのがよい。

### 案C: `schema.sql` を使って初期化

内容:

- repoに存在する `schema.sql` をSupabaseへ流してDBを作る。

メリット:

- 初期テーブル作成SQLがまとまっている。
- `Repair` などの初期テーブル作成定義が含まれている。

デメリット:

- `schema.sql` はSQLite向けのSQLに見える。
  - `AUTOINCREMENT`
  - `DATETIME`
  - `TEXT`
  - SQLite形式の主キー定義
- 現在の `schema.prisma` はPostgreSQL provider。
- 標準マスター3テーブルが含まれていない。
- `PartsMaster` などの定義が現在の `schema.prisma` とズレている。
- Supabase PostgreSQLへそのまま適用するには不適切。

現在schema.prismaとのズレ:

- 現在の標準マスター構造が含まれていない。
- Task028で追加した `standardPartNameId` / `gradeId` が含まれていない。
- 既存modelのカラムも現在schemaと差異がある可能性が高い。

評価:

- 推奨しない。
- 参照資料としては使えるが、Supabase初期化の実行元にはしない。

## 推奨方式

現時点の推奨は、短期と長期を分ける。

### 短期推奨: 案A `prisma db push`

空Supabaseを今後の実アプリDBとして初期化する最初の作業は、`prisma db push` を第一候補にする。

理由:

- 業務データがまだ存在しない。
- Supabase DBが空である。
- ローカルDocker DBで `prisma db push` が成功済み。
- 標準マスターseedもローカルDBで成功済み。
- 現在の `schema.prisma` を正としてDBを作れる。
- 壊れた過去migrationに引っかからない。

ただし、これは「初期化のための短期対応」と位置づける。

### 長期推奨: baseline migration整理

Supabase初期化後、別Taskでbaseline migrationを整理する。

目的:

- 今後のDB変更をmigrationで安全に管理する。
- 空DBから現在schemaを再現可能にする。
- `prisma migrate dev/deploy` を再び使える状態にする。

推奨順:

1. 空Supabaseへ `db push` で現在schemaを作る。
2. 標準マスターseedを実行する。
3. 初期化結果を読み取りSQLで確認する。
4. baseline migrationの作成方針を別Taskで決める。
5. 既存migration 2件の扱いを整理する。
6. 以後のschema変更はmigration運用へ戻す。

避けること:

- `schema.sql` をSupabaseへ流す。
- 壊れた既存migrationをそのままSupabaseへ `migrate deploy` する。
- `_prisma_migrations` を確認せずに `migrate resolve` する。
- 接続先確認なしに `db push` やseedを実行する。

## 標準マスターseedの適用条件

Supabase初期化後、以下の条件を満たす場合に限り `scripts/seed-part-standard-masters.ts` を実行してよい。

投入予定:

- `PartCategoryMaster`: 16件
- `PartNameMaster`: 223件
- `PartGradeMaster`: 3件

実行条件:

1. `prisma db push` が対象Supabase DBに成功している。
2. `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` が存在する。
3. 各tableの `key` unique制約が存在する。
4. `PartNameMaster.categoryId` のrelation先である `PartCategoryMaster` が存在する。
5. `PartsMaster.standardPartNameId` / `PartsMaster.gradeId` が存在する。
6. seed scriptが `upsert` のみで、`delete` / `deleteMany` を使っていないことを再確認する。
7. seed scriptが `isActive=false` への自動変更をしないことを再確認する。
8. 実行前に接続先が対象Supabase projectであることを表示確認する。
9. 実行後に件数確認を行う。

実行後確認:

```sql
SELECT COUNT(*) FROM "PartCategoryMaster";
SELECT COUNT(*) FROM "PartNameMaster";
SELECT COUNT(*) FROM "PartGradeMaster";
```

期待:

```text
PartCategoryMaster: 16
PartNameMaster: 223
PartGradeMaster: 3
```

注意:

- seedは既存PartsMaster補正ではない。
- 既存 `PartsMaster.standardPartNameId` / `gradeId` の補完はまだ行わない。
- `PartsForm` / `PartsSearchPanel` / API payload対応もまだ行わない。

## 今後のmigration運用方針

### 既存migration 2件の扱い

現状:

- `20260427_add_repair_movement_fields`
  - 既存 `"Repair"` 前提の差分migration。
  - 空DBからは失敗する。
- `20260508_add_part_standard_masters`
  - 既存 `"PartsMaster"` 前提の差分migration。
  - 空DBからの初期migrationではない。

短期:

- Supabase初期化には使わない。
- `migrate deploy` も使わない。
- `db push` によって現在schemaを反映する。

長期:

- baseline migrationを作り直すか、migration履歴を再構成するTaskを作る。
- 既存2件を残す場合は、空DB再現性の妨げになるため、baselineとの関係を明文化する。
- 既存2件を履歴として残すだけにするのか、新baseline以後のmigrationに置き換えるのかを決める。

### `migrate resolve` の必要性

`db push` だけで初期化する場合:

- `_prisma_migrations` は作られない、またはmigration履歴は記録されない。
- そのままでは `migrate deploy` 運用に戻しづらい。
- baseline migrationを作った後、既存DBに対してbaselineを適用済み扱いにするために `migrate resolve` を検討する可能性がある。

ただし:

- `migrate resolve` はDB構造そのものを作る操作ではなく、migration履歴の記録操作。
- 実行前に、対象DBのschemaがbaseline migrationと一致していることを確認する必要がある。
- 今回のTaskでは実行しない。

### 今後の理想運用

推奨:

1. 初期化は `db push` で行う。
2. 直後にschema状態を読み取りSQLで記録する。
3. baseline migrationを作る。
4. 新規ローカルDBでbaselineから再現できることを確認する。
5. Supabase側では、baselineを適用済み扱いにするかを慎重に設計する。
6. 以後の変更は `prisma migrate dev` / `prisma migrate deploy` に戻す。

避ける:

- `db push` を恒久運用にする。
- migration履歴が壊れたままUI/API開発を進める。
- 本番相当DBへ接続先確認なしにschema変更を行う。

## 実行前チェックリスト

実際にSupabaseを初期化する前に、以下を1つずつ確認する。

### 対象DB確認

- [ ] Supabase project refを確認した。
- [ ] Railway production `DATABASE_URL` が同じSupabase project refを指している。
- [ ] Railway production `DIRECT_URL` が同じSupabase project refを指している。
- [ ] Railway production `NEXT_PUBLIC_SUPABASE_URL` が同じSupabase project refを指している。
- [ ] ローカル `.env` のproject refとも照合した。
- [ ] 接続先database名が `postgres` であることを確認した。

### 空DB確認

- [ ] Supabase Table Editorで `public` tableがないことを確認した。
- [ ] 読み取りSQLで `public` schemaのtable一覧が空であることを確認した。
- [ ] `_prisma_migrations` が存在しないことを確認した。
- [ ] `Repair` が存在しないことを確認した。
- [ ] `PartsMaster` が存在しないことを確認した。
- [ ] `Brand` が存在しないことを確認した。
- [ ] `Caliber` が存在しないことを確認した。
- [ ] 標準マスター3テーブルが存在しないことを確認した。

### 業務利用確認

- [ ] アプリがまだ業務で一切使用されていないことを確認した。
- [ ] 実運用データがないことを確認した。
- [ ] Supabase Storage側に守るべき本番写真がない、またはDB初期化とは独立していることを確認した。

### ローカル検証確認

- [ ] DockerローカルPostgreSQLで `prisma db push` 成功済み。
- [ ] DockerローカルPostgreSQLで標準マスターseed成功済み。
- [ ] ローカル件数確認が期待どおり。
  - [ ] `PartCategoryMaster`: 16
  - [ ] `PartNameMaster`: 223
  - [ ] `PartGradeMaster`: 3
- [ ] `prisma validate` 成功済み。
- [ ] `prisma generate` 成功済み。
- [ ] `npx tsc --noEmit` 成功済み。

### 実行コマンド確認

- [ ] Supabase向けDB接続を一時環境変数で設定する手順を書いた。
- [ ] 実行前に `npx.cmd prisma migrate status` などで接続先表示を確認する。
- [ ] Supabase host / project refが想定と違う場合は停止する。
- [ ] `npx.cmd prisma db push` を実行する前に、コマンドをユーザーに明示する。
- [ ] seed実行前に、標準マスター3テーブルの存在を確認する。
- [ ] `npx.cmd tsx scripts/seed-part-standard-masters.ts` を実行する前に、コマンドをユーザーに明示する。
- [ ] 実行後に件数確認SQLを行う。
- [ ] 実行結果をdocsに記録する。

## 次Task推奨

### Task030.14: 空Supabase初期化実行手順docs

目的:

- Supabaseへ `db push` と標準マスターseedを実行するための、実行コマンド単位の手順docsを作る。

含める:

- 接続先確認コマンド
- `db push` 実行コマンド
- seed実行コマンド
- 件数確認SQL
- 失敗時に止める条件
- 実行ログ記録欄

### Task030.15: 空Supabaseへ `db push` 実行

目的:

- Task030.14の手順に従って、対象Supabaseへ現在schemaを反映する。

### Task030.16: Supabaseへ標準マスターseed実行

目的:

- Task030.15で作成された標準マスター3テーブルへ初期データを投入する。

### Task030.17: baseline migration整理方針

目的:

- `db push` 後の実DBを基準に、今後のPrisma migration運用を健全化する。

### Task031以降

Supabase初期化とseed投入が確認できてから、PartsFormやPartsSearchPanelのDBマスター連携へ進む。

## 今回変更していないこと

- Supabaseへ `db push` していない。
- Supabaseへmigrationしていない。
- Supabaseへseedしていない。
- DBを書き換えていない。
- `.env` は変更していない。
- `prisma/schema.prisma` は変更していない。
- migrationファイルは変更していない。
- TypeScript / React / API / UI は変更していない。
- `package.json` は変更していない。
- stashは戻していない。
- Task025 / Task026には触れていない。
