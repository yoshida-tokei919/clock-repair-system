# AI Task 030.8.5: Prisma migration履歴整合性調査

## 目的

DockerローカルPostgreSQLに対して `npx prisma migrate dev` を実行した際、過去migration `20260427_add_repair_movement_fields` が shadow DB で失敗した原因を調査する。

今回は原因調査のみで、migration修正・schema変更・DB書き換え・seed実行は行わない。

## 発生したエラー

```text
Error: P3006
Migration `20260427_add_repair_movement_fields` failed to apply cleanly to the shadow database.
Error code: P1014
The underlying table for model `Repair` does not exist.
```

## migration一覧

現在 `prisma/migrations/` に存在するmigrationは以下の2件のみ。

| 順序 | migration | 主な内容 |
|---|---|---|
| 1 | `20260427_add_repair_movement_fields` | 既存の `"Repair"` テーブルへムーブメント関連カラムと外部キーを追加 |
| 2 | `20260508_add_part_standard_masters` | `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` を作成し、`PartsMaster` に nullable relation を追加 |

確認結果:

- `Repair` テーブルを作成するmigrationは存在しない。
- `Brand` / `Caliber` / `PartsMaster` など、既存主要テーブルを作成する初期migrationも存在しない。
- 最初のmigrationが `ALTER TABLE "Repair"` から始まっている。
- 空DBに対して migration 履歴を先頭から再生できる状態ではない。

## Repairテーブル名の確認

`prisma/schema.prisma` の修理案件modelは `model Repair`。

確認結果:

- `Repair` model に `@@map` はない。
- `Repair` model の各カラムにも、今回の失敗に関係するテーブル名変更用の `@map` はない。
- Prisma上の実テーブル名はデフォルトで `"Repair"`。
- `20260427_add_repair_movement_fields/migration.sql` も `"Repair"` を参照している。
- model名とmigration内のテーブル名は一致している。

そのため、今回の直接原因は「migrationが誤ったテーブル名を参照している」ことではなく、「その前段で `"Repair"` を作成するmigrationがない」こと。

## 失敗migrationの中身

対象:

```text
prisma/migrations/20260427_add_repair_movement_fields/migration.sql
```

内容:

```sql
ALTER TABLE "Repair"
  ADD COLUMN "movementMakerId" INTEGER,
  ADD COLUMN "movementCaliberId" INTEGER,
  ADD COLUMN "baseMovementMakerId" INTEGER,
  ADD COLUMN "baseMovementCaliberId" INTEGER;
```

続いて、`Brand` / `Caliber` への外部キー制約を追加している。

失敗可能性が高い箇所:

- 冒頭の `ALTER TABLE "Repair"`。

理由:

- shadow DB はmigration履歴を空DBから再生する。
- 現在のmigration履歴には `CREATE TABLE "Repair"` がない。
- そのため、最初の `ALTER TABLE "Repair"` 時点で `Repair` テーブルが存在せず `P1014` になる。

## 現在のschema.prismaとの整合

現在の `schema.prisma` には、すでに以下のカラムが `Repair` model に存在する。

- `movementMakerId`
- `movementCaliberId`
- `baseMovementMakerId`
- `baseMovementCaliberId`

つまり `20260427_add_repair_movement_fields` は現在schemaの一部を既存DBへ後付けする差分migrationとしては自然だが、空DBから現在schemaを再現するための初期migrationではない。

## Supabase側とのズレの可能性

現在のSupabaseではアプリが動いている可能性があるため、以下の状態が考えられる。

- Supabase側には `Repair` / `Brand` / `Caliber` / `PartsMaster` などが既に手動作成、または過去の別migrationで作成済み。
- 現在リポジトリに残っているmigrationは、既存DBへ後から加えた差分のみ。
- migration履歴が途中から作られており、空DBから再現できる履歴になっていない。
- Supabaseの実DB状態と、リポジトリ内migration履歴が一致していない可能性が高い。

そのため、ローカルDBで `migrate dev` できない理由は、Task028 migrationの問題というより、既存DBを再現する初期migrationまたはbaselineが欠けているためと考えられる。

