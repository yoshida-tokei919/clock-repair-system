# AI Task 107-9: RepairLineItem新設前提の詳細設計

## 概要

Task 107-8で、明細受け皿はB-2を採用すると決定した。

つまり、通常Repairの正式な案件明細本体は `RepairLineItem` とし、`EstimateItem` は見積発行時点のスナップショットとして残す。

このTaskでは、schema変更前に `RepairLineItem` の責務、type、項目案、周辺モデルとの関係、最小実装セットを整理する。

このTaskでは、schema/code/API/UI/seed/DB操作は行わない。Markdown設計のみ。

## 107-8の決定事項

107-8の採用方針:

```txt
RepairLineItem
→ 通常Repairの正式な案件明細本体

EstimateItem
→ 見積発行時点のスナップショット

DeliveryNote / Invoice
→ 将来的には発行時点スナップショットを検討

PublicCase
→ 公開用スナップショット
```

A案、つまり `EstimateItem` を拡張して案件明細本体も兼ねる案は、最終方針としては不採用。

B-3は、既存 `EstimateItem` 中心実装からの互換・段階移行手段としてのみ許容する。B-3を使う場合でも、正となる明細は `RepairLineItem` と明記する。

## RepairLineItemの責務

`RepairLineItem` は、通常Repairに紐づく正式な案件明細本体。

責務:

- 案件に紐づく作業明細と部品明細を保持する。
- 作業マスタ、部品マスタ、PricingRuleの参照IDを持つ。
- 帳票・共有ページ・PublicCase下書きに渡す表示名をスナップショットとして持つ。
- 数量、単価、金額、税率、表示フラグ、価格表示フラグを保持する。
- `EstimateItem` の生成元になる。
- 納品書、請求書、共有ページ、PublicCase下書きの主な元データになる。
- 作業マスタや部品マスタの現在値が変わっても、過去表示が勝手に変わらないようにする。

責務ではないもの:

- 見積発行時点の正本そのもの。これは `EstimateItem` の責務。
- PublicCaseの公開表示そのもの。これは `PublicCaseWorkItem` / `PublicCasePartItem` の責務。
- 部品在庫・仕入・原価管理そのもの。これは `PartsMaster` など部品マスタ側の責務。
- 作業候補や表示名defaultの本体。これは将来の作業マスタ側の責務。
- PricingRule本体。PricingRuleは価格ルールとして残す。

## type設計

現行 `EstimateItem.type` は `labor` / `part` を持つ。

`RepairLineItem` でも type 相当を持つ。項目名は将来の読みやすさを優先するなら `lineType` がよい。ただし現行互換を重視するなら `type` でもよい。

候補:

| type候補 | 用途 | 初期採用 |
|---|---|---|
| `labor` | 技術料・作業明細 | yes |
| `part` | 部品明細 | yes |
| `discount` | 値引き | no |
| `adjustment` | 調整額 | no |
| `shipping` | 送料 | no |
| `tax_adjustment` | 税調整 | no |

初期方針:

- 初期実装は `labor` / `part` に絞る。
- 値引き、送料、調整額は現行 `Estimate` の集計項目や別設計との関係があるため後回し。
- 将来拡張を考える場合でも、type列は文字列またはenum化候補として設計し、初期データは2種に限定する。

## labor明細項目案

技術料明細は、作業マスタとPricingRuleから候補・価格を選び、保存時に表示名と価格を `RepairLineItem` へ固定する。

