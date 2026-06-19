# Task 108-10AB-fix-local-seed-part-name-master

作成日: 2026-06-19

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

ローカル DB reset 後でも、RepairEntryForm の技術料入力で「対象部品」候補が表示されるようにする。

対象部品候補は LABOR 行の `targetPartNameId` であり、`PartNameMaster` 由来である。PART 行の実部品 `partsMasterId` / `PartsMaster` とは混同しない。

## 原因

`PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` の seed データと専用 script は存在していた。

```txt
src/lib/part-input-options.ts
-> PART_CATEGORIES / PART_NAME_OPTIONS

scripts/seed-part-standard-masters.ts
-> PartCategoryMaster / PartNameMaster / PartGradeMaster を key upsert
```

しかし、通常の `npx prisma db seed` は `prisma/seed.ts` だけを実行する設定で、`scripts/seed-part-standard-masters.ts` を呼んでいなかった。

そのため、ローカル DB reset 後に通常 seed だけを実行すると、`RepairWorkCategory` と `RepairWorkAction` は復元される一方、`PartNameMaster` が復元されず、RepairEntryForm の対象部品候補が空になっていた。

RepairEntryForm 側は以下に依存している。

- `getRepairWorkCategories()`
- `getRepairWorkActions()`
- `getInternalPartNameMasters()`
- `src/lib/repair-work-target-part-filter.ts` の category key -> target part key mapping

作業カテゴリ `movement` の mapping は存在し、`movement` key の `PartNameMaster` が seed されれば候補が出る状態だった。

## 変更ファイル

- `prisma/seed.ts`
- `scripts/seed-part-standard-masters.ts`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AB-fix-local-seed-part-name-master.md`

## 変更内容

`scripts/seed-part-standard-masters.ts` を、単体実行も維持しつつ関数として再利用できる形にした。

```ts
export async function seedPartStandardMasters(client: PrismaClient = prisma)
```

`prisma/seed.ts` から `seedPartStandardMasters(prisma)` を呼ぶようにした。

これにより、通常の `npx prisma db seed` で以下が復元される。

- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`

seed は引き続き key upsert で冪等に動く。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- API
- UI 見た目
- `RepairEntryForm`
- `PricingRule` schema / relation / index
- PricingRule 自動作成・更新処理
- `getPricingRules`
- `RepairLineItem` 保存仕様
- `PartsMaster`
- `getPartsMatched`
- PartsSearchPanel
- 帳票 / PDF / LINE / 共有ページ
- PublicCase

## 検証結果

実行結果:

```txt
npx prisma validate: OK
npx prisma generate: OK
npx prisma db seed: OK
npx tsc --noEmit --pretty false --incremental false: OK
```

`npx prisma generate` は初回、起動中の Next.js dev server が Prisma Client の DLL を掴んでいたため `EPERM` で失敗した。対象 repo の dev server process のみ停止し、再実行して成功した。

`npx prisma db seed` は初回、Prisma engine 取得がサンドボックス内ネットワーク制限に当たり失敗した。許可付きで同じコマンドを再実行して成功した。

seed ログ:

```txt
Repair work actions seeded: 15件
Repair work categories seeded: 11件
PartCategoryMaster upserted: 17
PartNameMaster upserted: 234
PartGradeMaster upserted: 3
Suppliers seeded: 10件
```

seed 後の件数:

```txt
PartCategoryMaster: 17
PartNameMaster: 234
PartGradeMaster: 3
RepairWorkCategory: 11
RepairWorkAction: 15
```

`movement` の対象部品候補確認:

```txt
RepairWorkCategory.name = movement: exists, isActive = true
PartNameMaster.key = movement: exists, isActive = true
PartNameMaster.category.key = movement
PartNameMaster.category.partType = part_internal
```

## 注意点

作業開始時点で、未追跡の一時確認ファイルが存在していた。

```txt
tmp-check-masters.ts
tmp-check-part-names.ts
```

これらは `tsc` の対象に入って失敗原因になっていたため、確認付きで削除した。

画面確認は試行したが、`/repairs/new` はログイン画面へリダイレクトされた。
seed の admin は `passwordHash = hashed_password_here` のダミー値で、現行 NextAuth は bcrypt compare を使うため、そのままではログインできない。
今回の Task 外で認証 seed やログイン仕様を変更しないため、フォーム画面の操作確認は未実施とした。

DB 上は `movement` の対象部品候補が復元されているため、RepairEntryForm の対象部品候補は表示される前提。

## 後続 Task への影響

DB reset 後も通常 seed で `PartNameMaster` が復元されるため、今後の `RepairWorkName.targetPartNameId` / `PricingRule.targetPartNameId` / `RepairLineItem.targetPartNameId` の検証が安定する。

今後も `targetPartNameId` は `PartNameMaster` 由来、`partsMasterId` は `PartsMaster` 由来として分けて扱う。
