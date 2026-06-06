# AI Task 107-3: 共通明細スナップショット仕様の設計

## 調査概要

作業マスタ新設前に、技術料明細・部品明細・帳票・共有ページ・PublicCaseの元になる明細スナップショット項目を設計する。

今回確認した主なファイル:

- `docs/ai-tasks/107-0-investigate-current-internal-work-master-structure.md`
- `docs/ai-tasks/107-1-investigate-repair-items-documents-shared-page-for-work-master.md`
- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`
- `prisma/schema.prisma`
- `src/lib/estimate-item.ts`
- `src/lib/repairs.ts`
- `src/lib/public-cases.ts`
- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`
- `src/app/customer/repairs/[token]/page.tsx`
- `src/app/customer/invoices/[token]/page.tsx`
- `src/app/cases/gallery/[id]/page.tsx`
- `src/app/cases/biz/[id]/page.tsx`

確認できたこと:

- 現行の確定明細は `EstimateItem` が中心。
- 帳票・共有ページは `EstimateItem.itemName` / `unitPrice` / `quantity` を読む。
- 部品表示では `PartsMaster.grade` / `notes2` を後読みする箇所がある。
- 請求書共有ページは `InvoiceItem` を持たず、Repair配下の `EstimateItem` から納品書単位で集計する。
- PublicCaseは `PublicCaseWorkItem` / `PublicCasePartItem` に公開表示用スナップショットを持つ。
- B2C PublicCaseは価格非表示、B2B PublicCaseは `showPriceB2b = true` かつ正の価格のみ表示する。

## Task 107-2の結論整理

Task 107-2では、以下の結論とした。

- 短期安全性は `EstimateItem` 拡張案が高い。
- 長期保守性は `RepairLineItem` 新設案が高い。
- 本番データ0件を活かすなら `RepairLineItem` 新設が理想。
- ただし、現行の帳票・共有ページ・LINE導線が `EstimateItem` を広く読んでいるため、いきなり全面移行しない。
- まずA案/B案どちらにも必要な明細スナップショット仕様を固め、その仕様を `RepairLineItem` へ移せる形にする「段階B案」を推奨。

今回の107-3では、A案でもB案でも使える共通スナップショット項目を定義する。

## 共通明細項目案

技術料・部品・値引き・調整のどれにも共通する項目。

| 項目名案 | 型イメージ | 必要性 | 用途 |
|---|---|---|---|
| `id` | number/string | 必須 | 明細行ID。 |
| `repairId` | number | B案では必須 | Repairに紐づく正式明細の親。A案では `Estimate -> repairId` 経由でも可。 |
| `estimateId` | number nullable | A案では既存必須、B案では任意 | 見積書・見積版数との関連。 |
| `lineType` | string | 必須 | `labor` / `part` / `discount` / `adjustment`。現行 `type` の後継名候補。 |
| `sortOrder` | number | 必須寄り | 帳票・共有ページ・PublicCaseで同じ並びを保つ。 |
| `quantity` | number | 必須 | 数量。技術料は通常1。 |
| `unitPrice` | number | 必須 | 税抜単価。 |
| `amount` | number | 推奨 | `unitPrice * quantity` の保存値。集計安定化。 |
| `taxRateSnapshot` | number | 推奨 | 税率変更後も過去表示を固定する。 |
| `taxable` | boolean | 推奨 | 非課税・対象外明細に備える。 |
| `showOnEstimate` | boolean | 推奨 | 見積書へ表示するか。 |
| `showOnDeliveryNote` | boolean | 推奨 | 納品書へ表示するか。 |
| `showOnInvoice` | boolean | 推奨 | 請求集計へ含めるか。 |
| `showOnCustomerPage` | boolean | 推奨 | 共有ページへ表示するか。 |
| `showPriceB2b` | boolean | 必須 | B2B共有・B2B PublicCaseの価格表示判定元。 |
| `showPriceB2c` | boolean | 必須 | B2C共有・B2C PublicCaseの価格表示判定元。現方針ではPublicCaseはfalse固定。 |
| `internalMemo` | string nullable | 任意 | 社内メモ。帳票・PublicCaseには出さない。 |
| `customerMemo` | string nullable | 任意 | 顧客向け補足。共有ページや帳票注記候補。 |
| `publicMemo` | string nullable | 任意 | PublicCase向け補足。必要時のみ。 |
| `createdAt` | DateTime | 必須 | 作成日時。 |
| `updatedAt` | DateTime | 推奨 | 更新日時。 |