| 項目名案 | 必要区分 | 用途 |
|---|---|---|
| `id` | 必須 | 明細行ID。 |
| `repairId` | 必須 | 親Repair。 |
| `lineType` | 必須 | `labor`。 |
| `workMasterId` | 初期 | 将来の作業マスタ参照。作業マスタ未実装時はnullable。 |
| `workCategoryId` | 後回し | 作業カテゴリを別IDで持つ場合。 |
| `workNameId` | 後回し | 作業名マスタを分ける場合。 |
| `pricingRuleId` | 初期 | 価格候補として選んだPricingRule参照。自由入力時はnullable。 |
| `partsMasterId` | 後回し | 技術料自体には原則不要。対象部品を直接紐づける場合のみ検討。 |
| `relatedWorkLineItemId` | 後回し | labor同士の親子関係が必要な場合。初期はpart側だけでよい。 |
| `itemNameSnapshot` | 必須 | 互換用・汎用表示名。初期値は帳票表示名と同じでよい。 |
| `internalNameSnapshot` | 初期 | 社内管理名。 |
| `estimateDisplayNameSnapshot` | 必須 | 見積書・納品書向け表示名。 |
| `b2bDisplayNameSnapshot` | 初期 | B2B共有・B2B PublicCase向け表示名。 |
| `b2cDisplayNameSnapshot` | 初期 | B2C共有・B2C PublicCase向け表示名。 |
| `publicCaseDisplayNameSnapshot` | 後回し | 公開事例だけ文言を変える場合。 |
| `workCategoryPathSnapshot` | 初期 | 作業カテゴリ階層の保存値。 |
| `quantity` | 必須 | 数量。技術料は通常1。 |
| `unitPrice` | 必須 | 単価。 |
| `amount` | 必須 | `quantity * unitPrice` の保存値。 |
| `taxRate` | 初期 | 税率。将来税率変更に備える。 |
| `taxable` | 初期 | 課税対象か。 |
| `showOnEstimate` | 初期 | 見積書へ表示するか。 |
| `showOnDeliveryNote` | 初期 | 納品書へ表示するか。 |
| `showOnInvoice` | 初期 | 請求対象にするか。 |
| `showOnCustomerPage` | 初期 | 共有ページへ表示するか。 |
| `showOnPublicCase` | 後回し | PublicCase候補にするか。初期は生成時レビューで判断してもよい。 |
| `showPriceB2b` | 初期 | B2Bで価格表示候補にするか。 |
| `showPriceB2c` | 初期 | B2Cで価格表示候補にするか。PublicCaseではfalse寄り。 |
| `source` | 後回し | `workMaster` / `pricingRule` / `manual` / `import` など。 |
| `reviewStatus` | 後回し | PublicCase下書き化や候補レビュー用。 |
| `sortOrder` | 必須 | 表示順。 |
| `internalMemo` | 後回し | 社内メモ。公開・帳票には出さない。 |
| `customerMemo` | 後回し | 顧客向け補足。 |
| `publicMemo` | 後回し | PublicCase向け補足。 |
| `createdAt` | 必須 | 作成日時。 |
| `updatedAt` | 必須 | 更新日時。 |

初期方針:

- `workMasterId` は作業マスタ未実装の間nullable前提。
- `pricingRuleId` は価格候補の出所として保存するが、表示名・価格は必ずsnapshotを正にする。
- 帳票・共有ページでは作業マスタやPricingRuleを後読みしない。

## part明細項目案

部品明細は、部品マスタを在庫・発注・部品実体への参照として残しつつ、帳票・共有ページ・PublicCaseで使う表示名・グレード・注記を `RepairLineItem` に固定する。

