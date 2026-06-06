# AI Task 107-13: RepairLineItem接続前の既存EstimateItem導線調査

## 概要

Task 107-11 / 107-12で `RepairLineItem` schema追加とローカルDB反映が完了したため、既存コードで `EstimateItem` を作成・更新・取得・表示している箇所を再調査した。

このTaskでは、schema/code/API/UI/seed/DB操作は行わない。調査Markdown作成のみ。

結論:

- 現行の通常Repair入力・更新は、`RepairEntryForm` の `lineItems` から `body.estimate.items` を組み立て、`/api/repairs` または `/api/repairs/[id]` で `Estimate` / `EstimateItem` へ保存している。
- 新規作成は `estimate.create({ items: { create: ... } })`、更新は `estimate.upsert` 後に `estimateItem.deleteMany` -> `estimateItem.createMany` で全置換している。
- 部品明細は保存時に `PartsMaster` を作成/更新し、`EstimateItem.partsMasterId` を保存している。
- 技術料明細は保存時に `PricingRule` を自動作成または価格更新している。
- 帳票・共有ページ・PDF生成・請求・部品発注/在庫導線は `EstimateItem` 依存が広い。
- `PartsMaster.grade` / `notes2` を帳票・共有ページで後読みする箇所が複数あり、`RepairLineItem` 移行時にsnapshot優先へ移す必要がある。
- 最初の実装単位は、既存導線を壊さない **A案: RepairLineItem用lib関数だけ作る** が安全。

## 現行EstimateItem導線

現行の主な流れ:

```txt
RepairEntryForm
↓ lineItems state
body.estimate.items
↓
POST /api/repairs または PATCH /api/repairs/[id]
↓
Estimate
↓
EstimateItem
↓
帳票 / 共有ページ / 請求 / 部品発注 / 在庫連動
```

`RepairLineItem` はschemaとDBには追加済みだが、現時点ではコードから未使用。

決定済みの将来方針:

```txt
Repair
↓
RepairLineItem
↓
EstimateItem
```

ただし、既存の `EstimateItem` 参照範囲が広いため、一気に置き換えない。

## EstimateItem作成箇所

### RepairEntryForm

対象:

- `src/components/repairs/RepairEntryForm.tsx`

役割:

- `initialData.estimate.items` から `lineItems` stateを初期化する。
- labor行は `item.itemName` / `unitPrice` / `quantity` をLineItemへ変換する。
- part行は `createEstimateItemFromPart(i.partsMaster ?? {}, ...)` で部品表示補助をLineItemへ変換する。
- 保存時に `lineItems.map(...)` で `body.estimate.items` を作る。

payloadに含める主な値:

- `type`: `part` / `labor`
- `category`
- `partType`
- `name`
- `price`
- `cost`
- `notes`
- `grade`
- `note1`
- `note2`
- `partRef`
- `cousinsNumber`
- `stockQuantity`
- `partsMasterId`
- `quantity`

### 新規Repair作成API

対象:

- `src/app/api/repairs/route.ts`

作成処理:

- `body.estimate?.items` を `estimateItems` として受け取る。
- part行は `partsMasterId` がある場合、既存 `PartsMaster` を読み、`createOrUpdatePartsMaster` で更新する。
- part行で `partsMasterId` がない場合、新しい `PartsMaster` を作成する。
- `estimate.create({ items: { create: ... } })` で `EstimateItem` を作成する。

保存される `EstimateItem` 値:

- `itemName: item.name`
- `type: item.type`
- `unitPrice: Math.floor(Number(item.price) || 0)`
- `quantity: item.quantity || 1`
- `partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null`

### 既存Repair更新API

対象:

- `src/app/api/repairs/[id]/route.ts`

更新処理:

- `body.estimate.items` がある場合、`estimate.upsert` で `Estimate` を作成/更新する。
- 既存 `EstimateItem` は `estimateItem.deleteMany({ where: { estimateId } })` で全削除する。
- part行は新規作成APIと同じく `PartsMaster` と同期する。
- `estimateItem.createMany(...)` で `EstimateItem` を全件再作成する。

注意:

- 更新時は差分更新ではなく全置換。
- `EstimateItem.id` は更新のたびに変わる可能性がある。
- 将来 `RepairLineItem` と二重書きする場合、既存の全置換動作に合わせるか、`RepairLineItem` 側は安定IDを保つかを決める必要がある。

