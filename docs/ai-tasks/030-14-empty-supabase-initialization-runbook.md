# AI Task 030.14: 空Supabase初期化実行手順docs

## 目的

Task030.13で整理した方針に従い、空のSupabase projectを今後の実アプリDBとして初期化するための実行手順をまとめる。

今回は実行手順docsのみを作成する。

このTaskでは、Supabaseへの `prisma db push`、migration、seed、DB変更は行っていない。

## 前提

- アプリはまだ業務で一切使用していない。
- 既存業務データはない前提。
- Supabase `public` schema は空。
- `_prisma_migrations` は存在しない。
- Railway production の `DATABASE_URL` はこのSupabase projectを指している可能性が高い。
- `NEXT_PUBLIC_SUPABASE_URL` も同じSupabase projectと思われる。
- ローカルDocker DBでは `prisma db push` + 標準マスターseed が成功済み。
- Prisma migration履歴は空DBから再現できない。
- 短期は `prisma db push` で空Supabaseへ現在schemaを反映する。
- 長期はbaseline migration整理を別Taskで行う。

## 実行前チェックリスト

### 1. Git / 作業ツリー

- [ ] `git status --short` がcleanである。
- [ ] 未commitのschema / migration / seed script変更がない。
- [ ] stashを戻していない。
- [ ] Task025 / Task026のstashに触れていない。

### 2. 対象Supabase project確認

- [ ] Supabase project refを確認した。
- [ ] Railway `DATABASE_URL` が同じSupabase projectを指している。
- [ ] Railway `DIRECT_URL` が同じSupabase projectを指している。
- [ ] Railway `NEXT_PUBLIC_SUPABASE_URL` が同じSupabase projectを指している。
- [ ] ローカル `.env` の `DATABASE_URL` / `DIRECT_URL` / `SHADOW_DATABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` とproject refが一致している。
- [ ] URL全文やpasswordはチャット・docs・ログに出していない。

### 3. 空DB確認

- [ ] Supabase Table Editorで `public` tableが空である。
- [ ] `_prisma_migrations` が存在しない。
- [ ] `Repair` が存在しない。
- [ ] `PartsMaster` が存在しない。
- [ ] `Brand` が存在しない。
- [ ] `Caliber` が存在しない。
- [ ] `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` が存在しない。

### 4. 業務データ確認

- [ ] このアプリはまだ業務で一切使用していない。
- [ ] Railway productionで実データ登録を行っていない。
- [ ] Supabase Storageに守るべき本番写真がない、またはDB初期化とは独立している。

### 5. ローカル検証確認

- [ ] DockerローカルDBで `prisma db push` が成功済み。
- [ ] DockerローカルDBで `scripts/seed-part-standard-masters.ts` が成功済み。
- [ ] ローカルseed件数が期待どおり。
  - [ ] `PartCategoryMaster`: 16
  - [ ] `PartNameMaster`: 223
  - [ ] `PartGradeMaster`: 3
- [ ] `npx.cmd prisma validate` 成功済み。
- [ ] `npx.cmd prisma generate` 成功済み。
- [ ] `npx.cmd tsc --noEmit` 成功済み。

### 6. 実行方針確認

- [ ] `.env` は変更しない。
- [ ] `prisma migrate dev` は使わない。
- [ ] `prisma migrate deploy` も今回は使わない。
- [ ] `prisma db push` は空DB初期化用の短期対応として使う。
- [ ] 実行コマンドを1つずつ確認してから進める。
- [ ] 実行結果をdocsに記録する。

## Supabase接続先確認手順

秘密情報を出さずに、PowerShell上でproject ref / hostの一部だけを確認する。

`.env` は変更しない。

### `.env` の接続先をマスク表示する確認コマンド

PowerShell:

```powershell
@'
const fs = require("fs");
const keys = ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function mask(value) {
  if (!value) return null;
  return value.length <= 8 ? value[0] + "..." + value[value.length - 1] : value.slice(0, 4) + "..." + value.slice(-4);
}

function info(value) {
  const url = new URL(value);
  const host = url.hostname;
  const username = decodeURIComponent(url.username || "");
  let kind = "url";
  let projectRef = null;

  if (host.includes("pooler.supabase.com")) {
    kind = "supabase-pooler";
    const match = username.match(/postgres\.([a-z0-9]+)/i);
    if (match) projectRef = match[1];
  } else if (host.endsWith(".supabase.co")) {
    kind = "supabase-project-url";
    const labels = host.split(".");
    projectRef = labels[0] === "db" ? labels[1] : labels[0];
  }

  return {
    kind,
    host: mask(host),
    projectRef: mask(projectRef),
    database: url.pathname.replace(/^\//, ""),
    port: url.port || null,
  };
}

const env = parseEnv(fs.readFileSync(".env", "utf8"));
for (const key of keys) {
  console.log(key, info(env[key]));
}
'@ | node -
```

確認すること:

- `DATABASE_URL` がSupabase poolerである。
- `DIRECT_URL` がSupabase direct connectionである。
- `SHADOW_DATABASE_URL` がSupabase direct connectionである。
- `NEXT_PUBLIC_SUPABASE_URL` がSupabase project URLである。
- 4つのproject refが一致している。
- 想定外project、Supabase以外、または空欄なら停止する。

注意:

- URL全文をログやチャットに出さない。
- password、anon key、接続文字列全文をdocsに書かない。
- project ref / hostの一部だけで確認する。

## 実行コマンド案

この章は実行手順の案であり、このTaskでは実行しない。

実行時は、同じPowerShellセッション内で接続先確認を行い、コマンドを1つずつ実行する。

### 1. 作業ツリー確認

```powershell
git status --short
```

期待:

```text
clean
```

cleanでない場合は停止する。

### 2. Prisma schema検証

```powershell
npx.cmd prisma validate
```

期待:

- schemaがvalidである。

失敗した場合:

- 停止する。
- `db push` へ進まない。

### 3. Supabase接続先を最終確認

実行前に、Supabase project ref / hostが想定どおりであることを確認する。

確認方法:

- Railway dashboardのVariablesで確認。
- Supabase dashboardのProject Settingsで確認。
- PowerShellのマスク表示コマンドで確認。

想定と違う場合:

- 停止する。

### 4. 現在schemaをSupabaseへ反映

```powershell
npx.cmd prisma db push
```

位置づけ:

- 空Supabase初期化用の短期対応。
- Prisma migration履歴を使わない。
- `prisma migrate dev` / `prisma migrate deploy` は今回は使わない。

成功時:

- `Repair` / `PartsMaster` / `Brand` / `Caliber` などの現在schema上のテーブルが作成される。
- `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` が作成される。
- `PartsMaster.standardPartNameId` / `gradeId` が作成される。

失敗時:

- 停止する。
- seedへ進まない。
- エラー全文をdocsに記録する。

### 5. Prisma Client生成

```powershell
npx.cmd prisma generate
```

失敗した場合:

- Next dev server / Prisma Studio / NodeプロセスのDLLロックを疑う。
- プロセス停止後に再実行するか、エラーを記録して停止する。

### 6. 型チェック

```powershell
npx.cmd tsc --noEmit
```

失敗した場合:

- 停止する。
- seedへ進むかはエラー内容を確認して判断する。
- DB初期化直後の確認としては、原則成功を待つ。

## 標準マスターseed実行手順

`db push` が成功し、標準マスター3テーブルが存在することを確認してから実行する。

### 実行コマンド

```powershell
npx.cmd tsx scripts/seed-part-standard-masters.ts
```

期待結果:

```text
PartCategoryMaster upserted: 16
PartNameMaster upserted: 223
PartGradeMaster upserted: 3
Done.
```

注意:

- `npx.cmd prisma db seed` ではない。
- このscriptは独立script。
- 既存 `prisma/seed.ts` には混ぜない。
- seedは標準マスター初期データだけを投入する。
- 既存PartsMasterの `standardPartNameId` / `gradeId` 補正は行わない。

失敗時:

- 停止する。
- エラー全文をdocsに記録する。
- 件数確認へ進まない。

## 実行後確認SQL案

Supabase SQL Editorで読み取り専用SQLだけを実行する。

### 接続先識別

```sql
SELECT current_database(), current_user;
```

### public table一覧

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

確認対象:

- `Repair`
- `PartsMaster`
- `Brand`
- `Caliber`
- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`

### Repair存在確認

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Repair'
ORDER BY ordinal_position;
```

### PartsMaster存在確認

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'PartsMaster'
ORDER BY ordinal_position;
```

確認するカラム:

- `standardPartNameId`
- `gradeId`
- `grade`
- `partType`
- `category`
- `subcategory`
- `nameJp`
- `nameEn`

### 標準マスター3テーブル存在確認

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PartCategoryMaster', 'PartNameMaster', 'PartGradeMaster')
ORDER BY table_name;
```

### 標準マスター件数確認

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

### 標準マスターkey確認

```sql
SELECT key, "nameJa", "nameEn", "sortOrder", "isActive"
FROM "PartGradeMaster"
ORDER BY "sortOrder";
```

期待:

- `genuine`
- `fit`
- `custom_fit`

### _prisma_migrations確認

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = '_prisma_migrations';
```

注意:

- `db push` 初期化では `_prisma_migrations` が作られない可能性がある。
- これは想定内。
- baseline migration整理は後続Taskで扱う。

## 失敗時の停止条件

以下の場合は即停止する。

- `git status --short` がcleanでない。
- 接続先project refが想定と違う。
- Supabase以外のDBを指している。
- Railway `DATABASE_URL` と `NEXT_PUBLIC_SUPABASE_URL` のproject refが一致しない。
- URL全文や秘密情報を表示・共有しそうになった。
- Supabaseに既に想定外のtableが存在する。
- `_prisma_migrations` が既に存在し、履歴が不明。
- `Repair` / `PartsMaster` などに既存データが存在する。
- 業務データが存在する疑いがある。
- `npx.cmd prisma validate` が失敗。
- `npx.cmd prisma db push` が失敗。
- `npx.cmd prisma generate` が失敗し、再実行しても解消しない。
- `npx.cmd tsc --noEmit` が失敗。
- seed scriptが失敗。
- seed件数が期待値と違う。

停止した場合:

- 以後のコマンドへ進まない。
- エラー全文をdocsに記録する。
- 原因調査Taskを分ける。

## 今後のbaseline migration整理

今回の初期化では、短期対応として `prisma db push` を使う。

ただし、`db push` 恒久運用は避ける。

後続Taskで以下を整理する。

- 現在schemaをbaselineとして整理する。
- 既存migration 2件の扱いを決める。
  - `20260427_add_repair_movement_fields`
  - `20260508_add_part_standard_masters`
- 空DBから現在schemaを再現できる状態にする。
- 新規ローカルDBでbaselineから再現できることを確認する。
- Supabase側の `_prisma_migrations` をどう扱うか決める。
- 必要なら `prisma migrate resolve` を検討する。
- 以後のDB変更は `prisma migrate dev` / `prisma migrate deploy` に戻す。

## 実行ログ記録欄

次Taskで実行する場合は、以下を埋める。

```text
実行日:
実行者:
対象Supabase project ref:
Railway DATABASE_URL確認:
NEXT_PUBLIC_SUPABASE_URL確認:
git status before:
prisma validate結果:
db push結果:
prisma generate結果:
tsc結果:
seed結果:
PartCategoryMaster件数:
PartNameMaster件数:
PartGradeMaster件数:
注意点:
git status after:
```

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
