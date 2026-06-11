# Task 108-9C: 構造化内装作業入力の schema差分実装

## 1. 目的

Task 108-9B の設計に基づき、構造化内装作業入力を保存するためのschema差分を実装した。

入力構造:

```txt
RepairWorkCategory
+ PartNameMaster
+ RepairWorkAction
+ detail
+ price
-> RepairLineItem snapshot
```

このTaskではschema差分とmigration SQL作成のみを対象にし、UI / API / 保存処理 / 帳票 / PublicCase は変更していない。

## 2. 変更ファイル

```txt
prisma/schema.prisma
prisma/migrations/20260611_add_structured_work_fields/migration.sql
docs/ai-tasks/108-9C-implement-structured-work-schema-diff.md
```

## 3. 追加した RepairLineItem フィールド

`RepairWorkCategory.id` / `RepairWorkAction.id` は `Int`、`PartNameMaster.id` は `String @id @default(cuid())` であることを確認し、型を合わせた。

```txt
repairWorkCategoryId Int?
repairWorkCategory RepairWorkCategory?

repairWorkActionId Int?
repairWorkAction RepairWorkAction?

targetPartNameId String?
targetPartName PartNameMaster?

detailLabelSnapshot String?
categoryNameSnapshot String?
targetPartNameSnapshot String?
actionNameSnapshot String?
```

追加したindex:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
repairWorkCategoryId + repairWorkActionId + targetPartNameId
```

## 4. 追加した PricingRule フィールド

`PricingRule` は価格ルールとして残し、`suggestedWorkName` は削除・変更していない。

```txt
repairWorkCategoryId Int?
repairWorkCategory RepairWorkCategory?

repairWorkActionId Int?
repairWorkAction RepairWorkAction?

targetPartNameId String?
targetPartName PartNameMaster?

detailLabel String?
```

追加したindex:

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
repairWorkCategoryId + repairWorkActionId + targetPartNameId
```

## 5. 追加しなかったもの

以下は追加していない。

```txt
EstimateItem.repairLineItemId
EstimateItemへの構造化ID
EstimateItemへのB2B/B2C snapshot
RepairLineItem.repairWorkNameId
PricingRule.repairWorkNameId
RepairWorkName seed
RepairWorkDetailMaster
部品名 x 処置 の全組み合わせ
```

## 6. EstimateItemを変更しなかった理由

EstimateItemは見積発行時点のスナップショットであり、既存帳票・納品書・請求書・共有ページの表示元として使われている。

このTaskでは既存表示を壊さないため、EstimateItemは変更しなかった。構造化入力はまず RepairLineItem 側に持たせる。

## 7. RepairWorkName seedを作らない方針

今回も `RepairWorkName` seed は作っていない。

```txt
RepairWorkName seed
-> 作らない

部品名 x 処置 の全組み合わせ
-> 作らない
```

`repairWorkNameId` も 108-9B の DEFER 方針に従い、今回のschema差分から外した。

## 8. 既存表示・既存導線を変更していないこと

以下は変更していない。

```txt
既存帳票表示
PDF表示
LINE送信内容
共有ページ表示
PublicCase表示
既存UI
既存API
既存保存処理
既存EstimateItem表示仕様
既存PricingRule.suggestedWorkName互換動作
RepairEntryForm
帳票/PDF/LINE/共有ページ関連ファイル
PublicCase関連ファイル
```

## 9. migration実行結果

作成したmigration:

```txt
prisma/migrations/20260611_add_structured_work_fields/migration.sql
```

最初にローカルDBを明示して `migrate dev` を実行した。

```txt
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public
DIRECT_URL=同上
SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public
```

結果:

```txt
npx prisma migrate dev --name add_structured_work_fields
-> failed
```

失敗理由:

```txt
P3006
Migration `20260427_add_repair_movement_fields` failed to apply cleanly to the shadow database.
P1014: The underlying table for model `Repair` does not exist.
```

shadow DBで既存過去migrationが現在のローカルDB状態と噛み合わず失敗したため、本番/リモートDBへは切り替えず、ローカルDB向けの `db push` に切り替えた。

初回確認時は `localhost:54322` のPostgreSQLが起動していなかった。

初回確認結果:

```txt
Test-NetConnection localhost -Port 54322
-> TcpTestSucceeded: False

docker ps
-> 起動中コンテナなし
```

その後、Dockerで `clock-repair-postgres` を起動し、`localhost:54322` への接続確認に成功した。

最終確認結果:

```txt
clock-repair-postgres
-> 起動済み

Test-NetConnection localhost -Port 54322
-> TcpTestSucceeded: True

npx prisma db push
-> success

LASTEXITCODE
-> 0
```

ローカルDBへのschema反映は `npx prisma db push` で完了した。

本番/リモートDBには触っていない。

## 10. prisma validate / generate / tsc の結果

```txt
npx prisma validate
-> success

npx prisma generate
-> success

npx tsc --noEmit --pretty false --incremental false
-> success

LASTEXITCODE
-> 0
```

Prismaコマンドはサンドボックス内でengine取得に失敗したため、承認付きで再実行して成功した。

## 11. 残課題

このTaskのschema差分について、ローカルDBへの `db push`、`prisma validate`、`prisma generate`、`tsc` は成功済み。

本番反映前には、今回作成したmigration SQLとローカルDB状態を再確認し、本番/リモートDBへ直接 `db push` しないこと。

## 12. 変更しなかったもの

```txt
RepairEntryForm
API routes
保存処理
帳票/PDF/LINE/共有ページ
PublicCase
EstimateItem
RepairWorkName seed
RepairWorkDetailMaster
PricingRule.suggestedWorkName
本番/リモートDB
```