| 項目名案 | 必要区分 | 用途 |
|---|---|---|
| `id` | 必須 | 明細行ID。 |
| `repairId` | 必須 | 親Repair。 |
| `lineType` | 必須 | `part`。 |
| `partsMasterId` | 初期 | 部品マスタ参照。自由入力・未登録部品ではnullable。 |
| `workMasterId` | 後回し | 部品明細自体には原則不要。 |
| `pricingRuleId` | 後回し | 部品明細には原則不要。 |
| `relatedWorkLineItemId` | 初期 | 対応する技術料明細への紐づけ。 |
| `itemNameSnapshot` | 必須 | 互換用・汎用表示名。 |
| `internalNameSnapshot` | 初期 | 社内用部品名。 |
| `estimateDisplayNameSnapshot` | 必須 | 帳票用部品表示名。 |
| `b2bDisplayNameSnapshot` | 初期 | B2B共有・B2B PublicCase向け表示名。 |
| `b2cDisplayNameSnapshot` | 初期 | B2C共有・B2C PublicCase向け表示名。 |
| `publicCaseDisplayNameSnapshot` | 後回し | 公開事例専用表示名。 |
| `partCategoryPathSnapshot` | 初期 | 部品カテゴリ階層の保存値。 |
| `gradeNameSnapshot` | 初期 | 現行 `PartsMaster.grade` 後読みを置き換える。 |
| `notesForCustomerSnapshot` | 初期 | 現行 `PartsMaster.notes2` の顧客表示用途を置き換える。 |
| `notesForInternalSnapshot` | 後回し | 社内用注記。公開・帳票には出さない。 |
| `partsMasterRefSnapshot` | 後回し | 部品Ref、管理番号など。 |
| `supplierRefSnapshot` | 後回し | 仕入先品番。通常は帳票に出さない。 |
| `manufacturerRefSnapshot` | 後回し | メーカーRef。 |
| `sizeSnapshot` | 後回し | サイズ。外装部品や風防などで重要。 |
| `colorSnapshot` | 後回し | 色。文字盤・ベルトなどで重要。 |
| `materialSnapshot` | 後回し | 素材。外装部品で重要。 |
| `conditionSnapshot` | 後回し | 新品/中古/代替など。 |
| `genuineTypeSnapshot` | 後回し | 純正/FIT/合わせなど。 |
| `quantity` | 必須 | 数量。 |
| `unitPrice` | 必須 | 単価。 |
| `amount` | 必須 | `quantity * unitPrice` の保存値。 |
| `taxRate` | 初期 | 税率。 |
| `taxable` | 初期 | 課税対象か。 |
| `showOnEstimate` | 初期 | 見積書へ表示するか。 |
| `showOnDeliveryNote` | 初期 | 納品書へ表示するか。 |
| `showOnInvoice` | 初期 | 請求対象にするか。 |
| `showOnCustomerPage` | 初期 | 共有ページへ表示するか。 |
| `showOnPublicCase` | 後回し | PublicCase候補にするか。 |
| `showPriceB2b` | 初期 | B2Bで価格表示候補にするか。 |
| `showPriceB2c` | 初期 | B2Cで価格表示候補にするか。PublicCaseではfalse寄り。 |
| `source` | 後回し | `partsMaster` / `manual` / `import` など。 |
| `reviewStatus` | 後回し | PublicCase下書き化や候補レビュー用。 |
| `sortOrder` | 必須 | 表示順。 |
| `internalMemo` | 後回し | 社内メモ。 |
| `customerMemo` | 後回し | 顧客向け補足。 |
| `publicMemo` | 後回し | PublicCase向け補足。 |
| `createdAt` | 必須 | 作成日時。 |
| `updatedAt` | 必須 | 更新日時。 |

初期方針:

- `PartsMaster.grade` / `notes2` を帳票・共有ページで後読みしないため、`gradeNameSnapshot` と `notesForCustomerSnapshot` は初期実装に含める。
- `relatedWorkLineItemId` は、B2B PublicCaseで未紐づけ部品価格を出さないための重要項目として初期実装に含める。
- 部品マスタIDは参照として残すが、表示名・グレード・注記はsnapshotを正にする。

## relatedWorkLineItemId設計

`relatedWorkLineItemId` は、部品明細を対応する技術料明細へ紐づけるための項目。

例:

```txt
RepairLineItem A
lineType = labor
itemNameSnapshot = ガラス交換技術料
unitPrice = 3000

RepairLineItem B
lineType = part
itemNameSnapshot = ミネラルクリスタル
unitPrice = 2000
relatedWorkLineItemId = A.id
```

用途:

- 部品明細がどの作業に伴う交換部品かを表す。
- B2B PublicCaseで、作業に紐づく部品だけ価格表示対象にする。
- PublicCase生成時に、`PublicCasePartItem.relatedWorkItemId` へ変換する。
- 未紐づけ部品を「価格非表示」または「要レビュー」に回す判断に使う。

