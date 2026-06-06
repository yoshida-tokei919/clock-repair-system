# AI Task 107-1: 作業マスタ新設前提の明細・帳票・共有ページ構造調査

## 目的

作業マスタ新設を前提に、現行のRepair明細、帳票、請求書、保証書、お客様共有ページ、LINE送信導線、PublicCase連携を調査し、将来の `InternalWorkMaster` / `RepairWorkMaster` と明細スナップショット設計の関係を整理する。

結論として、作業マスタは入力補助・標準化・候補選択の元データに留め、見積書・納品書・請求書・共有ページ・PublicCaseへ出す内容は、Repair明細側またはPublicCase側のスナップショットから表示する設計に寄せるべき。

## 前提

- 今回は調査・設計メモのみ。
- DB更新、schema変更、migration作成、seed作成、マスタ投入、PublicCase再生成、import script実行、画面変更は行わない。
- 本番データはまだ0件の前提なので、既存データ移行よりも、通常Repair運用前に明細構造を正しく寄せる余地がある。
- PricingRuleは削除しない。価格ルール・技術料候補価格・既存資産として残す。
- 作業マスタは帳票や共有ページに直接表示するためのものではない。

## 本番データ0件の扱い

本番データがまだないため、互換性維持だけを優先して現行 `EstimateItem` に無理に積み増すより、作業マスタ前提の明細保存構造へ整理し直す余地が大きい。

ただし、既に画面・帳票・共有ページ・LINE・PDF生成は `Repair -> Estimate -> EstimateItem` を中心に組まれているため、全面作り直しではなく、現行の流れを保ちながら `EstimateItem` または後継明細モデルを「確定表示データのスナップショット」として強化するのが安全。

## 調査対象ファイル