## EstimateItem取得・表示箇所

### Repair詳細画面

対象:

- `src/app/(app)/repairs/[id]/page.tsx`

取得:

- `repair.findUnique`
- `estimate.items.include.partsMaster`
- `partsMaster` から `partType` / `grade` / `notes1` / `notes2` / `partRefs` / `cousinsNumber` / `stockQuantity` / `latestCostYen` / `supplier.name` を取得する。

用途:

- `RepairEntryForm` の初期表示。
- 部品発注状態や部品検索情報の復元。

### 見積書PDF生成

対象:

- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`
- `src/app/documents/estimate/[id]/page.tsx`
- `src/app/api/documents/estimate/[id]/line/route.ts`
- `src/lib/repairs.ts`
- `src/components/repairs/PDFPreviewDialog.tsx`

取得:

- `estimate.items`
- part行では `partsMaster: { select: { grade: true, notes2: true } }`

表示:

- laborは `item.itemName`
- partは `formatPartDisplay({ name: item.itemName, grade: item.partsMaster?.grade, note2: item.partsMaster?.notes2 })`

### 納品書PDF/画面

対象:

- `src/app/documents/delivery/[id]/page.tsx`
- `src/lib/repairs.ts`
- `src/components/pdf/DeliveryDocument.tsx`

取得:

- `deliveryNote.findUnique`
- `repairs.include.estimate.items.include.partsMaster.grade/notes2`

表示:

- `EstimateItem.itemName` / `unitPrice` / `quantity`
- part行は `PartsMaster.grade` / `notes2` を後読みして表示名補助に使う。

### 顧客共有ページ / LINE送信用共有URL

対象:

- `src/app/customer/repairs/[token]/page.tsx`
- `src/app/api/documents/estimate/[id]/line/route.ts`

取得:

- `estimate.items.include.partsMaster.grade/notes2`

表示:

- 共有ページHTMLは `EstimateItem` と `PartsMaster` 現在値を読む。
- LINE送信はPDF添付ではなく共有URLを送るため、URL先HTMLの表示元が重要。

注意:

- Storage保存済みPDFは固定ファイルだが、共有ページHTMLはDB現在値の影響を受ける。

### 請求書 / 月次請求

対象:

- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/[id]/pdf/generate/route.ts`
- `src/app/customer/invoices/[token]/page.tsx`
- `src/actions/document-actions.ts`

取得:

- `repairs.include.estimate.items`

用途:

- 請求書作成時の合計計算。
- 請求PDFの納品書単位集計。
- 請求共有ページの納品書単位表示。

注意:

- 現行は `InvoiceItem` がない。
- `RepairLineItem` 導入後も、請求書発行時点スナップショットは別問題として残る。

### 部品発注・在庫連動

対象:

- `src/actions/repair-actions.ts`
- `src/app/api/repairs/[id]/status/route.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/components/dashboard/PartsOrderStatusList.tsx`

用途:

- `estimateItem.findMany({ where: { type: 'part', orderStatus: ... } })`
- `estimateItem.update` で `orderStatus` / `orderedAt` を更新。
- ステータス変更時に `Estimate.items.include.partsMaster` から在庫不足判定・在庫減算・OrderRequest作成を行う。

注意:

- `EstimateItem` は帳票だけでなく、部品発注状態の実体も兼ねている。
- `RepairLineItem` 移行時に、発注状態をどちらへ持つかは別途設計が必要。

### B2B/B2C PublicCase

対象:

- `src/lib/public-cases.ts`
- `src/app/cases/gallery/*`
- `src/app/cases/biz/*`
- `scripts/import-fmp-public-cases.ts`

現状:

- 公開ページは `PublicCase` / `PublicCaseWorkItem` / `PublicCasePartItem` を読む。
- FMP由来PublicCaseは専用scriptsで生成・importされる。
- 通常Repair由来で `EstimateItem` からPublicCase下書きを作る実装は、現時点では未確認。

方針:

- 通常Repair由来PublicCase下書きは、将来 `RepairLineItem` から作る。
- PublicCase表示時に `RepairLineItem` や `EstimateItem` を後読みしない。

## PricingRule自動作成・更新箇所