設計方針:

- 初期は `part` 明細から `labor` 明細へのnullable自己参照として考える。
- `labor` 明細側には関連部品一覧を持たず、逆参照で表現する。
- `relatedWorkLineItemId` がnullの部品は、PublicCase B2B価格表示対象にしない。
- FMP過去案件の未紐づけPartItem救済とは別物として扱う。通常Repairでは、入力時にできるだけ構造化して紐づける。

## EstimateItemとの関係

`EstimateItem` は、見積発行時点のスナップショットとして残す。

推奨方針:

```txt
RepairLineItem
↓ 見積作成/再発行時にコピー
EstimateItem
↓
見積書
```

`EstimateItem` に持たせたい関係:

- `repairLineItemId` を持たせる案を第一候補にする。
- ただし、見積時点スナップショットなので表示時に `RepairLineItem` を後読みしない。
- `repairLineItemId` は追跡・差分比較・再発行時の元明細確認に使う。

コピーする項目:

- `lineType` / `type`
- `itemNameSnapshot` または `estimateDisplayNameSnapshot`
- `quantity`
- `unitPrice`
- `amount`
- `taxRate`
- `taxable`
- `partsMasterId`
- `repairLineItemId`
- 表示順

注意:

- 見積発行後に `RepairLineItem` が変更されても、発行済み `EstimateItem` の表示は勝手に変えない。
- 見積再発行時は、新しい `Estimate` / `EstimateItem` セットを作るか、現行version更新で扱うかを別Taskで決める。
- 既存コードは `EstimateItem` を広く読むため、実装時はB-3的な互換期間を設けてもよい。ただし正は `RepairLineItem` とする。

## DeliveryNoteとの関係

現行 `DeliveryNote` は、`repairs Repair[]` と `totalAmount` / `taxAmount` を持つが、独立した納品書明細モデルを持たない。

現行課題:

- 納品書表示はRepairやEstimateItemから都度集計・表示する構造になりやすい。
- 納品後にRepair明細や見積明細が変わった場合、過去納品書表示の固定が弱い。

B-2での扱い:

- 初期は `RepairLineItem` を納品書表示の元データ候補にする。
- ただし、納品書発行時点の完全固定は `DeliveryNoteLineItem` 相当を検討するまで残課題とする。
- 納品書PDFとしてStorage保存済みファイルがある場合は、そのPDFが発行済み文書の正となる。
- 共有ページHTMLで納品書相当を表示する場合は、マスタ後読みではなく明細スナップショットを読む。

将来検討:

- `DeliveryNoteLineItem` 相当を作るか。
- `DeliveryNote` に明細snapshot JSONを持つか。
- 納品書発行後のRepairLineItem変更をどう扱うか。

## Invoiceとの関係

現行 `Invoice` は、`repairs Repair[]` と `totalAmount` / `taxAmount` を持つが、`InvoiceItem` を持たない。

現行課題:

- 請求書はRepair / DeliveryNote / EstimateItemから都度集計される。
- 請求発行時点の明細・納品書単位集計の固定が弱い。
- 請求後にRepairやEstimateItemが変わった場合の過去表示安定性が別途課題になる。

B-2での扱い:

- `RepairLineItem` は請求集計元の候補になる。
- ただし、請求書は会計・発行済み文書として発行時点スナップショットが必要になりやすい。
- `RepairLineItem` 新設だけで `InvoiceItem` なし問題は完全には解決しない。

将来検討:

- `InvoiceLineItem` 相当を作るか。
- 月次請求では、納品書単位の集計スナップショットを持つか。
- 請求書共有ページHTMLで何を正として表示するか。

## PublicCaseとの関係

PublicCaseは `RepairLineItem` を直接表示しない。

通常Repair由来の流れ:

```txt
RepairLineItem
↓
PublicCase下書き
↓
公開レビュー
↓
PublicCase / PublicCaseWorkItem / PublicCasePartItem
```

