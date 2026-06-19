# Task 108-10AB: PricingRule schema / index 実装

作成日: 2026-06-19

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

108-10AA の設計に基づき、`PricingRule` を `RepairWorkName` へ接続できるようにする。

今回は schema / relation / index の最小実装のみを行う。API、UI、seed、DB データ、PricingRule 自動作成・更新、`getPricingRules` は変更しない。

## 変更ファイル

- `prisma/schema.prisma`
- `prisma/migrations/20260619_add_pricing_rule_work_name/migration.sql`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AB-implement-pricing-rule-schema-index.md`

## schema 変更内容

`PricingRule` に以下を追加した。

```prisma
repairWorkNameId Int?
repairWorkName   RepairWorkName? @relation("PricingRuleWorkName", fields: [repairWorkNameId], references: [id])
```

`RepairWorkName` に inverse relation を追加した。

```prisma
pricingRules PricingRule[] @relation("PricingRuleWorkName")
```

`PricingRule` に timestamp を追加した。

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

既存の以下 field は残した。

- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `suggestedWorkName`
- `customerType`
- `caliberId`

`RepairLineItem.repairWorkNameId` は今回追加していない。今回の対象を PricingRule schema / relation / index に限定したため。

## index 追加内容

追加した index:

```prisma
@@index([brandId, modelId, caliberId])
@@index([brandId, customerType])
@@index([repairWorkNameId])
@@index([brandId, repairWorkNameId])
@@index([brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId])
```

既存の構造 field index は維持した。

```prisma
@@index([repairWorkCategoryId])
@@index([repairWorkActionId])
@@index([targetPartNameId])
@@index([repairWorkCategoryId, repairWorkActionId, targetPartNameId])
```

`detailLabel` 単独 index と、`brandId / modelId / caliberId / customerType / repairWorkNameId` の大型 composite index は追加していない。nullable field が多く、検索パターンが確定してから追加判断する方が安全なため。

## migration / DB 反映方針

既存 repo には `prisma/migrations` があり、直近の schema 変更では migration SQL を残しつつ、ローカル DB 反映は `db push` を使うことがあった。

今回はユーザー指定に従い、DB 反映は実行していない。

追加した migration SQL は以下を行う。

- `PricingRule.repairWorkNameId` を nullable で追加
- `PricingRule.createdAt` / `updatedAt` を追加
- 既存行向けに `updatedAt` を backfill してから NOT NULL 化
- 検索 index を追加
- `PricingRule.repairWorkNameId` から `RepairWorkName.id` への FK を追加

## unique 制約を追加しなかった理由

業務 `@@unique` は追加していない。

理由:

- `brandId` / `modelId` / `caliberId` / `customerType` / `repairWorkNameId` / 構造 field に nullable が多い。
- PostgreSQL の通常 unique は `NULL` を別値として扱うため、業務上の重複防止になりきらない。
- `repairWorkNameId` ありの rule と、構造 field fallback の rule を同じ DB unique で安全に扱いにくい。
- Prisma schema では partial unique index を素直に表現しづらい。

同一価格ルール判定は、後続 Task でアプリ側 helper に寄せる。

## 変更しなかったもの

- API
- UI
- `RepairEntryForm`
- `RepairLineItem` の field / 保存処理
- PricingRule 自動作成・更新処理
- `getPricingRules`
- seed
- DB データ
- 帳票 / PDF / LINE / 共有ページ
- PublicCase
- PartsMaster
- `getPartsMatched`
- PartsSearchPanel
- `caliberRole`
- `PricingRule.movementCaliberId`
- `PricingRule.baseMovementCaliberId`

`targetPartNameId` は引き続き LABOR 行の対象部品名 ID であり、`PartNameMaster` 由来である。`partsMasterId` は PART 行の実部品 ID であり、`PartsMaster` 由来である。今回も混同していない。

## canonical docs 更新内容

`docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` に、108-10AA / 108-10AB で確定した PricingRule schema 方針を追記した。

追記した要点:

- 108-10AA で方針が決まったこと
- 108-10AB で `PricingRule.repairWorkNameId` を schema に追加したこと
- 業務 `@@unique` は初期では置かず、アプリ側 helper で同一判定すること
- Cal 設計は短期では `caliberId` 1 本を維持すること
- 既存仮 PricingRule はまだ削除していないこと
- 次は PricingRule 自動作成・更新 / `getPricingRules` の構造化対応へ進むこと

## 検証結果

実行結果:

```txt
npx prisma validate: OK
npx prisma generate: OK
npx tsc --noEmit --pretty false --incremental false: OK
```

`npx prisma generate` は初回、既存の Next.js dev server が Prisma Client の `query_engine-windows.dll.node` を掴んでいたため `EPERM` で失敗した。対象 repo の `npm run dev` / `next dev` 系 node process のみ停止し、再実行して成功した。

DB 反映:

```txt
未実行
```

## 注意点 / 後続 Task

- `PricingRule.repairWorkNameId` は nullable なので既存仮データはそのまま残る。
- 既存仮 PricingRule はまだ削除していない。
- DB にはまだ反映していない。
- `RepairLineItem.pricingRuleId` が既存 PricingRule を参照している可能性があるため、仮 PricingRule 削除前には参照確認が必要。
- `RepairLineItem.repairWorkNameId` を追加するかは、明細 snapshot / 表示正本の方針を再確認してから別 Task で扱う。

後続候補:

- 108-10AC: PricingRule 構造化保存設計
- 108-10AD: PricingRule 構造化保存実装
- 108-10AE: getPricingRules 構造 field 検索設計
- 108-10AF: getPricingRules 構造 field 検索実装
- 108-10AG: 仮 PricingRule 削除 / seed 再投入
