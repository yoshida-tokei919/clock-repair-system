# Task 108-0: RepairLineItem後の内装作業マスタ設計再開準備

## 1. 概要

Task 107系で、作業マスタ設計へ進む前に必要だった明細受け皿の整理と、RepairLineItemの初期実装・検証が完了した。

このメモは、内装作業マスタ設計へ戻る前の現在地を整理するためのもの。

このTaskでは、schema/code/API/UI/DB/seed/帳票/PublicCaseは変更しない。

## 2. 確認した正本ファイル

以下を正本として確認した。

```txt
docs/masters/internal-work-master-design-notes.md
docs/masters/external-work-master-design-notes.md
docs/masters/public-case-design-notes.md
```

正本から引き続き守る方針:

```txt
事例掲載に合わせて業務アプリ設計を歪めない
部品マスタ・作業マスタ・PublicCaseは別レイヤー
作業マスタは入力補助・標準化の元データ
帳票・共有ページ・PublicCaseはマスタ現在値を直表示しない
Repair明細 / EstimateItem / RepairLineItem のスナップショットを正とする
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない
旧Excel由来候補や107-5大量seed案をそのまま正式マスタ化しない
```

## 3. 107系成果物の現在地

主な成果物:

```txt
107-8: RepairLineItemを正式なRepair明細本体、EstimateItemを見積発行時点snapshotとする方針を決定
107-9: RepairLineItem実装前設計
107-10: RepairLineItem schema設計
107-11: RepairLineItem schema実装
107-12: ローカルDBへdb push / Prisma generate / tsc確認
107-13: 既存EstimateItem導線調査
107-14: RepairLineItem helper実装
107-15: 既存EstimateItem風入力からRepairLineItemInputへの変換adapter実装
107-16: 二重書き接続設計
107-17: transaction client対応
107-18: Repair更新APIへRepairLineItem二重書き追加
107-20: 更新API二重書き検証
107-21: Repair新規作成APIへRepairLineItem二重書き追加
107-22: 新規作成API二重書き検証
107-24: 既存導線回帰確認
107-26: 納品書 /documents/delivery/[id] HTTP 500 最小修正
```

## 4. RepairLineItemの確定済み責務

RepairLineItem:

```txt
通常Repairの正式な案件明細本体
Repairに直接紐づく
labor / part を lineType で区別する
作業マスタ・部品マスタ・PricingRuleへ接続する将来の受け皿
帳票・共有ページ・PublicCaseへ渡す表示名snapshotの起点
```

EstimateItem:

```txt
見積発行時点のスナップショット明細
既存帳票・共有ページ導線では当面読み続ける
RepairLineItemに置き換えて直表示するものではない
```

PublicCase:

```txt
公開事例用の別スナップショット
RepairLineItemや確定明細から公開用に生成する
表示時に作業マスタ・部品マスタ・PricingRuleを後読みしない
```

## 5. 実装済みのRepairLineItem最小範囲

実装済み:

```txt
RepairLineItemType enum
RepairLineItem model
Repair.repairLineItems relation
PartsMaster.repairLineItems relation
PricingRule.repairLineItems relation
src/lib/repair-line-items.ts
RepairLineItemInput
normalizeRepairLineItemInput
calculateLineAmount
estimateItemLikeToRepairLineItemInput
estimateItemsLikeToRepairLineItemInputs
getRepairLineItems
createRepairLineItems
replaceRepairLineItems
transaction client対応
Repair新規作成APIの二重書き
Repair更新APIの二重書き
```

初期二重書きの仕様:

```txt
既存EstimateItem保存は維持
EstimateItem保存直後に同じpayloadからRepairLineItemへreplace
既存UI・帳票・共有ページ・PublicCaseの読み元はまだ変えない
relatedWorkLineItemIdは初期実装ではnull
showPriceB2b / showPriceB2cは安全側でfalse
```

## 6. 検証済み事項

検証済み:

```txt
Repair更新APIでEstimateItemとRepairLineItemの二重書き成功
Repair新規作成APIでEstimateItemとRepairLineItemの二重書き成功
EstimateItem count と RepairLineItem count が一致
labor -> LABOR
part -> PART
itemName -> itemNameSnapshot / estimateDisplayNameSnapshot / b2bDisplayNameSnapshot / b2cDisplayNameSnapshot
amount = quantity * unitPrice
partsMasterIdの保存
relatedWorkLineItemId = null
受付 -> 見積中 の既存自動遷移
在庫0部品のOrderRequest作成・更新
Repair一覧 / Repair詳細の表示
```

帳票関連:

```txt
見積書PDF・請求書PDFのdownload failedはSupabase project pausedが最終原因
Supabase Dashboardでresumeし、npm run dev再起動後に復旧
納品書 /documents/delivery/4 のHTTP 500はDeliveryPDFClientのclient-only境界問題
DeliveryPDFClientLoaderでssr:falseに分離してHTTP 200へ復旧
```