PublicCaseへ渡す項目:

| RepairLineItem側 | PublicCase側での用途 |
|---|---|
| `id` | sourceLineItemId相当、sourceSnapshot内の追跡。 |
| `lineType` | work/part振り分け。 |
| `itemNameSnapshot` | fallback表示・sourceSnapshot。 |
| `b2bDisplayNameSnapshot` | B2B公開表示名。 |
| `b2cDisplayNameSnapshot` | B2C公開表示名。 |
| `publicCaseDisplayNameSnapshot` | 将来の公開専用表示名。 |
| `amount` / `unitPrice` | B2B価格候補。 |
| `showPriceB2b` | B2B価格表示判定。 |
| `showPriceB2c` | B2C価格表示判定。ただしB2C PublicCaseは非表示固定寄り。 |
| `relatedWorkLineItemId` | PublicCasePartItemの関連作業へ変換。 |
| `workCategoryPathSnapshot` | 検索・分類・レビュー補助。 |
| `partCategoryPathSnapshot` | 検索・分類・レビュー補助。 |
| `gradeNameSnapshot` | 公開してよい場合の部品補助。 |
| `notesForCustomerSnapshot` | 公開レビュー対象の顧客向け注記。 |

PublicCase生成時の禁止:

- 内部メモ、原価、利益、仕入先内部情報を渡さない。
- 作業マスタ、部品マスタ、PricingRuleを表示時に後読みしない。
- コピー表記を含むRepairをB2B/B2C公開しない。
- B2Bで0円や未紐づけ部品価格を表示しない。

## 既存EstimateItem中心構造からの移行方針

現状:

- 新規入力、帳票、共有ページ、請求集計、部品発注導線が `EstimateItem` 中心。
- `RepairLineItem` はまだ存在しない。
- 本番データ0件なので、構造整理の余地は大きい。

移行方針:

1. まず `RepairLineItem` のschema案を作る。
2. 新規Repair入力の保存先を `RepairLineItem` に寄せる。
3. 見積作成時に `RepairLineItem` から `EstimateItem` を生成する。
4. `EstimateItem` は見積表示・既存帳票互換のスナップショットとして扱う。
5. 帳票・共有ページ・PDF生成は、影響範囲を調べたうえで段階的に読み取り元を整理する。
6. 部品発注・在庫連動は、当面 `EstimateItem` 互換を残すか、`RepairLineItem` 起点へ切り替えるかを別Taskで比較する。
7. PublicCase生成は、通常Repair由来では `RepairLineItem` スナップショットを元にする。

B-3的な互換期間のルール:

- 正は `RepairLineItem`。
- `EstimateItem` は派生・見積時点snapshot。
- 二重更新を避け、生成タイミングを明確にする。
- 既存コード互換のために `EstimateItem` を読む期間があっても、マスタ後読みを増やさない。

## 最小実装セット

初期実装では、全部を一度に入れず、次の目的に絞る。

目的:

- `RepairLineItem` を正式なRepair明細として保存できる。
- 見積作成時に `EstimateItem` を生成できる。
- 帳票・共有ページ・PublicCase下書きに必要な表示名・価格・フラグをsnapshotとして持てる。
- `PartsMaster.grade` / `notes2` 後読み問題を将来的に解消できる。

最小実装セット:

| 項目名案 | 必要区分 | 備考 |
|---|---|---|
| `id` | 必須 | 主キー。 |
| `repairId` | 必須 | Repairとの関連。 |
| `lineType` | 必須 | 初期は `labor` / `part`。 |
| `partsMasterId` | 初期 | part用。nullable。 |
| `workMasterId` | 初期 | labor用。作業マスタ未実装時はnullable。 |
| `pricingRuleId` | 初期 | labor用。nullable。 |
| `relatedWorkLineItemId` | 初期 | partからlaborへの紐づけ。nullable。 |
| `itemNameSnapshot` | 必須 | 互換・fallback表示名。 |
| `internalNameSnapshot` | 初期 | 社内表示用。 |
| `estimateDisplayNameSnapshot` | 必須 | 見積・納品向け表示名。 |
| `b2bDisplayNameSnapshot` | 初期 | B2B表示名。 |
| `b2cDisplayNameSnapshot` | 初期 | B2C表示名。 |
| `workCategoryPathSnapshot` | 初期 | labor用。nullable。 |
| `partCategoryPathSnapshot` | 初期 | part用。nullable。 |
| `gradeNameSnapshot` | 初期 | part用。`PartsMaster.grade` 後読み対策。 |
| `notesForCustomerSnapshot` | 初期 | part用。`PartsMaster.notes2` 後読み対策。 |
| `quantity` | 必須 | 数量。 |
| `unitPrice` | 必須 | 単価。 |
| `amount` | 必須 | 保存金額。 |
| `taxRate` | 初期 | 税率。 |
| `taxable` | 初期 | 課税対象。 |
| `showOnEstimate` | 初期 | 見積書表示。 |
| `showOnDeliveryNote` | 初期 | 納品書表示。 |
| `showOnInvoice` | 初期 | 請求対象。 |
| `showOnCustomerPage` | 初期 | 共有ページ表示。 |
| `showPriceB2b` | 初期 | B2B価格表示判定。 |
| `showPriceB2c` | 初期 | B2C価格表示判定。 |
| `sortOrder` | 必須 | 表示順。 |
| `createdAt` | 必須 | 作成日時。 |
| `updatedAt` | 必須 | 更新日時。 |

初期実装では不要にするもの:

- `discount` / `adjustment` / `shipping` / `tax_adjustment` type。
- `publicCaseDisplayNameSnapshot`。
- `source`。
- `reviewStatus`。
- `internalMemo` / `customerMemo` / `publicMemo`。
- 詳細な部品属性snapshot。
- DeliveryNoteLineItem / InvoiceLineItem。

## 後回し項目

後回しにする項目:

- `workCategoryId`
- `workNameId`
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
- `source`
- `reviewStatus`
- `internalMemo`
- `customerMemo`
- `publicMemo`
- `showOnPublicCase`
- `DeliveryNoteLineItem`
- `InvoiceLineItem`

後回し理由:

- 初期目的は、Repairの正式明細を作り、見積スナップショットと分離すること。
- 詳細な作業マスタ・部品マスタ設計が固まる前に項目を増やしすぎると、再修正が増える。
- PublicCaseは公開用スナップショットを別に持つため、RepairLineItemに公開レビュー項目を過剰に持たせない。
- 納品書・請求書の発行時点スナップショットは重要だが、RepairLineItem新設とは別の責務として扱う。

## 後続Task案

Task 107-10:

`RepairLineItem` schema設計案を作る。

含めること:

- Prisma model案。
- relation案。
- index案。
- enum化するか文字列にするか。
- `EstimateItem.repairLineItemId` の追加候補。
- 初期実装に含める項目と後回し項目。

Task 107-11:

`RepairLineItem` schema実装。

ただし、107-11に進む前に、107-10でschema案を確認する。

Task 108:

B-2方針と `RepairLineItem` 詳細設計を前提に、内装作業マスタ設計へ進む。

## 未解決事項

- `lineType` を文字列にするかenumにするか。
- `RepairLineItem` に `estimateId` を持たせるか、`EstimateItem.repairLineItemId` だけにするか。
- 見積再発行時に、旧 `EstimateItem` を残す版管理をどう扱うか。
- `Estimate.repairId @unique` のままで見積版数をどう扱うか。
- 納品書発行時点スナップショットを作るか。
- `InvoiceLineItem` 相当を作るか。
- B2C共有ページの価格表示をどうするか。
- 部品発注・在庫連動を `RepairLineItem` 起点へいつ切り替えるか。
- `relatedWorkLineItemId` がnullの部品を、通常Repair画面でどのように警告するか。
- 作業マスタ未実装期間に `workMasterId` をnullable運用する場合の入力ルール。

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
