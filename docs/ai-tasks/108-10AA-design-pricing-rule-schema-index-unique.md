# Task 108-10AA: PricingRule schema / index / unique 制約 設計

作成日: 2026-06-19

対象ブランチ: `wip-publiccase-workmaster-20260606`

前提 commit: `dd06d80 docs: investigate pricing rule structured rebuild impact`

## 目的

`PricingRule` を価格ルールとして残したまま、`RepairWorkName` との接続、検索 index、同一ルール判定、Cal / customerType / detailLabel の扱いを設計する。

今回の Task は docs のみである。`schema.prisma`、migration、seed、DB、API、UI、`RepairEntryForm`、`RepairLineItem` 実装、帳票、PDF、LINE、共有ページ、PublicCase、PartsMaster、`getPartsMatched`、PartsSearchPanel は変更しない。

## 参照した前提

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10Z-investigate-pricing-rule-structured-rebuild-impact.md`
- `prisma/schema.prisma`
- `prisma/migrations/20260611_add_structured_work_fields/migration.sql`
- `src/actions/master-actions.ts`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/masters/pricing/route.ts`
- `src/app/api/masters/pricing/[id]/route.ts`
- `src/app/(app)/masters/pricing/page.tsx`

## 現行 PricingRule schema

現行の `PricingRule` は次の field を持つ。

```prisma
model PricingRule {
  id                Int     @id @default(autoincrement())
  brandId           Int?
  modelId           Int?
  caliberId         Int?
  customerType      String?
  minPrice          Int
  maxPrice          Int
  suggestedWorkName String
  notes             String?

  repairWorkCategoryId Int?
  repairWorkCategory   RepairWorkCategory? @relation("PricingRuleWorkCategory", fields: [repairWorkCategoryId], references: [id])

  repairWorkActionId Int?
  repairWorkAction   RepairWorkAction? @relation("PricingRuleWorkAction", fields: [repairWorkActionId], references: [id])

  targetPartNameId String?
  targetPartName   PartNameMaster? @relation("PricingRuleTargetPartName", fields: [targetPartNameId], references: [id])

  detailLabel String?

  repairLineItems RepairLineItem[]

  @@index([repairWorkCategoryId])
  @@index([repairWorkActionId])
  @@index([targetPartNameId])
  @@index([repairWorkCategoryId, repairWorkActionId, targetPartNameId])
}
```

確認結果:

- `id` は autoincrement の primary key。
- `brandId`、`modelId`、`caliberId` は nullable Int。
- `customerType` は nullable String。
- `suggestedWorkName` は required String。
- `repairWorkCategoryId`、`targetPartNameId`、`repairWorkActionId`、`detailLabel` は構造化価格ルール用の field として存在する。
- `targetPartNameId` は `PartNameMaster.id` への参照であり、`PartsMaster.id` ではない。
- `minPrice`、`maxPrice` は required Int。
- `notes` は nullable String。
- `RepairLineItem.pricingRuleId` から参照されている。
- 現行 `PricingRule` には `createdAt` / `updatedAt` がない。
- 現行 `PricingRule` には業務上の `@@unique` がない。
- 現行 index は構造化 field 側のみで、brand / model / caliber / customerType には index がない。

## repairWorkNameId を追加するか

結論: `PricingRule.repairWorkNameId Int?` を追加する方針を推奨する。

理由:

- `PricingRule` は価格ルールであり、作業名マスタ本体ではない。
- 作業名の正規化本体は `RepairWorkName` である。
- 価格ルールの作業軸を `suggestedWorkName` の文字列だけに置き続けると、表記ゆれ、名称変更、B2B/B2C 表示名、検索 alias、移行互換の責務が混ざる。
- `repairWorkNameId` があると、価格ルールが「どの標準作業に対する価格か」を明示できる。
- `RepairWorkName` 側の `categoryId` / `targetPartNameId` / `actionId` / `detailLabel` / displayName を一貫して参照できる。

ただし、`repairWorkNameId` を追加しても既存の構造 field は残す。

残す field:

- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `suggestedWorkName`

残す理由:

- `RepairWorkName` 未接続の手入力ルール、旧データ、仮データ、移行途中データを扱える。
- 構造 field を直接使った score / fallback / review ができる。
- `RepairWorkName` 名称変更時にも、価格ルールの作業条件を急に失わない。
- `suggestedWorkName` を display / fallback / migration compat として残せる。

`RepairWorkName` 変更時の扱い:

- 帳票、共有ページ、PublicCase の表示は `RepairLineItem` snapshot を正とする。
- `RepairWorkName` や `PricingRule` を後から変更しても過去案件表示を勝手に変えない。
- `PricingRule.suggestedWorkName` は `RepairWorkName.standardName` から自動設定してよいが、主キー的な判定軸にはしない。

## RepairLineItem.repairWorkNameId

`PricingRule` の設計としては `PricingRule.repairWorkNameId` が主対象だが、次の schema 実装 Task では `RepairLineItem.repairWorkNameId Int?` も同時に検討する価値が高い。

推奨は追加である。

理由:

- `RepairLineItem` は案件ごとの実明細本体である。
- 既存の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabelSnapshot` / 各種 snapshot と併せて、選択時点の標準作業参照を残せる。
- `PricingRule` を削除、再生成、変更しても、明細がどの標準作業から来たかを追いやすい。

ただし帳票や PublicCase の表示元は引き続き snapshot とする。`repairWorkNameId` を表示の正本にしない。

## unique 制約方針

結論: 108-10AB 時点では DB の業務 `@@unique` は追加しない。アプリ側の同一ルール判定 helper と upsert 方針を先に固める。

候補になる同一ルール判定 field:

```txt
brandId
modelId
caliberId
customerType
repairWorkNameId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
detailLabel
```

DB unique を急がない理由:

- nullable field が多い。
- PostgreSQL の通常 unique は `NULL` を別値として扱うため、`NULL` を含む composite unique だけでは業務重複を防ぎきれない。
- `repairWorkNameId` がある rule と、同じ作業を構造 field だけで表した rule の衝突を DB unique だけで扱いにくい。
- Prisma schema では PostgreSQL の partial unique index や expression index を素直に `@@unique` として表現しにくい。
- 価格ルールの identity は、schema だけでなく search priority / fallback / review policy と一体で決める必要がある。

初期推奨:

- DB には業務 unique を置かない。
- `findEquivalentPricingRule` のような共通 helper を作り、create / update の同一判定を統一する。
- `repairWorkNameId` がある場合はそれを第一の作業軸にする。
- `repairWorkNameId` がない場合のみ、構造 field と `suggestedWorkName` fallback で判定する。
- `notes` は unique 判定に含めない。メモ差分で別価格ルールを作るなら、将来 `ruleVariant` などの明示 field を検討する。

将来案:

- データ運用が固まった後、raw SQL migration で partial unique index を置くことはあり得る。
- 例: `repairWorkNameId IS NOT NULL` の rule 用、`repairWorkNameId IS NULL` の構造 field rule 用を分ける。
- ただし初期段階では、DB 制約よりもデータ確認とアプリ側 upsert の明示性を優先する。

## index 方針

`getPricingRules` は次の条件を扱う想定にする。

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `repairWorkNameId`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

結論: 最初は過剰に composite index を増やさず、検索の入口に効く index と作業軸の index を置く。

推奨 index:

```prisma
@@index([brandId, modelId, caliberId])
@@index([brandId, customerType])
@@index([repairWorkNameId])
@@index([brandId, repairWorkNameId])
@@index([repairWorkCategoryId])
@@index([repairWorkActionId])
@@index([targetPartNameId])
@@index([repairWorkCategoryId, repairWorkActionId, targetPartNameId])
@@index([brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId])
```

考え方:

- brand は現行 `getPricingRules` でも実質必須に近い入口である。
- model / caliber は nullable で、指定値または null generic を含める検索になる。
- customerType は exact と null generic の優先に使うため、brand と組み合わせる。
- `repairWorkNameId` が入ると最も強い作業軸になるため単独 index と brand composite を置く。
- 構造 field の既存 index は維持する。
- `detailLabel` は nullable String で揺れやすいため、初期 index には入れない。必要なら将来追加する。
- PostgreSQL は複数 index の bitmap scan も使えるため、初期から全組み合わせ composite を作らない。

過剰に見える候補:

```prisma
@@index([brandId, modelId, caliberId, customerType, repairWorkNameId])
```

これは検索パターンが固まった後なら検討できる。ただし nullable field が多く、初期から置くと保守負荷に対して効果が読みにくい。

## Cal 設計

108-10X の現在の検索順:

1. `movementCaliberId`
2. `baseMovementCaliberId`
3. `watch.caliberId`
4. Cal なし

候補:

- A: 現行 `PricingRule.caliberId` だけを維持し、actual / base / watch / any は検索順で表す。
- B: `caliberRole` enum を追加する。例: `ACTUAL` / `BASE` / `WATCH` / `ANY`
- C: `PricingRule` に `movementCaliberId` / `baseMovementCaliberId` を分けて持つ。

結論:

- 短期: A を推奨する。
- 中期: A のまま `getPricingRulesByQuery` に Cal 候補配列と matchReason を持たせる。
- 長期: 実績 Cal / Base Cal / Watch Cal を価格ルール上で明示的に区別する業務要件が出た場合のみ B を再検討する。
- C は非推奨。時計側・ムーブメント側の概念を価格ルールに直接持ち込むと、価格ルールが案件構造に寄りすぎる。

短期で A を選ぶ理由:

- 現行 schema と 108-10X の実装思想に合う。
- `PricingRule.caliberId` を「どの Cal に対する価格か」という値として扱い、actual / base / watch は呼び出し側の優先順で表現できる。
- Cal なし generic を自然に残せる。
- schema 変更の面積を抑えられる。

## customerType 方針

結論: `customerType` は nullable のまま残し、null を generic とする。検索では exact match を generic より優先する。

推奨検索優先:

1. `customerType` exact match
2. `customerType = null`

B2B/B2C の価格差:

- B2B / B2C で価格差を持つ可能性は高い。
- ただし初期から required にしない。
- すべてのルールに customerType を強制すると、既存データや共通価格の扱いが不自然になる。

unique / index:

- app-side upsert の同一判定 field には含める。
- DB unique は置かない。
- index は `[brandId, customerType]` を推奨する。

値の整理:

- 将来は enum 化も検討できる。
- 現行は String? のまま、アプリ側で許容値を制限する方が影響が小さい。

## detailLabel 方針

結論: 初期は nullable String のまま、価格条件にも表示補助にも使える補助 field として扱う。

扱い:

- `repairWorkNameId` がある場合は `RepairWorkName.detailLabel` 由来の補助条件として使う。
- `repairWorkNameId` がない場合は構造 field の一部として fallback 判定に使う。
- `detailLabel` 単独を主キー的 identity にしない。
- 検索では exact 一致を加点対象にし、null は未分類・汎用として扱う。

リスク:

- nullable String は表記ゆれが起きる。
- 「ピン」「ピン交換」「1番受けピン」などが自由入力になると重複しやすい。

将来:

- 値の種類が増え、業務上の標準語彙として扱う必要が出たら `RepairWorkDetailMaster` を検討する。
- 初期段階で detail master を急がない。

## suggestedWorkName 方針

結論: `suggestedWorkName` は主キー的な判定軸から外す。ただし display / fallback / migration compat として残す。

役割:

- 旧 PricingRule の表示名。
- `repairWorkNameId` がない rule の fallback 名称。
- 価格候補 UI の互換表示。
- 仮データや移行途中データの保険。

自動作成時:

- `repairWorkNameId` がある場合は `RepairWorkName.standardName` を基本値として設定する。
- `RepairLineItem.itemNameSnapshot` がより実入力に近い場合は fallback として使う。
- `suggestedWorkName` だけで同一判定しない。

## 既存仮 PricingRule の扱い

結論: 現行の仮 PricingRule は、schema 方針確定後に削除・再生成を第一候補にする。複雑な migration script で救済しない。

理由:

- 現在の DB は本番データではなく仮データ前提である。
- 旧 `suggestedWorkName` 中心の rule を構造化価格ルールとして無理に補正すると、FMP 救済的な推定が通常 Repair の標準入力ルールに混ざる。
- schema / API / UI を直した後、実入力または最小 seed から作る方がきれい。

削除前に確認すること:

- `RepairLineItem.pricingRuleId` が `PricingRule.id` を参照している。
- 現行 relation は `onDelete` を明示していないため、参照されている PricingRule は削除に失敗する可能性がある。
- 削除前に `RepairLineItem.pricingRuleId` の参照件数を確認する。
- 仮 repair / line item を消すのか、`pricingRuleId` を null にするのか、DB 初期化でまとめて作り直すのかを決める。

推奨順序:

1. 108-10AB で schema を追加する。
2. DB を仮データ前提で整理する。
3. `RepairLineItem.pricingRuleId` 参照を確認する。
4. 仮 PricingRule を削除する。
5. 代表的な PricingRule seed を最小限だけ入れる。
6. 以後は Repair 入力から自動生成・更新される状態を検証する。

## 影響範囲

### RepairEntryForm

影響大。

`getPricingRules` の戻り値から `suggestedWorkName` / `minPrice` を使っている。今後は `repairWorkNameId`、構造 field、matchReason、Cal 優先順位を扱う必要がある。

### getPricingRules / master-actions

影響大。

現行は `getPricingRules(brandId, modelId, caliberId)` で、構造 field と customerType を使わない。今後は object query 化し、score / priority / fallback を明示する方がよい。

### PricingRule 自動作成・更新

影響大。

Repair 新規作成 API と更新 API で null の扱いが微妙に違う。共通 helper に寄せ、構造 field と `repairWorkNameId` を保存する必要がある。

### Repair API

影響大。

`EstimateItem` 由来の LABOR 行ではなく、正規化後の `RepairLineItem` 相当の情報から PricingRule を作る方が安全である。

### RepairLineItem

影響中。

既存の構造 field と snapshot は維持する。`repairWorkNameId` を追加する場合も、表示正本は snapshot のままにする。

### EstimateItem / 帳票 / PDF / LINE / 共有ページ

直接変更は避ける。

将来は `RepairLineItem` snapshot を正に寄せる。今回の PricingRule schema 設計で直接触らない。

### PublicCase

直接変更は避ける。

PublicCase は公開用 snapshot であり、PricingRule や RepairWorkName を直接表示正本にしない。

### PartsMaster / getPartsMatched / PartsSearchPanel

直接変更しない。

`targetPartNameId` は `PartNameMaster` の標準部品名、`partsMasterId` は `PartsMaster` の実部品であり、混同しない。

### seed / DB init / sample data

影響大。

仮 PricingRule は削除・再生成を基本にする。構造化後の代表 seed は最小限にする。

### tests

影響中から大。

必要な検証:

- schema validate
- PricingRule 同一判定 helper
- `repairWorkNameId` あり / なし
- customerType exact / generic
- Cal actual / base / watch / none 優先
- 構造 field fallback
- 仮 PricingRule 削除時の参照確認

## 推奨 schema 案

次の schema を 108-10AB の第一候補にする。

```prisma
model PricingRule {
  id                Int     @id @default(autoincrement())
  brandId           Int?
  modelId           Int?
  caliberId         Int?
  customerType      String?
  minPrice          Int
  maxPrice          Int
  suggestedWorkName String
  notes             String?

  repairWorkNameId Int?
  repairWorkName   RepairWorkName? @relation("PricingRuleWorkName", fields: [repairWorkNameId], references: [id])

  repairWorkCategoryId Int?
  repairWorkCategory   RepairWorkCategory? @relation("PricingRuleWorkCategory", fields: [repairWorkCategoryId], references: [id])

  repairWorkActionId Int?
  repairWorkAction   RepairWorkAction? @relation("PricingRuleWorkAction", fields: [repairWorkActionId], references: [id])

  targetPartNameId String?
  targetPartName   PartNameMaster? @relation("PricingRuleTargetPartName", fields: [targetPartNameId], references: [id])

  detailLabel String?

  repairLineItems RepairLineItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([brandId, modelId, caliberId])
  @@index([brandId, customerType])
  @@index([repairWorkNameId])
  @@index([brandId, repairWorkNameId])
  @@index([repairWorkCategoryId])
  @@index([repairWorkActionId])
  @@index([targetPartNameId])
  @@index([repairWorkCategoryId, repairWorkActionId, targetPartNameId])
  @@index([brandId, repairWorkCategoryId, targetPartNameId, repairWorkActionId])
}
```

`RepairWorkName` には逆 relation を追加する。

```prisma
pricingRules PricingRule[] @relation("PricingRuleWorkName")
```

`RepairLineItem.repairWorkNameId` を同時に入れる場合の案:

```prisma
repairWorkNameId Int?
repairWorkName   RepairWorkName? @relation("RepairLineItemWorkName", fields: [repairWorkNameId], references: [id])