### 新規Repair作成API

対象:

- `src/app/api/repairs/route.ts`

処理:

- labor行を `estimateItems.filter(i => i.type === 'labor')` で抽出。
- `suggestedWorkName` が既存にない場合、`pricingRule.createMany` で作成する。
- 既存の場合、`pricingRule.updateMany` で `minPrice` / `maxPrice` を更新する。

条件:

- `brandId`
- `modelId`
- `caliberId`
- `suggestedWorkName`

### 既存Repair更新API

対象:

- `src/app/api/repairs/[id]/route.ts`

処理:

- `body.estimate.items.filter(i => i.type === 'labor')`
- 既存 `PricingRule` の有無を見て、createManyまたはupdateMany。

### master actions

対象:

- `src/actions/master-actions.ts`

関連:

- `getPricingRules`
- `upsertWorkMaster`

注意:

- 現行は `PricingRule.suggestedWorkName` を作業候補のように扱う箇所がある。
- 正本方針では、PricingRuleは価格ルールとして残し、作業マスタ本体にはしない。

## partsMasterId / PartsMaster後読み箇所

保存時:

- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`

処理:

- part行で `partsMasterId` があれば既存PartsMasterを読み、入力値で更新する。
- `partsMasterId` がなければPartsMasterを新規作成する。
- `EstimateItem.partsMasterId` へ保存する。

後読み表示:

- `src/app/(app)/repairs/[id]/page.tsx`
- `src/app/documents/estimate/[id]/page.tsx`
- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`
- `src/app/api/documents/estimate/[id]/line/route.ts`
- `src/app/documents/delivery/[id]/page.tsx`
- `src/app/customer/repairs/[token]/page.tsx`
- `src/lib/repairs.ts`
- `src/components/repairs/PDFPreviewDialog.tsx`

後読み項目:

- `PartsMaster.grade`
- `PartsMaster.notes2`
- その他、Repair詳細復元では `notes1` / `partRefs` / `cousinsNumber` / `stockQuantity` / `latestCostYen` / `supplier.name`

問題:

- 帳票・共有ページで `grade` / `notes2` を後読みすると、PartsMaster変更で過去表示が変わる。
- `RepairLineItem` では `gradeNameSnapshot` / `notesForCustomerSnapshot` を正にする必要がある。

## RepairLineItemへ移行する場合の影響範囲

影響が大きい領域:

- `RepairEntryForm` の初期表示と保存payload。
- `/api/repairs` 新規作成API。
- `/api/repairs/[id]` 更新API。
- `EstimateItem` 全置換保存ロジック。
- PricingRule自動作成・更新。
- PartsMaster同期と `partsMasterId` 保存。
- 部品発注・在庫連動。
- 見積書・納品書・共有ページの表示元。
- 請求書の集計元。

影響が比較的小さい領域:

- PublicCase公開表示。現状はPublicCase snapshotを読むため。
- FMP由来PublicCase import。FMP専用経路なので通常Repair移行と分ける。

主なリスク:

- `EstimateItem` と `RepairLineItem` の二重書き期間に同期ズレが起きる。
- 更新APIが `EstimateItem` を全置換しているため、同じ発想で `RepairLineItem` も全置換すると安定IDが失われる。
- 部品発注状態 `orderStatus` が現在 `EstimateItem` 側にあるため、`RepairLineItem` へ移すか互換維持するか要設計。
- 帳票・共有ページの表示元を急に変えると既存PDF/共有導線を壊す。

## 段階移行案

### Phase A: RepairLineItem用lib関数だけ作る

内容:

- `src/lib/repair-line-items.ts` などを新設する。
- `createRepairLineItems`
- `getRepairLineItems`
- `replaceRepairLineItems`
- `mapEstimatePayloadToRepairLineItems`

特徴:

- 既存API/UI/帳票を触らない。
- 単体で型・変換・保存処理を固められる。
- 次の二重書き実装前に、snapshot生成ルールを確認できる。

### Phase B: RepairEntryForm保存時にRepairLineItemへも保存する

内容:

- `/api/repairs` / `/api/repairs/[id]` の保存処理で、既存 `EstimateItem` 保存に加えて `RepairLineItem` も保存する。
- 既存 `EstimateItem` 導線は残す。

注意:

- 正は `RepairLineItem` とするが、表示はまだ `EstimateItem` のまま。
- `RepairLineItem` を全置換するか、安定IDを保つかを事前に決める。

### Phase C: 見積作成時にRepairLineItemからEstimateItemを生成する

内容:

- `EstimateItem` を直接payloadから作るのではなく、`RepairLineItem` から見積時点snapshotとして生成する。
- `EstimateItem` 表示時は `RepairLineItem` を後読みしない。

注意:

- `EstimateItem.repairLineItemId` を追加するかは別Task。
- 見積版数と `Estimate.repairId @unique` の扱いも別Task。

### Phase D: 帳票・共有ページはEstimateItem snapshotを表示し続ける

内容:

- 見積書・納品書・共有ページは当面 `EstimateItem` を読む。
- ただし、`PartsMaster.grade` / `notes2` 後読みは段階的にsnapshotへ移す。

注意:

- Storage保存済みPDFは固定ファイル。
- 共有ページHTMLはDB現在値を読むため、特にsnapshot優先へ移行する必要がある。

### Phase E: PublicCase下書き生成はRepairLineItemから作る

内容:

- 通常Repair由来のPublicCase下書き生成を `RepairLineItem` 起点にする。
- PublicCase生成後はPublicCase自身のsnapshotを正とする。

注意:

- FMP過去案件の救済ルールとは分ける。
- 未紐づけ部品価格はB2B PublicCaseで表示しない。

## 最初に実装する最小単位の推奨

推奨は **A案: RepairLineItem用のlib関数だけ作る**。

理由:

- 既存 `EstimateItem` 導線を壊さない。
- DB schemaは既にあるため、保存関数・取得関数・変換関数だけを安全に追加できる。
- Phase Bの二重書き前に、`LineItem` payloadから `RepairLineItem` snapshotへどう変換するかをテストできる。
- PricingRule同期、PartsMaster同期、OrderRequest、帳票表示を同時に触らずに済む。

次の最小実装候補:

- `src/lib/repair-line-items.ts`
- 既存APIからはまだ呼ばない。
- 関数単位のテストまたは型確認を先に行う。

候補関数:

- `toRepairLineItemCreateInput(repairId, item, options)`
- `replaceRepairLineItems(tx, repairId, items)`
- `getRepairLineItems(repairId)`
- `buildEstimateItemsFromRepairLineItems(lineItems)`

初期実装でまだしないこと:

- RepairEntryForm変更。
- API保存処理変更。
- EstimateItem生成元切替。
- 帳票・共有ページ変更。
- PublicCase生成変更。

## 次Task案

Task 107-14:

`RepairLineItem` 用lib関数の設計Markdownを作る。

含めること:

- 入力payload型。
- `RepairEntryForm` のLineItemからRepairLineItem snapshotへの変換方針。
- `lineType` 変換。
- labor/partのsnapshot生成。
- `partsMasterId` / `pricingRuleId` / `relatedWorkLineItemId` の扱い。
- `EstimateItem` 生成用変換関数の境界。

Task 107-15:

`src/lib/repair-line-items.ts` を実装する。

ただし、既存API/UIからはまだ呼ばない。

Task 107-16:

`/api/repairs` / `/api/repairs/[id]` で `EstimateItem` 既存保存を残したまま、`RepairLineItem` へ二重書きする実装計画を作る。

## 未解決事項

- `RepairLineItem` を更新時に全置換するか、安定IDを維持するか。
- `EstimateItem.orderStatus` / `orderedAt` を将来どこへ移すか。
- `EstimateItem.repairLineItemId` をいつ追加するか。
- 見積版数をどう扱うか。
- `PartsMaster.grade` / `notes2` 後読みをどの順番でsnapshotへ移すか。
- `RepairLineItem` に帳票別表示フラグを追加するタイミング。
- `RepairLineItem` に税率・課税フラグを追加するタイミング。
- 通常Repair由来PublicCase下書き生成の仕様。
- B2C共有ページの価格表示方針。

## 変更しなかったもの

- schema変更なし
- migration作成なし
- db pushなし
- seed変更なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- 帳票/PDF/LINE変更なし
- PublicCase生成変更なし
- EstimateItem保存処理変更なし
- RepairLineItem保存処理実装なし