## 解決案比較

### 案A: migration履歴を修正して空DBから再現可能にする

内容:

- 現在schema全体を再現できる初期migrationを用意する。
- その後の差分migrationを順番に適用できる形へ整理する。

メリット:

- ローカルDB / CI / 新規環境で `prisma migrate dev` が正しく動く。
- migration品質を検証できる。
- 今後のDB変更が安全になる。

デメリット:

- 既存Supabaseの `_prisma_migrations` 履歴と衝突する可能性がある。
- 過去migrationを単純に編集すると、既存DBとの整合性を壊す危険がある。
- baseline設計と適用手順を慎重に決める必要がある。

既存Supabaseへの影響:

- 直接変更すると危険。
- 本番/開発Supabaseには `migrate resolve` やbaseline方針を決めてから扱うべき。

### 案B: 現在のschemaからローカルDBを `prisma db push` で作る

内容:

- migration履歴の検証は一旦切り離し、ローカルDBへ現在schemaを直接反映する。

メリット:

- seed scriptや現在schemaの動作確認をすぐ行える。
- 空DBに現在schemaのテーブルを作れる。
- Supabaseへ触らずに検証できる。

デメリット:

- migration履歴の問題は残る。
- `migrate dev` の検証にはならない。
- migrationを本番へ安全適用する設計とは別問題になる。

既存Supabaseへの影響:

- ローカルDB限定で使うなら影響なし。

### 案C: Supabaseの現DBを基準にmigration履歴を再整理する

内容:

- Supabaseの現DB schemaを基準にbaselineを作り、Prisma migration履歴を整理する。
- 必要に応じて `prisma migrate diff`、baseline migration、`migrate resolve` を検討する。

メリット:

- 実運用DBとの整合を中心に整理できる。
- 今後のmigration運用を立て直せる。

デメリット:

- Supabaseの実DB調査が必要。
- 手順を誤るとmigration履歴や本番データに影響する。
- 今回のseed検証より大きい作業になる。

既存Supabaseへの影響:

- 高い。実行前にバックアップ、環境分離、適用対象確認が必須。

### 案D: Task030.9のseed検証だけを目的に、ローカルDBへ `prisma db push` してからseed実行する

内容:

- migration品質確認とは分けて、ローカルDBに現在schemaを `db push` で作る。
- その後、`scripts/seed-part-standard-masters.ts` を実行して標準マスター投入だけ確認する。

メリット:

- Task030.9の目的であるseed script検証には現実的。
- Supabaseへ触らず安全に確認できる。
- Task028のschema定義とTask030のseed scriptの整合を確認できる。

デメリット:

- migration履歴の問題は解決しない。
- migration適用確認とseed確認を分けて記録する必要がある。

既存Supabaseへの影響:

- ローカルDB限定なら影響なし。

## 推奨する次手順

短期では、Task030.9のseed script検証を進めるために案Dを推奨する。

理由:

- 現在の目的は標準部品マスターseedが実行できるかの確認。
- migration履歴の欠落問題は、seed scriptそのものの品質とは別問題。
- Supabaseへ誤適用しない安全性を優先できる。

ただし、別Taskとしてmigration履歴のbaseline整理を行うべき。

推奨分割:

1. Task030.9: ローカルDBに限定して `prisma db push` で現在schemaを反映し、seed scriptを実行確認する。
2. Task030.10: 既存Supabase schemaとPrisma schema / migration履歴の差分を調査する。
3. Task030.11: baseline migration / migrate resolve 方針を設計する。
4. Task030.12: migration履歴を空DBから再現可能にするか、既存DB baseline方式にするか決定する。

## 今回変更していないこと

- `prisma/schema.prisma` は変更していない。
- `prisma/migrations/**` は変更していない。
- DBは書き換えていない。
- `prisma migrate dev` は再実行していない。
- `prisma db push` は実行していない。
- seed scriptは実行していない。
- `.env` は変更していない。
- `package.json` は変更していない。
- UI / API / TypeScript / React は変更していない。
- stashは触っていない。
