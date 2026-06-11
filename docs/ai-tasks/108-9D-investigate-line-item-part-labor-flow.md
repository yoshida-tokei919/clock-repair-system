# AI Task 108-9D: 明細入力における技術料行・部品行の現行導線調査

## 目的

RepairWorkCategory / RepairWorkAction / PartNameMaster を使った構造化入力へ進む前に、現行の明細入力がどのように「技術料」と「交換部品」を分け、RepairLineItem / EstimateItem / 帳票 / 共有ページ / PublicCase へ接続しているかを整理する。

このTaskでは調査Markdownのみ作成し、schema / migration / seed / DB / API / UI / 保存処理 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 調査ファイル

- `prisma/schema.prisma`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/lib/repair-line-items.ts`
- `src/actions/master-actions.ts`
- `src/app/documents/estimate/[id]/page.tsx`
- `src/app/documents/delivery/[id]/page.tsx`
- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`
- `src/actions/document-actions.ts`
- `src/app/customer/repairs/[token]/page.tsx`
- `src/app/api/invoices/preview/route.ts`
- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/[id]/pdf/generate/route.ts`
- `src/app/customer/invoices/[token]/page.tsx`
- `src/lib/public-cases.ts`
- `src/app/cases/gallery/*`
- `src/app/cases/biz/*`

## 現行の明細入力UI

RepairEntryForm では、明細追加時の種別を `addItemCategory` で切り替えている。

| UI上の選択 | 内部category | 保存時type | 位置づけ |
| --- | --- | --- | --- |
| 技術料 | `internal` | `labor` | 作業・技術料行 |
| 交換部品 | `part_external` | `part` | 部品行 |

明細行の表示でも `category.includes("part")` により、部品行は「交換部品」、それ以外は「技術料」として扱われる。部品行では `formatPartDisplay()` により grade / note2 などを含めた部品表示名が作られ、技術料行では `item.name` がそのまま表示される。

部品入力側には PartCategoryMaster / PartNameMaster / PartsMaster を使う候補選択UIがある。一方、技術料入力側は PricingRule.suggestedWorkName 由来の候補が中心で、RepairWorkCategory / RepairWorkAction / targetPartNameId / detailLabel を選ぶUIはまだない。

## 技術料行と部品行の分離

現行の通常Repairでは、技術料行と部品行は独立した明細行として保存される。

例:

| type | 表示例 | 金額 |
| --- | --- | ---: |
| `labor` | 交換技術料 | 10,000 |
| `part` | ゼンマイ | 5,000 |

この2行を通常の見積書・納品書・共有ページで `ゼンマイ交換 15,000円` のような1行へ結合する設計にはなっていない。

`ゼンマイ交換 15,000円` のような集約表示は、将来のB2C / PublicCase向け表示候補であり、通常Repairの帳票表示ではなく、公開用スナップショット生成時に検討するべき内容である。

## RepairLineItem保存導線

RepairLineItem は、Repairの正式な案件明細本体として導入済みである。ただし現時点では、既存EstimateItem導線を壊さないため、Repair新規作成API・Repair更新APIで同じpayloadから二重書きされている。

現行保存順の要点:

1. RepairEntryForm から `body.estimate.items` が送られる。
2. API側で部品行の PartsMaster 同期・`partsMasterId` 確定を行う。
3. EstimateItem を従来通り作成・置換する。
4. 同じ明細payloadを `estimateItemsLikeToRepairLineItemInputs()` で RepairLineItemInput へ変換する。
5. `replaceRepairLineItems()` で RepairLineItem を全置換する。

RepairLineItem schema には、構造化入力用の受け皿として以下が既に存在する。

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabelSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`
- `pricingRuleId`
- `itemNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

ただし、現行UI / API payload / adapter / 保存処理では、RepairWorkCategory / RepairWorkAction / targetPartNameId / detailLabelSnapshot はまだ十分に使われていない。現状の二重書きは、主に `type`, `itemName`, `unitPrice`, `quantity`, `partsMasterId`, `pricingRuleId`, 表示名snapshot を保存する段階である。

## EstimateItem保存導線

EstimateItem は、見積発行時点のスナップショット明細として従来導線を維持している。

Repair新規作成API・Repair更新APIでは、`body.estimate.items` から以下を中心に EstimateItem を保存する。

- `type`
- `itemName`
- `unitPrice`
- `quantity`
- `partsMasterId`

現行の帳票・共有ページ・請求集計は、まだ EstimateItem を参照している。RepairLineItem から EstimateItem を生成する段階にはまだ移行していない。

## RepairLineItemとEstimateItemの関係

現在の関係は以下である。

```txt
RepairEntryForm payload
├─ EstimateItem
└─ RepairLineItem
```

本来の将来形は以下を目指す。

```txt
Repair
↓
RepairLineItem
↓
EstimateItem
↓
帳票 / 共有ページ / 請求
```

ただし現時点では、RepairLineItem は裏側に蓄積される正式明細候補であり、既存UI・帳票・共有ページの読み先はまだ EstimateItem のままである。

## relatedWorkLineItemIdの現状

RepairLineItem には `relatedWorkLineItemId` があり、部品行を対応する技術料行へ紐づける受け皿は存在する。

しかし、Repair新規作成API・Repair更新APIでは初期実装として `relatedWorkLineItemId: null` を明示して保存している。

理由:

- `replaceRepairLineItems()` は全置換方式である。
- 同一replace内で新規作成されるLABOR行のidを、同時に作成するPART行へ安全に再紐づけできない。
- 技術料行と部品行の紐づけは、安定したclient temp id、二段階insert、または更新後の再マッピング設計が必要。

したがって、現時点では部品行と技術料行はDB上も独立行として扱う。

## PricingRuleの現行挙動

PricingRule は引き続き価格ルールであり、作業マスタ本体ではない。

現行挙動:

- RepairEntryForm では、`addItemCategory === "internal"` のときだけ `getPricingRules()` を呼ぶ。
- `getPricingRules()` は brand / model / caliber を主な条件として PricingRule を取得する。
- 候補名は `PricingRule.suggestedWorkName` を使う。
- Repair新規作成API・Repair更新APIでは、labor行だけを対象に PricingRule を自動作成・価格更新する。
- part行は PricingRule 自動作成・更新の対象ではない。
- `customerType` や RepairWorkCategory / RepairWorkAction / targetPartNameId を使った価格候補取得はまだ行っていない。

RepairLineItem には `pricingRuleId` があるが、現行UIから明示的に渡される導線はまだ弱く、多くの場合はnullになりうる。

## 帳票・PDF・LINE・共有ページの参照元

現行の通常Repair向け表示は、主に Estimate / EstimateItem を参照している。

| 画面・処理 | 主な参照元 | 備考 |
| --- | --- | --- |
| Repair詳細 | Repair -> Estimate -> EstimateItem | 部品表示で PartsMaster.grade / notes2 を後読みする箇所あり |
| 見積書ページ / PDF | EstimateDocument -> Repair -> Estimate -> EstimateItem | 部品表示で PartsMaster.grade / notes2 を使用 |
| 納品書ページ | DeliveryNote -> Repair -> Estimate -> EstimateItem | 金額・明細はEstimateItem由来 |
| 請求書 / 月次請求 | Invoice -> DeliveryNote / Repair -> EstimateItem | InvoiceItemはなく、納品書・Repair単位で集計 |
| 顧客共有ページ | Repair -> Estimate -> EstimateItem | 現在DB値を表示するため、snapshot方針の整理対象 |
| LINE送信 | 共有URL送信、または対象帳票情報 | 明細の正は現状EstimateItem側 |

RepairLineItem は、現時点ではこれらの表示元へ接続していない。

## PublicCaseの参照元

PublicCase は通常Repairの直表示ではなく、公開事例用スナップショットである。

現行のB2C / B2B事例ページは `src/lib/public-cases.ts` 経由で PublicCase / PublicCaseWorkItem / PublicCasePartItem を読み、`workItems` と `partItems` を表示している。通常Repairの EstimateItem や RepairLineItem を直接表示しているわけではない。

今後の方針は以下である。

```txt
RepairLineItemなどの確定明細
↓
公開向けに選別・集約・文言調整
↓
PublicCaseWorkItem / PublicCasePartItem
↓
B2C / B2B PublicCase表示
```

通常Repairの帳票とPublicCase表示を混ぜないことが重要である。

## 通常RepairとPublicCase/B2C表示の違い

通常Repair:

- 業務上の明細を正確に分ける。
- 技術料行と部品行を別行として扱う。
- 見積書・納品書・共有ページでは EstimateItem snapshot を中心に表示する。
- 作業マスタや部品マスタを後読みして過去表示を変えない。

PublicCase / B2C表示:

- 公開事例として見やすい単位へ変換する。
- B2Cでは価格非表示を基本とする。
- B2Bでは公開許可された価格だけ表示する。
- 「ゼンマイ交換」のような作業+部品の集約表示は、PublicCase生成時の表示名候補として扱う。

結論として、`ゼンマイ交換 15,000円` は通常Repairの見積書・納品書・共有ページの標準表示ではない。将来、B2B/B2C PublicCase用の公開スナップショットで必要に応じて生成する候補である。

## 構造化フィールドが自然に入る場所

構造化入力の主な保存先は RepairLineItem のLABOR行である。

LABOR行に自然に入るもの:

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabelSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`
- `pricingRuleId`
- `itemNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

PART行に自然に入るもの:

- `partsMasterId`
- `itemNameSnapshot`
- `gradeNameSnapshot`
- `notesForCustomerSnapshot`
- `quantity`
- `unitPrice`
- `amount`
- 将来的な `relatedWorkLineItemId`

PricingRuleは、主にLABOR行の構造化条件と価格候補を結びつける位置づけが自然である。部品価格・在庫・仕入情報はPartsMaster側で扱う。

## 現行ギャップ

- UIにRepairWorkCategory / RepairWorkAction / targetPartNameId / detailLabelを選ぶ導線がない。
- API payloadに構造化作業フィールドがまだ乗っていない。
- `src/lib/repair-line-items.ts` のadapterは、構造化フィールドを十分に受け取る形へまだ更新されていない。
- PricingRule検索は RepairWorkCategory / RepairWorkAction / targetPartNameId をまだ使っていない。
- `relatedWorkLineItemId` はschema上存在するが、初期二重書きではnull固定である。
- 帳票・共有ページはまだEstimateItemを参照している。
- PublicCase下書き生成は、通常RepairのRepairLineItemから作る導線へまだ接続していない。

## 次Task案

### Task 108-9E

RepairLineItem adapter / input型へ構造化フィールドを通すための実装設計を行う。

検討対象:

- RepairLineItemInputへの `repairWorkCategoryId` / `repairWorkActionId` / `targetPartNameId` / `detailLabelSnapshot` 追加
- EstimateItemLikeInputからの移行ではなく、将来のRepairLineItem専用payloadをどう持つか
- 既存EstimateItem導線を壊さない保存順

### Task 108-10

RepairEntryFormの構造化作業入力UIを設計する。

検討対象:

- 技術料行のみRepairWorkCategory / RepairWorkAction / PartNameMaster / detailLabelを持つ
- 部品行はPartsMaster中心のまま維持する
- 「部品名 + 処置」の全組み合わせを作らない
- detailLabelは当面snapshot文字列とし、マスタ化は前提にしない

### Task 108-11

PricingRuleを構造化条件で検索・候補提示する設計を行う。

検討対象:

- 既存 `suggestedWorkName` 互換を維持する
- `repairWorkCategoryId` / `repairWorkActionId` / `targetPartNameId` を価格候補条件に使う
- customerType / movementMaker / caliber系条件との優先順位

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- DB
- API
- UI
- RepairEntryForm
- RepairLineItem保存処理
- EstimateItem保存処理
- PricingRule
- 帳票 / PDF / LINE
- 共有ページ
- PublicCase生成・表示

