# AI Task 030.12: 実アプリDB接続先の特定

## 目的

Task030.11で、現在の `.env` が指しているSupabase DBの `public` schema にテーブルが存在しないことが分かった。

このTaskでは、実際にアプリが使っているDB接続先の候補を、ローカルファイルから確認できる範囲で整理する。

今回は調査のみ。DB書き換え、migration、seed、env変更、schema変更、API/UI変更は行っていない。

## 読んだファイル

- `docs/ai-tasks/030-11-readonly-supabase-schema-check.md`
- `docs/ai-tasks/030-10-investigate-supabase-prisma-baseline.md`
- `prisma/schema.prisma`
- `.env`
- `package.json`
- `README.md`
- `src/lib/supabase-client.ts`

## ローカルenv確認結果

存在確認:

- `.env`: 存在する
- `.env.local`: 存在しない
- `.env.development`: 存在しない
- `.env.production`: 存在しない
- `.env.example`: 存在しない

`.env` に存在する主要キー:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

接続先の種類:

- `DATABASE_URL`: Supabase pooler
- `DIRECT_URL`: Supabase direct connection
- `SHADOW_DATABASE_URL`: Supabase direct connection
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL

秘密情報は出力していない。project refはマスクして確認した。

project ref確認:

- `DATABASE_URL` のSupabase project ref: `vpyj...fbiu`
- `DIRECT_URL` のSupabase project ref: `vpyj...fbiu`
- `SHADOW_DATABASE_URL` のSupabase project ref: `vpyj...fbiu`
- `NEXT_PUBLIC_SUPABASE_URL` のSupabase project ref: `vpyj...fbiu`

結論:

- `.env` 内のDB接続先とSupabase Storage/API用URLは、同じSupabase projectを指している。
- ただしTask030.11で、このprojectのDB `public` schemaにはテーブルが存在しなかった。
- そのため、`.env` のSupabase DBは現時点の実アプリDBではない可能性が高い。

## Prisma Clientが読むenv

`prisma/schema.prisma` の datasource は以下を読む。

```prisma
url               = env("DATABASE_URL")
directUrl         = env("DIRECT_URL")
shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
```

ローカルで `npx prisma ...` を実行すると、明示的に一時環境変数を上書きしない限り `.env` のSupabase接続を読む。

Next.jsアプリのサーバー側でPrisma Clientが使うDB接続先も、実行環境の `DATABASE_URL` に依存する。

## Supabase Clientが読むenv

`src/lib/supabase-client.ts` は以下を読む。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

これは主にSupabase Storage/API用の接続情報であり、PrismaのPostgreSQL接続先とは別経路である。

DBはPrisma経由、写真アップロードなどはSupabase Client経由、という構成になっている。

## package.json確認結果

主要script:

- `dev`: `next dev`
- `build`: `prisma generate && next build`
- `start`: `next start`
- `lint`: `next lint`

Prisma seed設定:

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

確認結果:

- Railway専用scriptは見当たらない。
- `DATABASE_URL` をscript内で明示上書きする処理は見当たらない。
- deploy先の環境変数があれば、そちらが実行時のDB接続先になる。

## Railway関連確認結果

ローカルrepo直下で以下は見つからなかった。

- `railway.json`
- `nixpacks.toml`
- `Procfile`
- `Dockerfile`

`package.json` にもRailway専用設定は見当たらない。

READMEにも、Railwayの `DATABASE_URL` 設定を特定できる記述は見当たらなかった。

結論:

- ローカルファイルからはRailway接続先を特定できない。
- Railwayにデプロイしている場合、Railway dashboard側のVariablesで `DATABASE_URL` が別DBを指している可能性がある。
- Railway側確認が必要。

## Supabase project識別結果

`.env` 上のSupabase project:

- project ref: `vpyj...fbiu`
- `DATABASE_URL`: Supabase pooler / database `postgres`
- `DIRECT_URL`: Supabase direct / database `postgres`
- `SHADOW_DATABASE_URL`: Supabase direct / database `postgres`
- `NEXT_PUBLIC_SUPABASE_URL`: 同じproject ref

Task030.11の読み取り確認では、このprojectのDBは以下の状態だった。

- `current_database`: `postgres`
- `current_user`: `postgres`
- `public._prisma_migrations`: なし
- `public` schemaのテーブル: なし
- `Repair`: なし
- `PartsMaster`: なし
- `Brand`: なし
- `Caliber`: なし
- 標準マスター3テーブル: なし

所見:

- `.env` のSupabase project自体はStorage/API用として使われている可能性がある。
- しかしPostgreSQL DBとしては空に見えるため、実データを持つアプリDBとは考えにくい。
- 実アプリが動いていてデータが見えているなら、実行環境の `DATABASE_URL` は `.env` と違う可能性が高い。

## 実アプリDB候補

### 候補1: ローカル `.env` のSupabase DB

可能性:

- 低い。

理由:

- Task030.11で主要テーブルが存在しなかった。
- `_prisma_migrations` も存在しなかった。

確認方法:

- Supabase dashboardのTable Editorで同projectにテーブルがあるか確認する。
- SQL EditorでTask030.11と同じ読み取りSQLを確認する。

危険性:

- このDBへmigrationやseedを実行すると、空DBに新schemaを作ることになる。
- 実アプリDBではない場合、作業してもアプリには反映されない。

### 候補2: Railway環境変数の `DATABASE_URL`

可能性:

- 高い。

理由:

- ローカル `.env` のDBが空だったため、デプロイ先で別の `DATABASE_URL` が設定されている可能性がある。
- Next.js / Prisma構成では、実行環境の `DATABASE_URL` がPrisma Clientの接続先になる。

確認方法:

- Railway dashboardの対象project/serviceでVariablesを確認する。
- `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL` のhost/project/databaseを確認する。
- 値そのものはチャットに貼らず、Supabase project refやhost種別だけを照合する。

危険性:

- ここが本番DBの場合、migration/seedは必ずbackupと手順整理後に行う必要がある。

### 候補3: Supabase dashboard上の別project

可能性:

- 高い。

理由:

- `.env` のSupabase projectが空DBだったため、実データは別projectにある可能性がある。
- Storage用projectとDB用projectが意図せず分かれている可能性もある。

確認方法:

- Supabase dashboardで複数projectを確認する。
- Table Editorで `Repair`, `PartsMaster`, `Brand`, `Caliber` が存在するprojectを探す。
- Project Settings > Database のconnection stringとRailway Variablesを照合する。

危険性:

- projectを間違えると、空DBや別環境へmigration/seedしてしまう。

### 候補4: DockerローカルPostgreSQL

可能性:

- 実アプリDBとしては低い。

理由:

- Task030.9の検証用に用意したローカルDB。
- migration/seed検証には使えるが、本番/実アプリDBではない。

確認方法:

- 接続先が `localhost:54322` かどうか。

危険性:

- ローカル検証結果を実DB反映済みと誤認しないこと。

### 候補5: その他のPostgreSQL

可能性:

- 不明。

例:

- 過去のXServer / managed PostgreSQL
- Supabase以外のPostgreSQL
- Railway PostgreSQL plugin

確認方法:

- deploy先のVariablesと運用メモを確認する。
- アプリが表示している実データのDB hostを確認する。

## ヨシダが確認すべき画面

秘密情報はチャットに貼らない。確認してほしいのは、接続先が一致しているか、テーブルが存在するかだけ。

### Railway

- Railway dashboard > 対象Project > 対象Service > Variables
- 確認するキー:
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `SHADOW_DATABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 確認ポイント:
  - `DATABASE_URL` が `.env` と同じSupabase project refか
  - Railway PostgreSQLや別Supabase projectを指していないか
  - 本番serviceと開発serviceでVariablesが分かれているか

### Supabase

- Supabase dashboard > Project list
- Supabase dashboard > 対象Project > Table Editor
- Supabase dashboard > Project Settings > Database > Connection string
- Supabase dashboard > Project Settings > API

確認ポイント:

- Table Editorに `Repair`, `PartsMaster`, `Brand`, `Caliber` があるprojectはどれか
- `_prisma_migrations` が存在するprojectはどれか
- Project Settings > API のProject URLのrefが `.env` の `NEXT_PUBLIC_SUPABASE_URL` と同じか
- Database connection stringのrefがRailway `DATABASE_URL` と同じか

### Deploy logs

- Railway dashboard > Deployments > Logs

確認ポイント:

- 起動時にPrismaの接続エラーが出ていないか
- build時に `prisma generate` が成功しているか
- 実行環境がどのVariablesセットを使っているか

## 推奨する次Task

### Task030.13: 実アプリDB候補の読み取り専用schema確認

RailwayまたはSupabase dashboardで実アプリDB候補を特定した後、その接続先に対して読み取り専用SQLだけを実行する。

確認項目:

- `_prisma_migrations` の有無
- `Repair`, `PartsMaster`, `Brand`, `Caliber` の有無
- `Repair` のmovement系カラム有無
- `PartsMaster.standardPartNameId` / `gradeId` の有無
- 標準マスター3テーブルの有無
- 主要テーブル件数

### Task030.14: 実アプリDBへの標準マスター適用手順設計

Task030.13で実DB状態が確認できてから、backup、rollback、migration適用、seed実行の順序を設計する。

## 注意点

- `.env` は変更していない。
- DBへ変更系SQLは実行していない。
- migrationは実行していない。
- `prisma db push` は実行していない。
- seedは実行していない。
- schema / TypeScript / React / API / package.json は変更していない。
- 現時点では、`.env` のSupabase DBを実アプリDBとして扱わない方がよい。
- 実DB候補の確認が終わるまで、Supabaseへのmigration / seed / db pushは禁止のままにする。
