# AI Task 030.6: DockerローカルPostgreSQL検証環境の準備方針

## 目的

現在のPrisma接続先がSupabase PostgreSQLであるため、migration / seedを安全に検証するためのDockerローカルPostgreSQL環境の準備方針を整理する。

今回は調査・手順docsのみで、migration実行、seed実行、DB書き換え、`.env` 変更、schema変更は行わない。

## 現在の前提

- `.env` のみ存在する。
- Prismaは `.env` を読む。
- `.env` の `DATABASE_URL` はSupabase poolerを指している。
- `.env` の `DIRECT_URL` はSupabase直結を指している。
- `.env` の `SHADOW_DATABASE_URL` もSupabase直結を指している。
- ローカルDB用URLは未定義。
- 未適用migrationがある。
  - `20260427_add_repair_movement_fields`
  - `20260508_add_part_standard_masters`

この状態で `npx prisma migrate dev` や `npx tsx scripts/seed-part-standard-masters.ts` を実行すると、Supabaseへ反映される可能性があるため危険。

## 基本方針

- `.env` はSupabase向けのまま変更しない。
- ローカル検証時だけ、PowerShellセッション内の一時環境変数でPrisma接続先を上書きする。
- DockerでローカルPostgreSQLを起動し、通常の5432ではなく `54322` を使う。
- migration / seed実行前に必ず `npx prisma migrate status` で接続先を確認する。
- Supabaseホストが表示された場合は、その場で停止する。

## Docker確認手順

PowerShellで以下を実行する。

```powershell
docker --version
docker compose version
```

確認ポイント:

- Dockerが導入されていればバージョンが表示される。
- Docker Desktopが起動していない場合は、Docker Desktopを起動してから再実行する。
- `docker` コマンドが見つからない場合は、ここで止める。
- Docker未導入のままmigration / seedへ進まない。

## ローカルPostgreSQL起動コマンド案

既存PostgreSQLやSupabase CLIと衝突しにくいよう、ホスト側ポートは `54322` を使う。

PowerShell 1行版:

```powershell
docker run --name clock-repair-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clock_repair_local -p 54322:5432 -d postgres:16
```

既に同名コンテナがある場合の起動:

```powershell
docker start clock-repair-postgres
```

停止:

```powershell
docker stop clock-repair-postgres
```

状態確認:

```powershell
docker ps --filter "name=clock-repair-postgres"
```

## shadow DB作成案

`migrate dev` はshadow DBを使うため、同じPostgreSQLコンテナ内にshadow DBを作成する。

```powershell
docker exec -it clock-repair-postgres psql -U postgres -c "CREATE DATABASE clock_repair_shadow;"
```

既に存在する場合はエラーになるため、その場合は無視してよい。

## PowerShell一時環境変数案

`.env` は変更せず、migration / seedを実行するPowerShellセッション内だけ以下を設定する。

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public"
$env:DIRECT_URL="postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public"
$env:SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public"
```

確認:

```powershell
npx prisma migrate status
```

期待:

- 接続先が `localhost:54322` になっている。
- Supabaseホストが表示されない。

Supabaseホストが表示された場合:

- そのPowerShellセッションではmigration / seedを実行しない。
- 環境変数の設定漏れ、別ターミナルで実行していないかを確認する。

## migration検証手順案

1. Docker PostgreSQLを起動する。
2. shadow DBを作成する。
3. PowerShell一時環境変数を設定する。
4. 接続先確認を行う。

```powershell
npx prisma migrate status
```

5. 接続先が `localhost:54322` であることを確認してからmigrationを適用する。

```powershell
npx prisma migrate dev
```

注意:

- `.env` は書き換えない。
- Supabaseが表示された場合は実行しない。
- shadow DB問題が出た場合は、エラー全文を記録して止める。
- 既存migrationが途中で失敗する場合も、無理に手動修正せず原因を記録する。

## seed検証手順案

ローカルDBにmigrationが適用できた後、同じPowerShellセッションで実行する。

```powershell
npx tsx scripts/seed-part-standard-masters.ts
```

期待結果:

```text
PartCategoryMaster upserted: 16
PartNameMaster upserted: 223
PartGradeMaster upserted: 3
Done.
```

注意:

- seed実行前にも `npx prisma migrate status` で接続先を確認する。
- Supabaseホストが表示された場合は実行しない。
- 既存PartsMasterの `standardPartNameId` / `gradeId` 補正はまだ行わない。

## 確認コマンド案

schema検証:

```powershell
npx prisma validate
```

Prisma Client生成:

```powershell
npx prisma generate
```

型チェック:

```powershell
npx tsc --noEmit
```

Windowsで `prisma generate` がDLLロックで失敗する場合:

- Next dev server
- Prisma Studio
- Nodeプロセス

を停止してから再実行する。

## 件数確認案

seed実行後、Prisma queryで件数を確認する。

PowerShellから一時的にNodeを使う例:

```powershell
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.partCategoryMaster.count(), prisma.partNameMaster.count(), prisma.partGradeMaster.count()]).then(([c,n,g]) => { console.log({ PartCategoryMaster: c, PartNameMaster: n, PartGradeMaster: g }); }).finally(() => prisma.$disconnect());"
```

期待:

```text
PartCategoryMaster: 16
PartNameMaster: 223
PartGradeMaster: 3
```

## 注意点

- ローカル検証用の一時環境変数は、そのPowerShellセッション内だけ有効。
- 別ターミナルでは `.env` のSupabase接続に戻る可能性がある。
- migration / seedを実行する直前に必ず接続先を確認する。
- `.env` をローカル向けに直接書き換えない。
- 本番・Supabaseへの適用は別Taskで手順を分ける。
- 既存PartsMaster補正、PartsForm連携、PartsSearchPanel連携はまだ行わない。

## 次のTask案

- Task030.7: DockerローカルPostgreSQLを起動する。
- Task030.8: ローカルDBにmigrationを適用する。
- Task030.9: seed scriptを実行して件数確認する。

## 変更していないこと

- `.env` は変更していない。
- migrationは実行していない。
- seedは実行していない。
- DBは書き換えていない。
- Prisma schemaは変更していない。
- migrationファイルは変更していない。
- TypeScript / React / API は変更していない。
- `package.json` は変更していない。
- stashは戻していない。
- Task025 / Task026 には触っていない。