- `prisma/schema.prisma`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/actions/document-actions.ts`
- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/preview/route.ts`
- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`
- `src/app/api/documents/estimate/[id]/line/route.ts`
- `src/app/api/invoices/[id]/pdf/generate/route.ts`
- `src/app/api/invoices/[id]/line/route.ts`
- `src/app/customer/repairs/[token]/page.tsx`
- `src/app/customer/repairs/[token]/estimate.pdf/route.ts`
- `src/app/customer/invoices/[token]/page.tsx`
- `src/components/pdf/EstimateDocument.tsx`
- `src/components/pdf/DeliveryDocument.tsx`
- `src/components/pdf/InvoiceDocument.tsx`
- `src/components/pdf/WarrantyDocument.tsx`
- `src/app/api/warranties/[id]/route.ts`
- `src/app/documents/warranty/[id]/page.tsx`
- `src/lib/repairs.ts`
- `src/lib/estimate-item.ts`
- `src/lib/public-cases.ts`
- `src/actions/master-actions.ts`
- `docs/ai-tasks/107-0-investigate-current-internal-work-master-structure.md`

## 現行Repair明細構造

現行の確定明細に最も近いモデルは `EstimateItem`。

```prisma
model EstimateItem {
  id            Int
  estimateId    Int
  itemName      String
  quantity      Int
  unitPrice     Int
  type          String // 'part', 'labor'
  orderStatus   String?
  orderedAt     DateTime?
  partsMasterId Int?
  createdAt     DateTime
}
```

現在の明細は、技術料と交換部品を `type = labor / part` で区別するフラットな行構造。

保存されている主な確定データ:

- 表示名相当: `EstimateItem.itemName`
- 数量: `EstimateItem.quantity`
- 単価: `EstimateItem.unitPrice`
- 種別: `EstimateItem.type`
- 部品マスタ参照: `EstimateItem.partsMasterId`
- 発注状態: `orderStatus`, `orderedAt`

保存されていないもの:

- `workMasterId`
- `pricingRuleId`
- 作業カテゴリ
- 内装/外装の明確な作業区分
- 部品カテゴリ・標準部品名のスナップショット
- 作業/処置
- B2B表示名
- B2C表示名
- 帳票用表示名
- 顧客向け説明名
- 価格表示可否
- 税率スナップショット

## 技術料明細の保存構造

`RepairEntryForm.tsx` では、内装作業追加時に `getPricingRules()` から候補を取得し、`PricingRule.suggestedWorkName` と `minPrice` を候補として表示している。

保存時には、lineItemsから以下のようなpayloadが作られる。

- `type`: `category.includes("part") ? "part" : "labor"`
- `name`: 入力または候補選択された作業名
- `price`: 入力価格
- `quantity`: 数量

API側では `EstimateItem` に以下だけ保存される。

- `itemName = item.name`
- `type = item.type`
- `unitPrice = item.price`
- `quantity = item.quantity`
- `partsMasterId = null`

技術料明細は `PricingRule` と永続的には紐づいていない。保存後、帳票や共有ページは `PricingRule` を後読みせず、`EstimateItem.itemName` と `unitPrice` を読む。

そのため、PricingRuleの作業名や価格が変わっても、保存済み技術料明細の `itemName` / `unitPrice` は直接は変わらない。

## 交換部品明細の保存構造

交換部品は、入力時に `PartsMaster` 候補から名称、価格、仕入価格、grade、note、partRef、Cousins番号、在庫数などをUI上に持つ。

保存時には、部品マスタを作成または更新し、`EstimateItem` には主に以下を保存する。

- `itemName = item.name`
- `type = part`
- `unitPrice = item.price`
- `quantity = item.quantity`
- `partsMasterId`

注意点として、UI payloadには `grade`, `note1`, `note2`, `partRef`, `cousinsNumber`, `cost` などがあるが、`EstimateItem` 自体には保存されない。これらは `PartsMaster` 側に反映され、帳票・共有ページでは `partsMaster.grade` / `partsMaster.notes2` を後読みして表示名を組み立てる箇所がある。

これは、過去の明細表示が部品マスタ現在値に影響される可能性があるため、スナップショット設計上のリスク。

## PricingRuleとの関係

`PricingRule` は現行では次の役割を兼ねている。

- 技術料候補
- 作業名候補
- ブランド/モデル/Cal条件付き価格ルール
- 入力されたlabor明細からの学習先

`src/actions/master-actions.ts` には `getWorkMasters()` / `upsertWorkMaster()` があり、`PricingRule` をWorkMaster風に扱っている。ただし `PricingRule` は次を持たない。

- 作業カテゴリ
- 内装/外装区分
- 部品カテゴリ
- 部品名
- 作業/処置
- B2B/B2C表示名
- 帳票表示名
- PublicCase表示名

帳票・共有ページ・PublicCase表示はPricingRuleを直接後読みしていない。これは良い点。ただし、作業マスタ本体としては不足が大きい。

将来は、`InternalWorkMaster / RepairWorkMaster -> PricingRule -> EstimateItem` の関係に寄せ、PricingRuleは価格決定・価格候補レイヤーとして残すのがよい。

## 帳票ごとの参照フィールド

| 表示先 | 参照モデル | 参照フィールド | 表示内容 | 注意 |
|---|---|---|---|---|
| 見積書PDF | `EstimateDocument -> Repair -> Estimate -> EstimateItem` | `itemName`, `unitPrice`, `type`, `partsMaster.grade`, `partsMaster.notes2`, `customerNote` | 作業明細・交換部品、単価、連絡事項 | `partsMaster` 現在値で部品表示名を補う。PDF生成後のStorageファイルは固定されるが、再生成すると現在値で変わる可能性あり。 |
| 納品書PDF | `DeliveryNote -> Repair -> Estimate -> EstimateItem` | `itemName`, `unitPrice`, `type`, `partsMaster.grade`, `partsMaster.notes2`, 時計情報 | 納品一覧、作業/部品、単価、合計 | 部品表示名は `partsMaster` 現在値依存。 |
| 請求書PDF | `Invoice -> Repair -> DeliveryNote -> EstimateItem` | `unitPrice`, `quantity`, `deliveryNote.slipNumber`, `issuedDate` | 納品書単位の件数・金額 | `InvoiceItem` は存在しない。請求明細はRepair/DeliveryNote/EstimateItemから都度集計。 |
| 保証書 | `Warranty -> Repair` | `workSummary`, 時計情報、保証期間 | 修理内容概要 | 明細行ではなく `Repair.workSummary` または固定文言を使う経路が混在。 |
| 修理単体PDF系 | `getRepairDataForPDF()` | `EstimateItem.itemName`, `unitPrice`, `partsMaster.grade`, `partsMaster.notes2` | 見積/納品/請求/保証プレビュー用データ | 一部でquantityを使わず `unitPrice` のみ集計している箇所がある。 |

## お客様共有ページの参照フィールド

`/customer/repairs/[token]` は、`EstimateDocument.publicToken` または `Repair.publicToken` からRepairを取得し、以下を表示する。

- 顧客名・B2B/B2C判定
- 時計情報
- `EstimateItem.itemName`
- `EstimateItem.unitPrice * quantity`
- `EstimateItem.quantity`
- `EstimateItem.type`
- partの場合は `partsMaster.grade` / `partsMaster.notes2` を使った `formatPartDisplay()`
- `Repair.customerNote`
- PDFリンク `/customer/repairs/[token]/estimate.pdf`

B2B/個人でレイアウト差はあるが、見積明細の基本参照は同じ。

重要な点:

- 共有ページHTMLは保存済みPDFではなく、DB上のRepair/EstimateItem現在値を読む。
- そのため、見積書PDFがStorage上で固定されても、共有ページHTMLは後からEstimateItemやPartsMasterが変わると表示が変わる可能性がある。
- 将来の作業マスタ変更で共有ページ表示が変わらないよう、共有ページが読む明細側に表示名・価格・数量・注記のスナップショットを持つ必要がある。

## LINE送信導線との関係

LINE送信はPDF添付ではなく、共有ページURLを送る方針。

見積書:

- `EstimatePdfActions.tsx` から `/api/documents/estimate/[id]/line` をPOST
- 送信前に `EstimatePdfFile.currentPdfFileId` / `storageKey` が必要
- `EstimateDocument.publicToken` を生成または再利用
- LINE本文には `/customer/repairs/[publicToken]` を送る
- PDFは共有ページ上のボタンから `/customer/repairs/[token]/estimate.pdf` でStorage保存済みPDFを配信

請求書:

- `InvoicePdfActions.tsx` から `/api/invoices/[id]/line` をPOST
- 送信前に `InvoicePdfFile.currentPdfFileId` / `storageKey` が必要
- `Invoice.publicToken` を生成または再利用
- LINE本文には `/customer/invoices/[publicToken]` を送る
- PDFは共有ページ上のボタンから `/customer/invoices/[token]/invoice.pdf` でStorage保存済みPDFを配信

結論:

- LINEはPDF再生成・添付をしない。
- ただしURL先のHTMLはDB現在値を読むため、明細スナップショットの重要度は高い。

## PublicCaseとの関係

PublicCase系モデルは、公開事例用の別スナップショットとして設計されている。

`PublicCaseWorkItem` には次のような公開表示向けフィールドがある。

- `normalizedWorkName`
- `b2bDisplayName`
- `b2cDisplayName`
- `laborPrice`
- `showPriceB2b`
- `showPriceB2c`
- `category`
- `partName`
- `action`
- `actionDetail`
- `attributes`
- `ruleSnapshot`

`PublicCasePartItem` には次がある。

- `displayName`
- `price`
- `showPriceB2b`
- `showPriceB2c`
- `relationStatus`
- `reviewStatus`
- `metadata`

この構造は、将来の新アプリ通常RepairからPublicCaseを生成する時の出力先としてはかなり近い。

ただし、PublicCaseはあくまで公開事例用スナップショットであり、見積書・納品書・請求書・共有ページの確定明細を代替するものではない。通常Repairでは、まずRepair/EstimateItem側に確定表示データを持ち、その後PublicCaseへ別途スナップショットするのが安全。

## マスタ直参照の危険性

現時点で危険がある箇所:

- 共有ページとPDF生成が、部品表示名の補助として `PartsMaster.grade` / `PartsMaster.notes2` を後読みしている。
- 請求書は `InvoiceItem` を持たず、発行済み請求書の明細をRepair/DeliveryNote/EstimateItemから都度集計している。
- 見積書・納品書・請求書のPDF生成は、その時点のDB現在値からPDFを作る。生成済みPDFファイルは固定されるが、再生成時は変わる。
- 保証書の修理内容は明細ではなく `Repair.workSummary` または固定文言を使う経路があり、保証対象作業の根拠が明細構造と揃っていない。

現時点で比較的安全な点:

- 技術料明細は `EstimateItem.itemName` / `unitPrice` に保存され、帳票・共有ページが `PricingRule` を後読みしていない。
- PricingRule変更で保存済み技術料明細名・価格が直接変わる構造ではない。

## 作業マスタ新設時に明細側へ必要なスナップショット候補

将来、`EstimateItem` または後継のRepair明細モデルに持たせたい候補:

- `workMasterId`
- `pricingRuleId`
- `partsMasterId`
- `itemType` / `type`
- `workType`: internal / external
- `categoryKeySnapshot`
- `categoryNameSnapshot`
- `partCategoryKeySnapshot`
- `partCategoryNameSnapshot`
- `partKeySnapshot`
- `partNameSnapshot`
- `actionKeySnapshot`
- `actionNameSnapshot`
- `actionDetailSnapshot`
- `standardWorkNameSnapshot`
- `estimateDisplayNameSnapshot`
- `deliveryDisplayNameSnapshot`
- `invoiceDisplayNameSnapshot`
- `customerDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `partGradeSnapshot`
- `partNoteSnapshot`
- `partRefSnapshot`
- `cousinsNumberSnapshot`
- `internalMemo`
- `customerNote`
- `quantity`
- `unitPrice`
- `amount`
- `taxRateSnapshot`
- `showOnEstimate`
- `showOnDeliveryNote`
- `showOnInvoice`
- `showOnCustomerPage`
- `showPriceB2B`
- `showPriceB2C`
- `sortOrder`