命名方針:

- 現行互換が必要なA案では `type` を残しつつ、将来名として `lineType` を採用候補にする。
- 表示固定が目的の値は `Snapshot` suffixを付ける。
- 参照IDは `Snapshot` を付けない。IDはマスタ参照であり、表示値そのものではないため。

## 技術料明細スナップショット項目案

技術料明細は、作業マスタとPricingRuleから候補・価格を選び、保存時に表示名と価格を明細側へ固定する。

| 項目名案 | 必要性 | 用途 |
|---|---|---|
| `workMasterId` | 必須寄り | 新設する作業マスタへの参照。自由入力時はnullable。 |
| `workCategoryId` | 任意 | 作業カテゴリをIDで持つ場合。作業マスタに含まれるなら後回し可。 |
| `workNameId` | 任意 | 作業名マスタを分ける場合。最小実装では不要。 |
| `pricingRuleId` | 推奨 | 価格候補として選んだ `PricingRule` への参照。自由入力時はnullable。 |
| `workTypeSnapshot` | 必須寄り | `internal` / `external` など。帳票・PublicCase分類に使う。 |
| `internalNameSnapshot` | 必須 | 社内管理名。例: `文字板足修理`。 |
| `estimateDisplayNameSnapshot` | 必須 | 見積書・納品書向け表示名。例: `ゼンマイ交換`。 |
| `b2bDisplayNameSnapshot` | 必須 | B2B共有・B2B PublicCase向け表示名。 |
| `b2cDisplayNameSnapshot` | 必須 | B2C共有・B2C PublicCase向け表示名。 |
| `publicCaseDisplayNameSnapshot` | 任意 | 公開事例だけ文言を変える場合。最小実装ではB2B/B2C表示名から生成。 |
| `operationLabelSnapshot` | 任意 | 作業/操作ラベル。例: `交換`、`調整`。 |
| `treatmentLabelSnapshot` | 任意 | 処置ラベル。例: `修理`、`清掃`。 |
| `workCategoryPathSnapshot` | 推奨 | 作業カテゴリ階層の表示固定。検索・PublicCase補助にも使える。 |
| `pricingRuleNameSnapshot` | 推奨 | 選択時点の `PricingRule.suggestedWorkName`。後でPricingRule名が変わっても残す。 |
| `priceSource` | 推奨 | `workMasterDefault` / `pricingRule` / `manual` / `copied` など。 |
| `priceSourceMemo` | 任意 | 手入力価格の理由、特別対応など。 |

検討結果:

- 作業マスタ名と帳票表示名は分ける。社内では細かく、帳票では顧客に伝わる名称に丸めたいケースがある。
- B2B表示名とB2C表示名は分ける。B2Bは交換部品名や作業名を具体的に出し、B2Cは `内装修理` / `部品交換` など丸める余地を残す。
- PublicCase表示名は、最小実装ではB2B/B2C表示名から生成でよい。ただし公開事例だけSEOや表現を調整したい可能性があるため、将来項目として残す。
- `pricingRuleId` は保存する。ただし過去表示の固定にはIDだけでは不足するため、価格・表示名は明細側にスナップショットする。
- `PricingRule` の名称・価格が後で変わっても、過去明細は `pricingRuleNameSnapshot` / `unitPrice` / 表示名snapshotを読む。

## 部品明細スナップショット項目案

部品明細は、PartsMasterを在庫・仕入・部品実体への参照として残しつつ、帳票・共有ページ・PublicCaseで使う表示名・グレード・注記を明細側へ固定する。