@@index([repairWorkNameId])
```

`RepairWorkName` には逆 relation を追加する。

```prisma
repairLineItems RepairLineItem[] @relation("RepairLineItemWorkName")
```

この場合も `RepairLineItem` の既存 snapshot は削らない。

## migration / db push 方針

108-10AB では schema 変更と migration を行う。

推奨:

- Prisma migration を作る。
- `createdAt` / `updatedAt` は既存行に default を入れる。
- `repairWorkNameId` は nullable で追加する。
- 初期 migration で既存 `suggestedWorkName` から `repairWorkNameId` を無理に埋めない。
- 仮データ削除・seed 再投入は 108-10AG に分けてもよい。

## canonical docs 更新要否

結論: 108-10AA の結果により canonical docs は更新要。

理由:

- これまで canonical docs では `repairWorkNameId` 追加を「検討」としていた。
- 今回の設計で `PricingRule.repairWorkNameId` 追加推奨、DB unique 不採用、Cal role 不採用、customerType nullable generic が明確になった。
- この方針は今後の実装 Task の前提になるため、実装前または 108-10AB 完了時に `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` へ反映するのがよい。

ただし、今回はユーザー指定に従い canonical docs は変更しない。

## 次の実装 Task 推奨

次は **108-10AB: PricingRule schema/index/unique 制約 実装** を推奨する。

108-10AB の範囲:

- `PricingRule.repairWorkNameId` 追加
- `RepairWorkName.pricingRules` relation 追加
- `PricingRule.createdAt` / `updatedAt` 追加
- 推奨 index 追加
- DB unique は追加しない
- `RepairLineItem.repairWorkNameId` を同時追加するか最終判断し、追加するなら relation / index を入れる
- migration 作成
- `npx prisma validate`
- TypeScript 影響確認

108-10AB で触らない方がよいもの:

- `RepairEntryForm`
- Repair API の自動作成・更新 logic
- 帳票 / PDF / LINE / 共有ページ
- PublicCase
- PartsMaster / PartsSearchPanel / `getPartsMatched`

その次:

- 108-10AC: PricingRule 構造化保存設計
- 108-10AD: PricingRule 構造化保存実装
- 108-10AE: getPricingRules 構造 field 検索設計
- 108-10AF: getPricingRules 構造 field 検索実装
- 108-10AG: 仮 PricingRule 削除 / seed 再投入

## 結論

`PricingRule` は価格ルールとして残す。作業名の正規化本体は `RepairWorkName` とし、価格ルールには `repairWorkNameId` を追加する。ただし、既存の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` / `suggestedWorkName` は fallback と検索補助のため残す。

DB unique は初期実装では置かない。nullable field と fallback が多いため、同一ルール判定はアプリ側 helper で統一する。index は brand / model / caliber / customerType / repairWorkNameId / 構造 field を中心に、過剰な composite を避けて始める。

Cal は短期では現行 `caliberId` のみを維持し、actual / base / watch / Cal なしは検索順で表現する。customerType は nullable generic を残し、exact を generic より優先する。detailLabel は nullable String の補助条件として始め、将来必要なら detail master 化を検討する。
