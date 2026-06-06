# AI Task 107-10: RepairLineItem schema設計案

## 概要

Task 107-8 / 107-9で決定したB-2方針に基づき、`RepairLineItem` 新設のためのPrisma schema設計案を作成する。

このTaskでは、まだ `prisma/schema.prisma` は変更しない。schema/code/API/UI/seed/DB操作は行わず、Markdown設計のみ行う。

結論:

- `RepairLineItem` は現行schemaの主キー方針に合わせ、初期案では `Int @id @default(autoincrement())` とする。
- `Repair` / `PartsMaster` / `PricingRule` とはrelationを張る。
- 作業マスタは正式model名・ID型が未確定のため、初期schemaではrelationを張らない。
- `EstimateItem` には将来的に `repairLineItemId` を追加する案を採用候補にする。ただし、表示時に `RepairLineItem` を後読みしない。
- `DeliveryNote` / `Invoice` / `PublicCase` への直接relationは、初期 `RepairLineItem` schemaには入れない。

## 107-8 / 107-9の決定事項

107-8の決定:

```txt
RepairLineItem
→ 通常Repairの正式な案件明細本体

EstimateItem
→ 見積発行時点のスナップショット

PublicCase
→ RepairLineItemなどの明細スナップショットから生成する公開用スナップショット
```

107-9の決定:

- 初期typeは `labor` / `part` に絞る。
- `relatedWorkLineItemId` で部品明細から技術料明細へ紐づける。
- `PartsMaster.grade` / `notes2` 後読みを避けるため、部品表示補助は `RepairLineItem` 側にsnapshot保存する。
- `EstimateItem` は `RepairLineItem` から生成される見積時点snapshotとして扱う。
- `DeliveryNoteLineItem` / `InvoiceLineItem` は後続課題とし、初期 `RepairLineItem` schemaへ混ぜない。

正本方針:

- 作業マスタは入力補助・標準化の元データであり、帳票・共有ページ・PublicCaseへ直接表示しない。
- PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
- PublicCaseは公開用スナップショットであり、RepairやEstimateItemの直表示にしない。
- FMP過去案件の救済ルールを、新アプリ通常Repairへ持ち込まない。

## enum設計

### RepairLineItemType

初期採用案:

```prisma
enum RepairLineItemType {
  LABOR
  PART
}
```

検討:

- Prisma enumは既存の `PublicCaseSourceType` などと同じく大文字値にする方が現行schemaと揃う。
- アプリ表示や変換時に、現行 `EstimateItem.type = 'labor' / 'part'` へ写す。
- 将来候補として `DISCOUNT` / `ADJUSTMENT` / `SHIPPING` / `TAX_ADJUSTMENT` はあり得るが、初期実装では入れない。

初期実装で `LABOR` / `PART` に絞る理由:

- 現行 `EstimateItem` は `labor` / `part` のみ。
- 値引き、送料、税調整は `Estimate` の集計項目や請求設計と絡む。
- 先に正式な作業明細・部品明細を作ることが目的であり、調整行まで同時に広げると責務が膨らむ。

### RepairLineItemSource

候補:

```prisma
enum RepairLineItemSource {
  MANUAL
  PRICING_RULE
  PARTS_MASTER
  WORK_MASTER
  MIGRATED
}
```

判断:

- 初期schemaには入れない。
- `source` は分析・レビュー・移行確認には有用だが、正式明細の最小保存には必須ではない。
- FMP過去案件はPublicCase側の救済・生成が中心であり、新アプリ通常Repairの通常明細に `FMP_IMPORT` を混ぜない。
- 将来必要になった場合は、`RepairLineItemSource` enumまたは文字列sourceとして追加する。

### RepairLineItemReviewStatus

候補:

```prisma
enum RepairLineItemReviewStatus {
  APPROVED
  REVIEW
  REJECTED
}
```

判断:

- 初期schemaには入れない。
- `RepairLineItem` は業務上の正式明細であり、PublicCase公開レビューとは分ける。
- PublicCase化のレビュー状態は、原則 `PublicCase` / `PublicCaseWorkItem` / `PublicCasePartItem` 側で持つ。
- 将来、通常Repair明細にもレビュー状態が必要になった場合のみ追加する。

## RepairLineItem model案

現行schemaは `Repair.id` / `PartsMaster.id` / `PricingRule.id` / `EstimateItem.id` が `Int @default(autoincrement())` であるため、初期案では `RepairLineItem.id` も `Int` に揃える。

初期schema候補:

```prisma
enum RepairLineItemType {
  LABOR
  PART
}

model RepairLineItem {
  id       Int                @id @default(autoincrement())
  repairId Int
  repair   Repair             @relation(fields: [repairId], references: [id], onDelete: Cascade)

  lineType RepairLineItemType

  partsMasterId Int?
  partsMaster   PartsMaster? @relation(fields: [partsMasterId], references: [id], onDelete: SetNull)

  pricingRuleId Int?
  pricingRule   PricingRule? @relation(fields: [pricingRuleId], references: [id], onDelete: SetNull)

  // Work master is not finalized yet. Do not add a relation until the model is decided.
  workMasterId String?

  relatedWorkLineItemId Int?
  relatedWorkLineItem   RepairLineItem?  @relation("RepairLineItemRelatedWork", fields: [relatedWorkLineItemId], references: [id], onDelete: SetNull)
  relatedPartLineItems  RepairLineItem[] @relation("RepairLineItemRelatedWork")

  itemNameSnapshot              String
  internalNameSnapshot          String?
  estimateDisplayNameSnapshot   String
  b2bDisplayNameSnapshot        String?
  b2cDisplayNameSnapshot        String?
  workCategoryPathSnapshot      String?
  partCategoryPathSnapshot      String?
  gradeNameSnapshot             String?
  notesForCustomerSnapshot      String?

  quantity Int @default(1)
  unitPrice Int @default(0)
  amount    Int @default(0)

  showPriceB2b Boolean @default(false)
  showPriceB2c Boolean @default(false)

  sortOrder Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([repairId])
  @@index([repairId, sortOrder])
  @@index([repairId, lineType])
  @@index([partsMasterId])
  @@index([pricingRuleId])
  @@index([relatedWorkLineItemId])
}
```

補足:

- `taxRate` / `taxable` / `showOnEstimate` などは107-9では初期候補だったが、107-10の最小schema案では後回し候補に寄せる。
- 理由は、まず正式明細本体を作り、既存 `EstimateItem` 中心コードへの影響を小さくするため。
- 帳票ごとの表示フラグは重要だが、初期実装で使わない列を増やすより、107-11後の影響調査で追加判断する方が安全。

## Repair relation案

`Repair` には次のrelationを追加する案を第一候補にする。

```prisma
repairLineItems RepairLineItem[]
```

関係:

```txt
Repair
↓
RepairLineItem
↓ 見積作成時にコピー
EstimateItem
```

現行の `Repair -> Estimate -> EstimateItem` 導線はすぐに消さない。

初期移行では:

- 新しい正式明細は `RepairLineItem` に保存する。
- 見積書は当面 `EstimateItem` を読み続ける。
- 見積作成/再発行時に `RepairLineItem` から `EstimateItem` を生成する。
- 既存帳票・共有ページの読み取り元変更は、別Taskで段階化する。

onDelete方針:

- `RepairLineItem.repair` は `onDelete: Cascade` を第一候補にする。
- Repair削除時に案件明細だけ残っても意味が薄いため。
- ただし、将来本番運用でRepair物理削除を制限するなら、実害は小さい。

## PartsMaster relation案

`RepairLineItem` のpart行は `partsMasterId` を持てるようにする。

```prisma
partsMasterId Int?
partsMaster   PartsMaster? @relation(fields: [partsMasterId], references: [id], onDelete: SetNull)
```

`PartsMaster` 側には次の逆relationを追加する案を第一候補にする。

```prisma
repairLineItems RepairLineItem[]
```

方針:

- `partsMasterId` はnullable。
- 未マスタ部品、自由入力部品、後から部品マスタ登録する部品を保存できるようにする。
- `PartsMaster` が削除または切り離されても、過去明細の表示はsnapshotで残す。
- 表示名、グレード、顧客向け注記は `RepairLineItem` 側のsnapshotを正とする。

`PartsMaster.grade` / `notes2` 後読み対策:

- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `partCategoryPathSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

これらを `RepairLineItem` に保存することで、PartsMaster現在値の変更で過去帳票・共有ページ・PublicCase下書きが変わることを避ける。

## PricingRule relation案

`RepairLineItem` のlabor行は `pricingRuleId` を持てるようにする。

```prisma
pricingRuleId Int?
pricingRule   PricingRule? @relation(fields: [pricingRuleId], references: [id], onDelete: SetNull)
```

`PricingRule` 側には次の逆relationを追加する案を第一候補にする。

```prisma
repairLineItems RepairLineItem[]
```

方針:

- `pricingRuleId` はnullable。
- 自由入力価格、作業マスタdefault価格、特別対応価格でも保存できるようにする。
- PricingRuleは価格ルールであり、作業マスタ本体ではない。
- `PricingRule.suggestedWorkName` は移行期fallbackや価格候補名として参照するに留める。
- 過去表示は `RepairLineItem.itemNameSnapshot` / `estimateDisplayNameSnapshot` / `unitPrice` / `amount` を正とする。

注意:

- `PricingRule` を後で変更しても、過去 `RepairLineItem` の表示名・価格を変えない。
- 将来的にPricingRuleへ `workNameId` を追加する可能性はあるが、このTaskでは扱わない。

## WorkMaster relation案

作業マスタmodel名は未確定。

候補:

- `InternalWorkMaster`
- `ExternalWorkMaster`
- `RepairWorkMaster`
- `WorkNameMaster`

方針:

- 初期 `RepairLineItem` schemaでは、作業マスタへのrelationは張らない。
- 正式model名・ID型・内装/外装の持ち方が決まってからrelationを追加する。
- ただし、将来接続を見越して `workMasterId String?` の暫定scalarを置く案は採用候補として残す。

初期案で `workMasterId String?` を入れる場合:

- relationなしの参照メモとして扱う。
- 作業マスタ未実装期間はnull。
- 帳票・共有ページ・PublicCase表示では使わない。

慎重案:

- 107-11の初回schema実装では `workMasterId` 自体も入れない。
- 作業マスタ設計確定後に、正式な型とrelationで追加する。

推奨:

- **schema案としては `workMasterId String?` を候補に書くが、107-11で実装するかは直前に再確認する。**
- 無理にrelationは張らない。

## relatedWorkLineItemId設計

`relatedWorkLineItemId` は、部品明細を対応する技術料明細へ紐づける自己参照。

```prisma
relatedWorkLineItemId Int?
relatedWorkLineItem   RepairLineItem?  @relation("RepairLineItemRelatedWork", fields: [relatedWorkLineItemId], references: [id], onDelete: SetNull)
relatedPartLineItems  RepairLineItem[] @relation("RepairLineItemRelatedWork")
```

用途:

- `part` 明細が、どの `labor` 明細に対応する交換部品かを表す。
- B2B PublicCaseで、関連WorkItemあり部品だけ価格表示候補にする。
- PublicCase生成時に `PublicCasePartItem.relatedWorkItemId` へ変換する。

制約:

- Prisma schemaだけでは、関連先が `lineType = LABOR` であることを制限できない。
- 同一Repair内の明細だけを参照する制約も、通常のPrisma relationだけでは表現しにくい。

対応:

- アプリ側validationで制御する。
- 保存時に、`lineType = PART` の場合のみ `relatedWorkLineItemId` を許可する。
- 関連先は同じ `repairId` かつ `lineType = LABOR` に限定する。
- `relatedWorkLineItemId = null` の部品は、B2B PublicCase価格表示対象にしない。

onDelete方針:

- `onDelete: SetNull` を第一候補にする。
- 関連先laborが削除されても、部品明細自体は残し、未紐づけとして再確認できるようにする。

## EstimateItem relation案

`EstimateItem` は見積発行時点のスナップショットとして残す。

追加候補:

```prisma
model EstimateItem {
  // existing fields...
  repairLineItemId Int?
  repairLineItem   RepairLineItem? @relation(fields: [repairLineItemId], references: [id], onDelete: SetNull)

  @@index([repairLineItemId])
}
```

`RepairLineItem` 側の逆relation候補:

```prisma
estimateItems EstimateItem[]
```

方針:

- `repairLineItemId` はnullable。
- 既存EstimateItemや手入力見積明細との互換を保つ。
- 見積再発行時に、同じ `RepairLineItem` から複数の `EstimateItem` が作られる可能性がある。
- `EstimateItem` 表示時は `RepairLineItem` を後読みしない。
- `repairLineItemId` は追跡・差分比較・再発行時の元明細確認に使う。

注意:

- 現行 `Estimate.repairId @unique` のままでは見積版数管理が弱い。
- 見積版数の本格整理は別Taskにする。
- 107-11で `RepairLineItem` だけ実装する場合、`EstimateItem.repairLineItemId` 追加を同時に入れるかは要確認。

## DeliveryNote / Invoice relation方針

初期 `RepairLineItem` schemaでは、`DeliveryNote` / `Invoice` への直接relationを持たせない。

理由:

- 現行 `DeliveryNote` は独立した明細モデルを持たない。
- 現行 `Invoice` も `InvoiceItem` を持たず、Repair/DeliveryNote/EstimateItemから都度集計している。
- 納品書・請求書は発行済み文書として、将来的には発行時点スナップショットを別に検討するべき。
- `RepairLineItem` にDeliveryNote/Invoice relationを先に入れると、正式明細と発行済み文書snapshotの責務が混ざる。

将来候補:

- `DeliveryNoteLineItem`
- `InvoiceLineItem`
- `DeliveryNote.sourceSnapshot`
- `Invoice.sourceSnapshot`
- 月次請求用の納品書単位集計snapshot

初期方針:

- `RepairLineItem` は納品書・請求書の集計元候補に留める。
- 発行時点固定は、後続Taskで別モデルまたはsnapshotとして設計する。

## PublicCase relation方針

初期 `RepairLineItem` schemaでは、`PublicCase` / `PublicCaseWorkItem` / `PublicCasePartItem` への直接relationを持たせない。

理由:

- PublicCaseは公開用スナップショットであり、表示時にRepairLineItemを後読みしない。
- FMP由来PublicCaseと新アプリ通常Repair由来PublicCaseの生成経路を混ぜすぎない。
- 公開レビュー、除外、コピー表記除外、B2B/B2C表示調整はPublicCase側の責務。

将来候補:

- `PublicCaseWorkItem.sourceRepairLineItemId`
- `PublicCasePartItem.sourceRepairLineItemId`
- `PublicCase.sourceSnapshot` 内にRepairLineItem IDとsnapshotを保持

初期方針:

- PublicCase下書き生成時に `RepairLineItem` を読む。
- 生成後のPublicCase表示はPublicCase自身のsnapshotを正とする。
- source IDを列として持つかJSON snapshotに持つかは、PublicCase下書き生成設計で決める。

## index設計

初期index案:

```prisma
@@index([repairId])
@@index([repairId, sortOrder])
@@index([repairId, lineType])
@@index([partsMasterId])
@@index([pricingRuleId])
@@index([relatedWorkLineItemId])
```

採用理由:

- `repairId`: Repair詳細、帳票生成、共有ページ、PublicCase下書き生成で必須。
- `repairId, sortOrder`: 案件内の表示順取得で使う。
- `repairId, lineType`: 案件内でlabor/partを分けて取得する。
- `partsMasterId`: 部品発注・在庫連動・部品利用履歴で使う可能性が高い。
- `pricingRuleId`: 価格ルール利用履歴や調整で使う可能性がある。
- `relatedWorkLineItemId`: 部品から関連作業を辿る、または未紐づけ部品を抽出するために使う。

見送るindex:

- `@@index([sortOrder])`: 単独sortOrder検索は想定しない。
- `@@index([lineType])`: 全Repair横断でtypeだけ検索する頻度は低い。必要なら後で追加。

## nullable方針

| 項目 | 方針 | 理由 |
|---|---|---|
| `repairId` | required | Repair正式明細なので必須。 |
| `lineType` | required | labor/part判定に必須。 |
| `partsMasterId` | nullable | 未マスタ部品・自由入力部品を許容する。 |
| `pricingRuleId` | nullable | 手入力価格・作業マスタdefault価格を許容する。 |
| `workMasterId` | nullable | 作業マスタ未確定のため。 |
| `relatedWorkLineItemId` | nullable | 未紐づけ部品やlabor明細ではnull。 |
| `itemNameSnapshot` | required | 互換・fallback表示に必須。 |
| `estimateDisplayNameSnapshot` | required | 帳票用表示名として必須。 |
| `internalNameSnapshot` | nullable | 初期はfallback可能。 |
| `b2bDisplayNameSnapshot` | nullable | fallback可能。 |
| `b2cDisplayNameSnapshot` | nullable | fallback可能。 |
| `workCategoryPathSnapshot` | nullable | 作業マスタ未実装期間はnull。 |
| `partCategoryPathSnapshot` | nullable | 部品マスタ未整備・自由入力に備える。 |
| `gradeNameSnapshot` | nullable | グレードなし部品がある。 |
| `notesForCustomerSnapshot` | nullable | 注記なし部品がある。 |
| `quantity` | default 1 | 現行EstimateItemと揃える。 |
| `unitPrice` | default 0 | 手入力途中や未価格明細を許容する。 |
| `amount` | default 0 | 保存時に計算するが初期値を持つ。 |
| `showPriceB2b` | default false | 公開価格の誤表示を避ける。 |
| `showPriceB2c` | default false | B2C PublicCase価格非表示方針と揃える。 |
| `sortOrder` | default 0 | 既存データや初期入力に備える。 |

## 初期実装に入れる項目

初期実装候補:

- `RepairLineItemType`
- `RepairLineItem`
- `Repair.repairLineItems`
- `PartsMaster.repairLineItems`
- `PricingRule.repairLineItems`

`RepairLineItem` に入れる項目:

- `id`
- `repairId`
- `lineType`
- `partsMasterId`
- `pricingRuleId`
- `workMasterId`
- `relatedWorkLineItemId`
- `itemNameSnapshot`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `workCategoryPathSnapshot`
- `partCategoryPathSnapshot`
- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `quantity`
- `unitPrice`
- `amount`
- `showPriceB2b`
- `showPriceB2c`
- `sortOrder`
- `createdAt`
- `updatedAt`

初期に入れる理由:

- Repairの正式明細として最低限成立する。
- labor/partを分けられる。
- 作業マスタ・部品マスタ・PricingRuleとの将来接続に備えられる。
- 帳票・共有ページ・PublicCase下書きに必要な表示名snapshotを持てる。
- `PartsMaster.grade` / `notes2` 後読み問題の解消に向けた保存先を用意できる。

## 後回しにする項目

後回し項目:

- `taxRate`
- `taxable`
- `source`
- `reviewStatus`
- `showOnEstimate`
- `showOnDeliveryNote`
- `showOnInvoice`
- `showOnCustomerPage`
- `showOnPublicCase`
- `publicCaseDisplayNameSnapshot`
- `partsMasterRefSnapshot`
- `supplierRefSnapshot`
- `manufacturerRefSnapshot`
- `sizeSnapshot`
- `colorSnapshot`
- `materialSnapshot`
- `conditionSnapshot`
- `genuineTypeSnapshot`
- `notesForInternalSnapshot`
- `internalMemo`
- `customerMemo`
- `publicMemo`
- `DeliveryNoteLineItem`
- `InvoiceLineItem`
- `PublicCaseWorkItem.sourceRepairLineItemId`
- `PublicCasePartItem.sourceRepairLineItemId`

後回し理由:

- 107-11では `prisma/schema.prisma` の最小変更に絞るため。
- 使わない列を先に増やすと、RepairEntryForm、帳票、共有ページ、PublicCase生成の同時変更を誘発しやすい。
- 税率・表示フラグは重要だが、現行見積・帳票集計との整合を別Taskで確認してから追加した方が安全。
- PublicCase専用項目はPublicCase下書き生成設計で決める。
- 納品書・請求書の発行時点スナップショットは、RepairLineItemとは別責務として設計する。

## migration実装前の注意

107-11でschema実装へ進む場合も、以下を守る。

- `prisma/schema.prisma` の変更だけに絞る。
- migration作成、db push、seed実装は行わない。
- RepairEntryFormを同時に触らない。
- APIを同時に触らない。
- 帳票/PDF/LINE送信処理を同時に触らない。
- PublicCase生成ロジックを同時に触らない。
- 既存 `EstimateItem` 中心コードへの影響を小さく分割する。
- WorkMaster未確定のまま作業マスタrelationを張らない。
- PublicCaseをRepairLineItem直表示にしない。

## 次Task案

Task 107-11:

`RepairLineItem` schema実装。

ただし、107-11では `prisma/schema.prisma` の変更のみに絞る。

107-11で入れる候補:

- `RepairLineItemType`
- `RepairLineItem`
- `Repair.repairLineItems`
- `PartsMaster.repairLineItems`
- `PricingRule.repairLineItems`

107-11でまだ触らない候補:

- RepairEntryForm
- API
- 帳票/PDF/LINE送信
- PublicCase生成
- seed
- migration
- db push

## 未解決事項

- 107-11で `workMasterId String?` を入れるか、作業マスタ確定まで完全に後回しにするか。
- 107-11で `EstimateItem.repairLineItemId` まで入れるか、RepairLineItem本体だけにするか。
- `RepairLineItemType` を大文字enum値にするか、現行文字列互換を重視して小文字文字列にするか。
- `taxRate` / `taxable` を初期schemaに含めるか。
- 帳票別表示フラグをいつ追加するか。
- 見積版数をどう扱うか。
- `DeliveryNoteLineItem` / `InvoiceLineItem` 相当を作るか。
- `PublicCaseWorkItem` / `PublicCasePartItem` にsource line item IDを持たせるか。

## 変更しなかったもの

- prisma/schema.prisma の変更なし
- migration作成なし
- db pushなし
- seed実装なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- PricingRule変更なし
- PublicCase生成ロジック変更なし
- 帳票/PDF/LINE送信処理変更なし
- テスト修正なし
- git addなし
- commitなし
- pushなし