| 項目名案 | 必要性 | 用途 |
|---|---|---|
| `partsMasterId` | 推奨 | 部品実体・在庫・発注との参照。 |
| `standardPartNameId` | 任意 | 標準部品名への参照。PartsMaster経由で足りるなら後回し。 |
| `partCategoryId` | 任意 | 部品カテゴリID。最小実装ではsnapshot優先。 |
| `partNameId` | 任意 | 部品名ID。最小実装ではsnapshot優先。 |
| `partGradeId` | 任意 | グレードマスタを分ける場合。 |
| `relatedWorkLineItemId` | 推奨 | 対応する技術料明細への紐づけ。B案で自然。 |
| `relatedWorkItemId` | 任意 | PublicCase側の `relatedWorkItemId` とは別。混同を避けるため通常Repair側では `relatedWorkLineItemId` 推奨。 |
| `internalNameSnapshot` | 必須 | 社内用部品名。例: `Rolex 3135 ゼンマイ`。 |
| `estimateDisplayNameSnapshot` | 必須 | 帳票用部品表示名。例: `ゼンマイ`。 |
| `b2bDisplayNameSnapshot` | 必須 | B2B共有・B2B PublicCase向け。例: `交換部品: ゼンマイ`。 |
| `b2cDisplayNameSnapshot` | 必須 | B2C共有・B2C PublicCase向け。例: `部品交換`。 |
| `publicCaseDisplayNameSnapshot` | 任意 | 公開事例専用。最小実装ではB2B/B2C表示名から生成。 |
| `partCategoryPathSnapshot` | 推奨 | 部品カテゴリ階層の表示固定。 |
| `partNameSnapshot` | 必須 | 標準部品名の保存値。 |
| `gradeNameSnapshot` | 必須 | 現行 `PartsMaster.grade` 後読みを置き換える。 |
| `partsMasterRefSnapshot` | 推奨 | 部品Ref、管理番号など。 |
| `manufacturerRefSnapshot` | 任意 | メーカーRefが別に必要な場合。 |
| `supplierRefSnapshot` | 任意 | 仕入先側品番。帳票には通常出さない。 |
| `sizeSnapshot` | 任意 | サイズが表示や検索に必要な部品向け。 |
| `colorSnapshot` | 任意 | 文字盤・ベルト等で必要。 |
| `materialSnapshot` | 任意 | 外装部品や素材差のある部品向け。 |
| `conditionSnapshot` | 任意 | 新品/中古/代替品など。 |
| `genuineTypeSnapshot` | 任意 | 純正/社外/代替など。 |
| `notesForCustomerSnapshot` | 必須寄り | 現行 `notes2` の顧客表示用途を置き換える。 |
| `notesForInternalSnapshot` | 任意 | 社内用注記。帳票・PublicCaseには出さない。 |

検討結果:

- `PartsMaster.grade` / `notes2` 後読みをやめるには、最低限 `gradeNameSnapshot` と `notesForCustomerSnapshot` が必要。
- 部品マスタのサイズ・グレード・注記が後で変わっても、過去帳票は明細snapshotを読む。
- B2Bでは、原則として作業に紐づく部品のみ `交換部品` として表示し、価格は `showPriceB2b = true` かつ正の価格のみ表示する。
- B2Cでは、PublicCase価格は非表示固定。部品名は具体名を出しすぎず、`部品交換` など丸めた表示を許容する。
- PublicCaseで交換部品として表示する名称は、通常Repair明細の `b2bDisplayNameSnapshot` / `b2cDisplayNameSnapshot` から生成する。
- 技術料明細との紐づけは `relatedWorkLineItemId` を通常Repair側に持つ。PublicCase生成時に `PublicCasePartItem.relatedWorkItemId` へ変換する。
- 未紐づけ部品は、B2B PublicCaseでは価格表示しない。B2C PublicCaseでは価格非表示なので、表示可否だけ別途判断する。

## 表示名の種類と用途

表示名は1種類にまとめない。社内・帳票・B2B・B2Cで必要な粒度が違う。

| 表示名 | 用途 | 例 | 方針 |
|---|---|---|---|
| `internalNameSnapshot` | 管理画面・社内確認 | `文字板足修理`、`Rolex 3135 ゼンマイ` | 必須。内部管理文言は公開・共有に出さない。 |
| `estimateDisplayNameSnapshot` | 見積書・納品書 | `オーバーホール`、`ゼンマイ交換` | 必須。帳票は原則これを読む。 |
| `invoiceDisplayNameSnapshot` | 請求書 | `納品書単位集計`、または明細名 | 後回し。請求スナップショット設計時に決める。 |
| `b2bDisplayNameSnapshot` | B2B共有ページ・B2B PublicCase | `ゼンマイ交換`、`交換部品: ゼンマイ` | 必須。業者向けに具体性を残す。 |
| `b2cDisplayNameSnapshot` | B2C共有ページ・B2C PublicCase | `内装修理`、`部品交換` | 必須。一般顧客向けに丸められるようにする。 |
| `publicCaseDisplayNameSnapshot` | 公開事例専用 | `ゼンマイ交換修理` など | 任意。最小実装ではB2B/B2Cから生成。 |