## 7. まだ変えていない導線

以下はまだEstimateItemまたは既存snapshotを読む。

```txt
Repair詳細画面の既存明細表示
見積書
納品書
請求書
顧客共有ページ
LINE送信用共有URL
PublicCase生成・表示
```

以下は未実装:

```txt
RepairLineItemからEstimateItemを生成する導線
EstimateItem.repairLineItemId
DeliveryNoteLineItem
InvoiceLineItem
PublicCaseWorkItem.sourceRepairLineItemId
PublicCasePartItem.sourceRepairLineItemId
relatedWorkLineItemIdの本格紐づけ
RepairLineItemを画面表示元に切り替えること
```

## 8. 内装作業マスタへ戻る前提

内装作業マスタ設計では、RepairLineItemを接続先として考える。

想定フロー:

```txt
内装修理
-> カテゴリ
-> 部品名または作業対象
-> 作業 / 処置
-> 詳細
-> 価格
-> RepairLineItem
-> 見積作成時にEstimateItem snapshot
-> PublicCase下書き
```

作業マスタ選択時にRepairLineItemへ保存すべき候補:

```txt
workMasterId または将来決定する作業マスタ参照ID
pricingRuleId
itemNameSnapshot
estimateDisplayNameSnapshot
b2bDisplayNameSnapshot
b2cDisplayNameSnapshot
quantity
unitPrice
amount
showPriceB2b
showPriceB2c
sortOrder
```

部品明細では既に以下の受け皿がある。

```txt
partsMasterId
gradeNameSnapshot
notesForCustomerSnapshot
relatedWorkLineItemId
```

ただし、`relatedWorkLineItemId` は初期二重書きではnull。作業マスタ設計後に、部品明細と技術料明細の紐づけ方を別途決める。

## 9. 内装作業マスタ設計で守ること

守ること:

```txt
WorkCategoryMaster / WorkNameMaster をいきなりschema化しない
InternalWorkMaster をいきなりschema化しない
PricingRuleを作業マスタ本体として使わない
旧Excel由来候補をそのまま正式マスタにしない
107-5大量seed案を本線に戻さない
FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない
部品マスタ全体の仕様を作業マスタ設計に混ぜない
PublicCase表示都合で業務入力構造を歪めない
帳票・共有ページで作業マスタ現在値を直参照しない
```

優先すること:

```txt
新アプリ通常Repairの構造化入力
作業マスタは入力補助・標準化の元データ
RepairLineItemへ表示名・価格・参照IDをsnapshot保存
EstimateItemは見積発行時点snapshot
PublicCaseは公開用snapshot
```

## 10. 次に設計すべき論点

内装作業マスタで次に決めること:

```txt
作業マスタの最小モデル名
内装 / 外装を同一モデルのscopeで扱うか、別モデルにするか
カテゴリ階層の深さ
作業対象と処置を分けるか、初期は完成名で持つか
targetLabel / actionLabel / treatmentLabel を初期から持つか
B2B表示名 / B2C表示名 / 帳票表示名 / PublicCase下書き表示名のdefault項目
PricingRuleとの接続方法
RepairLineItemへ保存する作業マスタ参照ID名
RepairLineItem関連項目をいつ追加するか
```

特に重要:

```txt
作業マスタの正式model名とID型を決めるまで、RepairLineItemにworkMasterIdを追加しない
PricingRuleへのworkNameId追加は、作業マスタ側のmodel名確定後に検討する
```

## 11. 推奨する次Task案

Task 108-1:

```txt
内装作業マスタの最小モデル名・責務・ID方針を再設計する。
RepairLineItemへ将来接続する前提で、WorkCategory / WorkName / target/action/treatment の持ち方を比較する。
schema実装はまだ行わない。
```

Task 108-2:

```txt
内装作業マスタ選択時にRepairLineItemへsnapshot保存する項目を、現在のRepairLineItem schemaとの差分として整理する。
schema実装はまだ行わない。
```

Task 108-3:

```txt
内装作業マスタの初期候補を、旧Excel大量seedではなく、通常Repair入力に必要な最小候補として再設計する。
```

## 12. 今回変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
API
UI
DB
seed
帳票
PublicCase
RepairLineItem関連コード
Repair保存API
RepairEntryForm
```

## 13. 作業時点の注意

Task 107-26の未commit変更がある場合は、その差分を壊さない。

想定される未commit差分:

```txt
src/app/documents/delivery/[id]/page.tsx
src/components/pdf/DeliveryPDFClientLoader.tsx
docs/ai-tasks/107-26-fix-delivery-document-500.md
```

Task 108-0で追加するファイル:

```txt
docs/ai-tasks/108-0-prepare-internal-work-master-after-repair-line-item.md
```