最低限の第一段階としては、以下を優先したい。

- `workMasterId`
- `pricingRuleId`
- `workType`
- `standardWorkNameSnapshot`
- `customerDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `partNameSnapshot`
- `partGradeSnapshot`
- `partNoteSnapshot`
- `quantity`
- `unitPrice`
- `taxRateSnapshot`
- `showOnEstimate`
- `showOnCustomerPage`
- `showPriceB2B`
- `showPriceB2C`

## 本番データ0件を踏まえた再設計余地

本番データ0件なら、次の整理を早めに行う価値がある。

1. `EstimateItem` を単なる見積明細ではなく、Repair確定明細の中心にするか、`RepairItem` / `RepairLineItem` 相当の新モデルへ役割を分離する。
2. 明細に `workMasterId` / `pricingRuleId` をnullableで持たせる。
3. 帳票・共有ページ・PublicCase生成に使う表示名と価格は、マスタではなく明細スナップショットから読む。
4. 部品マスタのgrade/note2を帳票表示で直接後読みするのをやめ、保存時に明細へ固定する。
5. 請求書は `InvoiceItem` 相当を作るか、少なくとも発行時の納品書単位集計スナップショットを持つ。
6. 保証書は `Repair.workSummary` だけでなく、保証対象作業名のスナップショットを持つ。

## 推奨方針

推奨は **D案寄りのC案**。

具体的には、作業マスタ本体は新設し、PricingRuleは価格ルールとして残す。そのうえで、既存 `EstimateItem` を拡張するだけで十分か、`RepairLineItem` 相当へ整理するかを次タスクで設計する。

判断:

- A案: 現行明細構造維持 + 作業マスタは入力補助だけ  
  不十分。帳票・共有ページ・PublicCaseへつながる構造化データが残らない。

- B案: workMasterIdだけ追加  
  危険。帳票や過去共有ページがマスタ変更に引っ張られる可能性が残る。

- C案: workMasterId + 表示名スナップショット追加  
  実装負荷と安全性のバランスがよい。現行画面・帳票の流れを保ちやすい。

- D案: 本番データ0件なので明細構造を作業マスタ前提で整理し直す  
  長期的には最もきれい。ただし、既存の見積書・納品書・請求書・共有ページ・LINE導線が `EstimateItem` を広く読んでいるため、段階設計が必要。

推奨実装順:

1. 作業マスタ本体を設計する。
2. `EstimateItem` を拡張するか、後継 `RepairLineItem` を作るかを比較する。
3. まずは `EstimateItem` に `workMasterId` / `pricingRuleId` / 表示名スナップショット / 価格表示フラグを追加する案を第一候補にする。
4. RepairEntryForm保存時に、作業マスタ・PricingRule・部品マスタから明細スナップショットを生成する。
5. 帳票・共有ページはマスタではなく明細スナップショットを表示する。
6. PublicCase生成は明細スナップショットからPublicCaseスナップショットを作る。

## FMP過去案件と新アプリ通常Repairの切り分け

FMP過去案件:

- 過去データ救済用。
- 表記ゆれ整理、読み仮名削除、プレースホルダー補正、カテゴリ推定はFMP専用。
- FMP文字列をそのまま通常Repairの作業マスタにしない。

新アプリ通常Repair:

- 最初から構造化入力する。
- 作業マスタ、部品マスタ、PricingRuleから候補を選び、Repair明細に確定スナップショットを保存する。
- FMP専用クリーニングや推定に依存しない。

PublicCase:

- Repair側で確定した構造化データを公開事例用に別スナップショット化する。
- FMP由来か新アプリ由来かを閲覧者に見せない。

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed作成なし
- マスタデータ投入なし
- PublicCase再生成なし
- import script実行なし
- アプリ画面変更なし
- 既存コード変更なし
- PricingRule変更なし
- RepairEntryForm変更なし

## 次タスク案

- Task 107-2: `InternalWorkMaster` / `RepairWorkMaster` と `EstimateItem` スナップショット項目の最小schema案を設計する。
- Task 107-3: `EstimateItem` 拡張案と `RepairLineItem` 新設案の比較を行う。
- Task 108: 作業マスタとPricingRuleの接続設計を行う。
- Task 109: RepairEntryFormでの内装作業ドリルダウン入力設計を行う。
- Task 110: 帳票・共有ページを明細スナップショット参照へ移行する実装計画を作る。