表示名の優先順:

- 帳票: `estimateDisplayNameSnapshot` -> `itemName` 互換値。
- B2B共有: `b2bDisplayNameSnapshot` -> `estimateDisplayNameSnapshot` -> `itemName`。
- B2C共有: `b2cDisplayNameSnapshot` -> `estimateDisplayNameSnapshot` -> `itemName`。
- B2B PublicCase: `publicCaseDisplayNameSnapshot` があればそれ、なければ `b2bDisplayNameSnapshot`。
- B2C PublicCase: `publicCaseDisplayNameSnapshot` があればそれ、なければ `b2cDisplayNameSnapshot`。

## 価格表示フラグ設計

価格表示フラグは、帳票表示と公開表示を分ける。

| 項目名案 | 用途 | 方針 |
|---|---|---|
| `showPriceOnEstimate` | 見積書で価格表示するか | 通常true。値引き・非表示明細に備える。 |
| `showPriceOnDeliveryNote` | 納品書で価格表示するか | 通常true。 |
| `showPriceOnInvoice` | 請求書集計に含めるか | 通常true。請求対象外明細を除外できるようにする。 |
| `showPriceOnCustomerPage` | 共有ページで価格表示するか | 現行共有ページは表示。将来B2B/B2Cで分ける余地あり。 |
| `showPriceB2b` | B2B共有・B2B PublicCase価格表示 | PublicCaseではtrueかつ正の価格のみ表示。 |
| `showPriceB2c` | B2C共有・B2C PublicCase価格表示 | B2C PublicCaseはfalse固定。共有ページは別途要検討。 |
| `showPriceOnPublicCase` | PublicCase共通表示 | B2B/B2C差分があるため最小実装では不要。 |

現時点のPublicCase方針を通常Repair明細に反映する方法:

- 明細保存時に `showPriceB2b` / `showPriceB2c` を持つ。
- B2C PublicCase生成時は `showPriceB2c` を必ずfalseにする。
- B2B PublicCase生成時は `showPriceB2b = true` かつ `amount > 0` のみ価格表示候補にする。
- 0円は表示しない。
- 未紐づけ部品はB2B PublicCaseで価格表示しない。
- 内部価格・仕入価格・原価は帳票/共有/PublicCaseに出さない。
- PublicCaseの部品表示では「部品代」ラベルを使わず、必要なら「交換部品」とする。

## PublicCase生成元として必要な項目

通常RepairからPublicCaseを生成する場合、Repair明細側に以下が必要。

PublicCaseWorkItemへ渡す項目:

- `sourceLineItemId`
- `lineType = labor`
- `internalNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `unitPrice` / `amount`
- `showPriceB2b`
- `showPriceB2c`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `operationLabelSnapshot`
- `treatmentLabelSnapshot`
- `workMasterId`
- `pricingRuleId`
- `sortOrder`

PublicCasePartItemへ渡す項目:

- `sourceLineItemId`
- `lineType = part`
- `relatedWorkLineItemId`
- `internalNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `partNameSnapshot`
- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `unitPrice` / `amount`
- `showPriceB2b`
- `showPriceB2c`
- `partsMasterId`
- `partCategoryPathSnapshot`
- `sortOrder`

生成ルール:

- PublicCaseは別スナップショットなので、生成後にRepair明細やマスタが変わっても既存PublicCase表示は変えない。
- B2B価格は `showPriceB2b = true` かつ正の価格のみ表示する。
- B2C価格は非表示固定。
- 交換部品は、作業明細に紐づくものだけ価格表示対象にする。
- `relatedWorkLineItemId` をPublicCase生成時に `relatedWorkItemId` へ変換する。
- `internalMemo` / `notesForInternalSnapshot` はPublicCaseへ渡さない。
- コピー表記を含むRepairはPublicCase化しない、または生成前レビューで除外する。
- `searchText` 生成には、ブランド表示名、作業表示名、部品表示名、Ref、Calなど公開可能なsnapshotのみ使う。

