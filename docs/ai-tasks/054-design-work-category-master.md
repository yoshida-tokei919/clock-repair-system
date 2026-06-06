# AI Task 054: 作業内容カテゴリ導入のための既存構造調査と設計

## 目的

公開事例投稿・検索機能へ進む前に、業務アプリ側で作業内容をカテゴリ分けするための既存構造を調査し、最小差分で導入できる設計方針を整理する。

今回は調査と設計のみ。Prisma schema、migration、API、UI、seed、既存実装は変更しない。

## 確認したファイル

- `prisma/schema.prisma`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/(app)/repairs/new/page.tsx`
- `src/app/(app)/repairs/[id]/page.tsx`
- `src/app/(app)/repairs/[id]/edit/page.tsx`
- `src/actions/master-actions.ts`
- `src/app/api/masters/pricing/route.ts`
- `src/app/api/masters/pricing/[id]/route.ts`
- `src/app/(app)/masters/pricing/page.tsx`
- `src/lib/estimate-item.ts`
- `src/lib/masterData.ts`
- `src/lib/part-input-options.ts`
- `scripts/seed-part-standard-masters.ts`
- 参考: `docs/ai-tasks/011-design-part-helper-selection-persistence.md`
- 参考: `docs/ai-tasks/027-5-audit-and-redesign-parts-master-masters.md`

## 既存の作業明細構造

### DB構造

作業明細は `Repair` 直下ではなく、`Repair -> Estimate -> EstimateItem` として保存される。

`Estimate` の主な集計項目:

- `technicalFee`
- `mechanicCost`
- `partsTotal`
- `discountAmount`
- `shipping`
- `taxAmount`
- `totalAmount`

`EstimateItem` の主な項目:

- `id`
- `estimateId`
- `itemName`
- `quantity`
- `unitPrice`
- `type`
- `orderStatus`
- `orderedAt`
- `partsMasterId`
- `createdAt`

`EstimateItem.type` はコメント上 `part` / `labor` を想定している。作業カテゴリ、作業マスタID、PricingRule ID、明細カテゴリIDのような項目はない。

### RepairEntryForm上の構造

`RepairEntryForm.tsx` では、画面内 state として `LineItem` を持つ。

主な項目:

- `id`
- `category`
- `partType`
- `name`
- `price`
- `cost`
- `quantity`
- `partRef`
- `spec`
- `grade`
- `note1`
- `note2`
- `cousinsNumber`
- `stockQuantity`
- `supplierName`
- `status`
- `partsMasterId`

`LineItem.category` は以下の union として定義されている。

- `internal`
- `external`
- `part_internal`
- `part_external`
- `part_generic`

ただし、現在の追加UIでは `addItemCategory` が `internal | part_external` で、実質的には「技術料」と「交換部品」を切り替える用途が中心。

保存payloadでは次のように `type` が作られる。

- `category.includes("part")` なら `type: "part"`
- それ以外なら `type: "labor"`

payloadには `category` も含まれるが、DBの `EstimateItem` に `category` カラムがないため、明細カテゴリとしては永続化されない。既存見積を再表示すると、技術料は `internal`、部品は `part_external` として再構成される。

### 保存時の構造

新規作成 `src/app/api/repairs/route.ts` と更新 `src/app/api/repairs/[id]/route.ts` は、見積明細を次の形で `EstimateItem` に保存する。

- `itemName: item.name`
- `type: item.type`
- `unitPrice: item.price`
- `quantity: item.quantity`
- `partsMasterId: item.partsMasterId`

`category`, `partType`, `cost`, `grade`, `note1`, `note2`, `partRef`, `cousinsNumber`, `stockQuantity` は、部品明細の場合に `PartsMaster` 同期へは使われるが、`EstimateItem` の明細属性としては保存されない。

更新時は既存 `EstimateItem` を `deleteMany` してから `createMany` で再作成する。明細単位の追加カラムを入れる場合、この再作成フローに保存項目を追加する必要がある。

## 既存のPricingRule構造

`PricingRule` は現在、技術料候補に最も近い構造として使われている。

主な項目:

- `id`
- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `minPrice`
- `maxPrice`
- `suggestedWorkName`
- `notes`

`PricingRule` に `category`, `type`, `workCategoryId`, `workCategoryKey` 相当の項目はない。

`src/actions/master-actions.ts` の `getPricingRules(brandId, modelId, caliberId)` は、ブランドを必須にして、モデル・キャリバー一致を優先しながら `PricingRule` を返す。`RepairEntryForm.tsx` はこれを技術料候補として `workOpts` に変換し、`suggestedWorkName` と `minPrice` を候補名・金額として使う。

`getWorkMasters()` と `upsertWorkMaster()` も `PricingRule` を WorkMaster 風に扱う実装になっている。ただし `upsertWorkMaster()` の引数には `category: internal | external` があるものの、実際の `PricingRule` には保存先がなく、この category は永続化されていない。

`src/app/api/masters/pricing/route.ts` と `src/app/api/masters/pricing/[id]/route.ts` の管理APIも、ブランド・モデル・キャリバー・作業名・価格帯・顧客種別・メモのみを扱っている。Pricing管理画面にも作業カテゴリ入力はない。

## 作業名候補の持ち方

現在の技術料候補は、主に `PricingRule.suggestedWorkName` から取得される。

流れ:

1. `RepairEntryForm` でブランド、モデル、キャリバー、ムーブメント情報を選ぶ。
2. 明細追加種別が `internal` の場合、`getPricingRules()` を呼ぶ。
3. 返ってきた `PricingRule` を `workOpts` に変換する。
4. `AdvancedCombobox` で候補選択または自由入力する。
5. 作業名と価格を明細に追加する。
6. 保存時、labor明細の作業名が `PricingRule` に存在しなければ自動作成し、存在する場合は価格を更新する。

つまり、作業名は「PricingRule候補選択 + 自由入力 + 保存時にPricingRuleへ学習」の構造。作業名専用の `WorkNameMaster` はまだ存在しない。

`src/lib/masterData.ts` に `WORK_DB` と `WorkItem.category: internal | external` があるが、これはモック/レガシー用途に見える。現在のRepairEntryFormの主要経路はPrismaの `PricingRule` を使っている。

## 作業カテゴリ相当フィールドの有無

作業内容カテゴリとして使える永続フィールドは現状ない。

既存の似ている項目:

- `EstimateItem.type`: `labor` / `part` の大分類。作業内容カテゴリではない。
- `RepairEntryForm.LineItem.category`: UI上の技術料/部品判定。DB明細には保存されない。
- `PartsMaster.category`: 部品カテゴリ/互換分類。作業カテゴリではない。
- `PartCategoryMaster` / `PartNameMaster`: 部品標準マスタ。作業カテゴリではない。
- `Repair.workSummary`: 診断/作業概要の自由記述。カテゴリ検索には不向き。
- `PricingRule.notes`: メモ。カテゴリ保存先に流用すると検索・整合性が弱い。
- `RepairPhoto.category`: 写真分類。作業カテゴリではない。

`internal` / `external` は、作業内容カテゴリではなく、現状では主に技術料/部品、内装/外装、部品同期の文脈で使われている。作業カテゴリに流用すると意味が混線する。

## WorkCategoryMaster案

追加する場合は、既存の `PartCategoryMaster` と同じく `key` を安定識別子にして、表示順と有効/無効を持たせるのが自然。

案:

```prisma
model WorkCategoryMaster {
  id           String   @id @default(cuid())
  key          String   @unique
  name         String
  displayOrder Int      @default(0)
  isActive     Boolean  @default(true)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

初期カテゴリ候補:

| key | name |
| --- | --- |
| `overhaul` | オーバーホール |
| `movement_repair` | ムーブメント修理 |
| `accuracy_adjustment` | 精度調整 |
| `glass` | ガラスまわり |
| `crown_stem` | リューズ・巻芯まわり |
| `hands_dial` | 針・文字盤まわり |
| `case_bracelet` | ケース・ブレスまわり |
| `waterproof` | 防水・水入り |
| `exterior_parts` | 外装部品 |
| `custom_fabrication` | 部品製作・加工 |
| `other` | その他 |

補足:

- `id` は `PartCategoryMaster` と揃えて `String @default(cuid())` が扱いやすい。
- `key` はseed、将来の公開タグ変換、外部出力で安定的に使う。
- 表示名変更に備え、公開事例タグ側は `name` ではなく `key` または明示的なmappingで接続する。

## 案A: PricingRuleに紐づける

概要:

- `PricingRule` に nullable な `workCategoryId` を追加する。
- 技術料候補ごとにカテゴリを持たせる。
- RepairEntryFormで作業候補を選択した時にカテゴリを自動補完できる。

メリット:

- 現在の技術料候補取得経路に自然に乗る。
- 「作業名候補を選ぶとカテゴリが自動で入る」という希望に合う。
- Pricing管理画面で既存候補にカテゴリを付ける導線を作りやすい。
- 自由入力された作業名がPricingRuleへ自動登録される既存動作と相性がよい。

デメリット:

- PricingRuleはブランド/モデル/キャリバー/顧客種別/価格帯のルールであり、作業名マスタとしてはやや役割が混ざっている。
- 同じ作業名が複数ブランド・複数価格で重複する場合、カテゴリを各PricingRuleへ重複登録する必要がある。
- 既存PricingRuleのカテゴリ整理が必要。
- PricingRuleにカテゴリを足すだけでは、案件ごとの実作業カテゴリは永続化されない。候補変更後に過去案件の意味が変わる可能性がある。

評価:

- 最初のUI補助としては効果が高い。
- ただし公開事例検索へ正確につなぐには、最終的に明細または投稿側へカテゴリを保存する必要がある。

## 案B: Repair line itemに紐づける

概要:

- `EstimateItem` に nullable な `workCategoryId` を追加する。
- labor明細ごとに実作業カテゴリを保存する。
- 既存の作業明細保存payloadに `workCategoryId` を加える。

メリット:

- 案件ごとの実作業カテゴリが保存される。
- 公開事例タグへの変換元として安定する。
- PricingRuleの候補カテゴリが後から変わっても、保存済み案件のカテゴリが変わらない。
- 自由入力の作業名でも、カテゴリだけは明細に保存できる。

デメリット:

- `EstimateItem` の保存/復元/API/PDF周辺の影響確認が必要。
- 更新時に `EstimateItem` を全削除・再作成しているため、保存payloadに載らないカテゴリは消える。
- 作業候補選択時の自動補完には、PricingRule側または別マスタ側のカテゴリ情報も必要。
- 部品明細にもカテゴリを持たせるか、labor明細だけに限定するかを決める必要がある。

評価:

- 公開事例検索への接続には最も直接的。
- ただし、UIでカテゴリを自動補完するには案Aとの併用が現実的。

## 案C: WorkNameMasterを新設する

概要:

- `WorkNameMaster` を新設し、作業名とカテゴリを管理する。
- `PricingRule` は価格条件、`WorkNameMaster` は作業名標準化、`EstimateItem` は実績明細として役割を分離する。

例:

```prisma
model WorkNameMaster {
  id             String @id @default(cuid())
  key            String @unique
  name           String
  workCategoryId String
  displayOrder   Int    @default(0)
  isActive       Boolean @default(true)

  workCategory   WorkCategoryMaster @relation(fields: [workCategoryId], references: [id])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

メリット:

- 作業名の表記ゆれを防ぎやすい。
- PricingRuleの価格ルールと作業名カテゴリを分離できる。
- 将来的な公開事例タグ、作業分析、検索UIに拡張しやすい。

デメリット:

- 変更範囲が大きい。
- PricingRuleとの関連、既存PricingRuleからの移行、自由入力の扱いを設計する必要がある。
- RepairEntryForm、Pricing管理画面、seed/APIの追加が大きくなりやすい。

評価:

- 長期的には最もきれい。
- 今回の「最小差分で業務アプリ側のカテゴリ整理を始める」目的には重い。

## 最小差分の推奨案

推奨は「段階的に A + B へ進める」こと。

最初に `WorkCategoryMaster` を追加し、次に `PricingRule.workCategoryId` を追加する。これで既存の技術料候補にカテゴリを付けられ、RepairEntryFormでは作業名候補を選んだ時にカテゴリを自動表示・自動選択できる。

その後、公開事例投稿に進む前に `EstimateItem.workCategoryId` を追加し、案件ごとの実作業カテゴリを保存する。公開事例検索へつなぐ元データとしては、PricingRuleではなく保存済み明細のカテゴリを使う。

理由:

- 現在の作業名候補はPricingRuleが担っているため、最初の入力補助はPricingRuleにカテゴリを付けるのが最小。
- ただしPricingRuleは候補/価格ルールであり、実績ではないため、公開事例用にはEstimateItemに保存する方が安全。
- WorkNameMasterは最終形として魅力があるが、今入れると移行・UI・APIの変更範囲が大きい。

実装時の最小スキーマ案:

```prisma
model WorkCategoryMaster {
  id           String   @id @default(cuid())
  key          String   @unique
  name         String
  displayOrder Int      @default(0)
  isActive     Boolean  @default(true)

  pricingRules PricingRule[]
  estimateItems EstimateItem[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

`PricingRule` への追加候補:

```prisma
workCategoryId String?
workCategory   WorkCategoryMaster? @relation(fields: [workCategoryId], references: [id])
```

`EstimateItem` への追加候補:

```prisma
workCategoryId String?
workCategory   WorkCategoryMaster? @relation(fields: [workCategoryId], references: [id])
```

インデックス候補:

- `WorkCategoryMaster.key`
- `WorkCategoryMaster.displayOrder`
- `PricingRule.workCategoryId`
- `EstimateItem.workCategoryId`

## 公開事例タグとの関係

業務カテゴリをそのままB2C検索タグに使う必要はない。業務アプリ側は作業分類・料金候補・実績管理に使いやすい粒度にし、公開事例側では閲覧者に伝わりやすい粒度へmappingする。

例:

| 業務カテゴリ | 公開事例用検索タグ |
| --- | --- |
| `movement_repair` ムーブメント修理 | 止まり・精度不良 |
| `accuracy_adjustment` 精度調整 | 止まり・精度不良 |
| `glass` ガラスまわり | ガラスまわり |
| `crown_stem` リューズ・巻芯まわり | リューズ・巻芯まわり |
| `waterproof` 防水・水入り | 防水・水入り |
| `hands_dial` 針・文字盤まわり | 針・文字盤まわり |
| `case_bracelet` ケース・ブレスまわり | ケース・ブレスまわり |
| `custom_fabrication` 部品製作・加工 | 部品製作・加工 |

将来は `PublicCaseTagMaster` または mapping テーブル/定義を別に持つのがよい。

候補:

- `PublicRepairTagMaster`
- `WorkCategoryPublicTagMap`

ただし最初はコード定義または投稿機能側の変換関数から始めてもよい。重要なのは、公開用タグ名を業務カテゴリ名に直結しないこと。

## UIへの影響

最小方針:

- まず既存候補である `PricingRule` にカテゴリを付ける。
- `RepairEntryForm` では、技術料候補を選ぶと `workCategoryId` が自動で入る。
- カテゴリは最初から大きな入力欄にせず、小さな表示/選択補助にする。
- 必要ならカテゴリで候補を絞り込めるようにする。
- 自由入力時はカテゴリ未設定を許容しつつ、可能なら `other` を初期値にする。

注意点:

- 現在の `LineItem.category` という名前は、技術料/部品判定の意味で使われている。作業カテゴリには `workCategoryId` / `workCategoryKey` という別名を使い、既存の `category` と混ぜない。
- labor明細だけに作業カテゴリを付けるか、部品明細にも関連カテゴリを付けるかは分けて考える。まずは labor明細を対象にするのが安全。
- 部品交換だけの案件でも公開事例では「ガラスまわり」「リューズ・巻芯まわり」などが必要になる可能性があるため、将来的には部品カテゴリから作業カテゴリを補助推定する余地を残す。

## 実装フェーズ案

### Phase 1: WorkCategoryMaster追加

- Prismaに `WorkCategoryMaster` を追加する。
- 既存の `PartCategoryMaster` と同じく `key` + 表示順 + 有効/無効で管理する。
- この時点では既存テーブルへの紐づけを急がず、マスタだけを作る選択も可能。

### Phase 2: seedで作業カテゴリ初期値投入

- 初期カテゴリをseedする。
- `key` は公開タグ変換にも使うため、最初に安定させる。
- 表示順は業務入力でよく使う順にする。

### Phase 3: PricingRuleにworkCategoryId追加

- 既存の技術料候補にカテゴリを付与する。
- Pricing管理画面でカテゴリを選べるようにする。
- `getPricingRules()` の返却に `workCategoryId` / `workCategory` を含める。
- RepairEntryFormの候補選択時にカテゴリを自動反映できるようにする。

### Phase 4: EstimateItemにworkCategoryId追加

- RepairEntryFormの `LineItem` に `workCategoryId` を追加する。
- 保存payloadに `workCategoryId` を含める。
- 新規/更新APIの `EstimateItem` create/createManyに `workCategoryId` を追加する。
- 詳細ページのincludeで `workCategory` を取得し、編集/表示時に復元する。

### Phase 5: 投稿機能の公開タグへ変換

- 修理案件詳細から公開事例投稿を作る際、`EstimateItem.workCategoryId` を元に公開タグ候補を出す。
- 業務カテゴリと公開タグのmappingを別に持つ。
- 投稿時に必要なら公開タグを手動調整できるようにする。

## 安全な着手順

最小差分で進めるなら、次の順が安全。

1. `WorkCategoryMaster` とseedだけを追加し、既存動作へ影響しない状態を作る。
2. `PricingRule.workCategoryId` を追加して、既存技術料候補へカテゴリを付ける。
3. RepairEntryFormでは、まずカテゴリの自動表示/候補絞り込みだけを行う。
4. 投稿機能へ入る前に `EstimateItem.workCategoryId` を追加し、案件ごとの実績カテゴリを保存する。
5. 公開事例タグ変換は、`EstimateItem.workCategoryId` を元に別mappingで行う。

## リスクと注意点

- `LineItem.category` は既に別用途で使われているため、作業カテゴリ名に流用しない。
- `EstimateItem` にカテゴリがないため、現状では保存後にフォーム上の明細カテゴリ情報が失われる。
- 保存APIは更新時に `EstimateItem` を全削除・再作成するため、明細に追加する新フィールドは必ずpayloadとcreateManyへ含める必要がある。
- labor明細保存時に `PricingRule` が自動作成/更新されるため、カテゴリ未設定のPricingRuleが増える可能性がある。
- 同じ `suggestedWorkName` が複数PricingRuleに存在する場合、カテゴリがばらつく可能性がある。
- PricingRuleを作業名マスタとして使い続けると、価格条件と作業名標準化の責務が混ざる。将来、重複や表記ゆれが増えたらWorkNameMasterへ移行する。
- 部品カテゴリと作業カテゴリは別概念。`PartCategoryMaster` を作業カテゴリに流用しない。
- 公開事例タグはB2C向けの粒度にする。業務カテゴリ名をそのまま公開タグとして固定しない。
- PDF/帳票系は主に `EstimateItem.itemName`, `unitPrice`, `quantity`, `partsMaster.grade`, `partsMaster.notes2` を参照しているため、カテゴリ追加自体の表示影響は小さいが、includeや型の変更時には確認が必要。
- 既存データは本格利用前でも、nullable追加から始めると移行リスクが低い。

## 今回やらなかったこと

- Prisma schema変更
- migration作成
- API追加/変更
- UI変更
- seed作成
- 既存コードのリファクタリング
- git add / commit / push
- `.next-dev.err.log` の変更