## 帳票・共有ページで後読み禁止にする項目

基本方針:

- ID参照は残してよい。
- 表示名・価格・グレード・注記・B2B/B2C表示名は明細側にスナップショット保存する。
- 帳票・共有ページ・PublicCase表示では、過去表示を固定するためスナップショットを優先する。

帳票で後読みしてよい項目:

- 顧客名、住所、会社名など帳票発行時に取り込む親データ。ただしPDF生成後はStorageファイルが正。
- 時計ブランド、モデル、Ref、CalなどRepair親情報。帳票生成時点でPDFに固定される。
- `partsMasterId` による在庫・発注状態確認。

帳票で後読みしてはいけない項目:

- 部品表示名。
- `PartsMaster.grade` / `notes2`。
- 作業マスタ表示名。
- PricingRuleの作業名・価格。
- B2B/B2C表示名。
- 顧客向け注記として使う部品メモ。

共有ページで後読みしてよい項目:

- 共有ページの有効トークン、PDFファイル有無、Repairの現在ステータスなど、現在状態として見せる項目。
- 顧客メッセージや承認状態など、共有ページ上の進行状態。

共有ページで後読みしてはいけない項目:

- 明細表示名。
- 明細価格。
- 数量。
- 部品グレード・注記。
- 作業マスタ名。
- PricingRule価格。
- PublicCase向け表示名。

PublicCase生成時に後読みしてよい項目:

- Repair親情報の公開可能な時計情報。
- 明細にスナップショットがない場合の補完。ただし初期移行期間だけに限定する。
- 画像・公開レビュー状態などPublicCase固有情報。

PublicCase生成後に後読みしてはいけない項目:

- Repair明細。
- 作業マスタ。
- PricingRule。
- PartsMaster。
- 顧客内部情報。

## EstimateItem拡張案へ適用する場合の項目配置

A案では、現行 `EstimateItem` にスナップショット項目を追加する想定。

既存項目の扱い:

- `type`: 当面維持。将来 `lineType` へ移行する場合も互換のため残す。
- `itemName`: 互換表示名として維持。将来は `estimateDisplayNameSnapshot` の初期値として扱う。
- `unitPrice`: 保存時点の税抜単価として維持。
- `quantity`: 維持。
- `partsMasterId`: 部品実体参照として維持。

追加候補:

- 共通: `sortOrder`, `amount`, `taxRateSnapshot`, `taxable`, `showOnEstimate`, `showOnDeliveryNote`, `showOnInvoice`, `showOnCustomerPage`, `showPriceB2b`, `showPriceB2c`
- 技術料: `workMasterId`, `pricingRuleId`, `workTypeSnapshot`, `internalNameSnapshot`, `b2bDisplayNameSnapshot`, `b2cDisplayNameSnapshot`, `workCategoryPathSnapshot`, `pricingRuleNameSnapshot`, `priceSource`
- 部品: `relatedWorkLineItemId`, `partNameSnapshot`, `gradeNameSnapshot`, `notesForCustomerSnapshot`, `partCategoryPathSnapshot`, `internalNameSnapshot`, `b2bDisplayNameSnapshot`, `b2cDisplayNameSnapshot`

注意:

- A案では `repairId` は `Estimate -> repairId` 経由でも取れるため、必須ではない。
- `relatedWorkLineItemId` は同じ `EstimateItem.id` を指す形になる。
- 既存帳票はまず `snapshot -> itemName` のfallbackで移行できる。

## RepairLineItem新設案へ適用する場合の項目配置

B案では、`RepairLineItem` をRepairに紐づく正式明細本体として作る想定。

必須寄り:

- `id`
- `repairId`
- `estimateId`
- `lineType`
- `sortOrder`
- `quantity`
- `unitPrice`
- `amount`
- `taxRateSnapshot`
- `taxable`
- `showOnEstimate`
- `showOnDeliveryNote`
- `showOnInvoice`
- `showOnCustomerPage`
- `showPriceB2b`
- `showPriceB2c`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

技術料用:

- `workMasterId`
- `pricingRuleId`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `pricingRuleNameSnapshot`
- `priceSource`

部品用:

- `partsMasterId`
- `relatedWorkLineItemId`
- `partNameSnapshot`
- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `partCategoryPathSnapshot`

移行方針:

- `EstimateItem` は当面、見積書互換または派生明細として残す。
- RepairEntryForm保存時の一次保存先を `RepairLineItem` にするか、初期は `EstimateItem` と同期するかを別タスクで決める。
- 二重管理期間を作る場合、どちらを正とするかを必ず固定する。推奨は `RepairLineItem` 正、`EstimateItem` 派生。

## 推奨する最小実装セット

全部を一度に入れると重いため、最小実装セットは「帳票・共有ページ・PublicCaseでマスタ後読みしないために必要な項目」に絞る。

共通:

- `lineType` または現行互換の `type`
- `sortOrder`
- `quantity`
- `unitPrice`
- `amount`
- `taxRateSnapshot`
- `showOnEstimate`
- `showOnDeliveryNote`
- `showOnInvoice`
- `showOnCustomerPage`
- `showPriceB2b`
- `showPriceB2c`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

技術料:

- `workMasterId`
- `pricingRuleId`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `pricingRuleNameSnapshot`
- `priceSource`

部品:

- `partsMasterId`
- `relatedWorkLineItemId`
- `partNameSnapshot`
- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `partCategoryPathSnapshot`

最小実装での表示優先:

- 帳票: `estimateDisplayNameSnapshot`。
- 部品帳票表示: `estimateDisplayNameSnapshot` + `gradeNameSnapshot` + `notesForCustomerSnapshot`。
- B2B共有: `b2bDisplayNameSnapshot`。
- B2C共有: `b2cDisplayNameSnapshot`。
- PublicCase: B2Bは `b2bDisplayNameSnapshot`、B2Cは `b2cDisplayNameSnapshot`。

## 後回しにする項目

以下は重要だが、最小実装からは外してよい。

- `publicCaseDisplayNameSnapshot`
- `invoiceDisplayNameSnapshot`
- `workCategoryId`
- `workNameId`
- `operationLabelSnapshot`
- `treatmentLabelSnapshot`
- `priceSourceMemo`
- `standardPartNameId`
- `partCategoryId`
- `partNameId`
- `partGradeId`
- `partsMasterRefSnapshot`
- `manufacturerRefSnapshot`
- `supplierRefSnapshot`
- `sizeSnapshot`
- `colorSnapshot`
- `materialSnapshot`
- `conditionSnapshot`
- `genuineTypeSnapshot`
- `notesForInternalSnapshot`
- `publicMemo`
- `showPriceOnPublicCase`

後回し理由:

- 初期目的は、マスタ後読みによる過去表示変動を止めること。
- 詳細属性は部品マスタ・作業マスタ本体の設計が固まってからでも追加できる。
- PublicCase専用表示名や請求専用表示名は、実際の掲載・請求運用の文言が固まってから追加した方が安全。

## 次Task案

- Task 107-4: 作業マスタ本体の最小モデル案を設計する。
- Task 107-5: `EstimateItem` 拡張で始める場合の最小schema差分案を作る。
- Task 107-6: `RepairLineItem` 新設で始める場合の最小schema差分案を作る。
- Task 107-7: 帳票・共有ページを明細スナップショット参照へ移行する実装計画を作る。
- Task 107-8: 請求書発行時点スナップショット、または `InvoiceLineItem` 相当の設計を比較する。
- Task 108: 作業マスタと `PricingRule` の接続設計を行う。

## 未解決事項

- 新設作業マスタ名を `InternalWorkMaster` にするか、`RepairWorkMaster` + `workType` にするか。
- 通常Repairの正式明細を最初から `RepairLineItem` にするか、初期は `EstimateItem` 拡張で始めるか。
- B2C共有ページで価格を表示するか、B2C PublicCaseと同じく非表示寄りにするか。
- `InvoiceLineItem` 相当を作るか、請求書発行時点の納品書単位集計スナップショットにするか。
- 保証書で保証対象作業を明細から選ぶか、従来どおり `Repair.workSummary` を使うか。
- 未紐づけ部品をPublicCaseで表示するか。表示する場合、価格は非表示でよいか。
- `publicCaseDisplayNameSnapshot` を初期から持つか、B2B/B2C表示名から生成して不足時に追加するか。

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed作成なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- PublicCase生成ロジック変更なし
- 帳票/PDF/LINE送信処理変更なし
- テスト修正なし
- git addなし
- commitなし
- pushなし
