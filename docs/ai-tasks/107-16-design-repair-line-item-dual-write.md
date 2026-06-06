# AI Task 107-16: RepairLineItem二重書き実装前の接続設計

## 概要

Task 107-14 / 107-15で作成した `RepairLineItem` 用lib関数と変換adapterを、既存Repair保存APIへ接続する前に、どこへ二重書きを入れるのが安全か調査・設計した。

このTaskでは、コード変更は行わない。調査・設計Markdown作成のみ。

結論:

- 既存 `EstimateItem` 保存は残す。
- `RepairLineItem` は、既存保存API内で `PartsMaster` 同期後の明細payloadから二重書きするのが安全。
- 初期二重書きでは `relatedWorkLineItemId` は保存しない。
- 次Taskでは、新規作成APIと更新APIの両方へ同じ方針で二重書きを追加するのがよい。
- ただし、既存UI/帳票/共有ページ/PublicCaseはまだ `EstimateItem` またはPublicCase snapshotを読み続ける。

## 現行Repair新規作成導線

対象:

- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`

画面側:

- `RepairEntryForm` は `lineItems` stateを持つ。
- 保存時に `payload.estimate.items` を作る。
- `type` は `i.category.includes('part') ? 'part' : 'labor'`。
- part行は `partsMasterId` / `grade` / `note2` / `partRef` / `cousinsNumber` などをpayloadへ含める。
- labor行も同じ `estimate.items` に入る。

API側の保存順:

1. Customer / Watch / Repairを作成する。
2. `body.estimate?.items` を `estimateItems` として受け取る。
3. part行は `PartsMaster` と同期する。
   - `partsMasterId` がある場合は既存PartsMasterを読み、入力値で更新する。
   - `partsMasterId` がない場合はPartsMasterを新規作成する。
   - 同期後のpayloadへ `partsMasterId: syncedPart.id` を戻す。
4. `Estimate` を作成する。
5. `Estimate.items.create` で `EstimateItem` を作成する。
6. labor行から `PricingRule` を自動作成または価格更新する。
7. part行から在庫不足判定・OrderRequest作成・在庫減算を行う。

`EstimateItem` 保存値:

- `itemName: item.name`
- `type: item.type`
- `unitPrice: Math.floor(Number(item.price) || 0)`
- `quantity: item.quantity || 1`
- `partsMasterId: item.partsMasterId ? Number(item.partsMasterId) : null`

二重書きに使いやすいタイミング:

- `PartsMaster` 同期後、`estimateItems` に正しい `partsMasterId` が入った後。
- `Estimate` 作成直後または `EstimateItem` 作成直後。

## 現行Repair更新導線

対象:

- `src/app/api/repairs/[id]/route.ts`

保存順:

1. Repair本体を更新する。
2. `body.estimate?.items` がある場合、合計・技術料・部品代・税額を計算する。
3. `estimate.upsert` でEstimateを作成または更新する。
4. 既存 `EstimateItem` を `deleteMany({ where: { estimateId } })` で全削除する。
5. part行は `PartsMaster` と同期する。
6. `estimateItem.createMany` でEstimateItemを全件再作成する。
7. part行の `partsMasterId` からpending OrderRequest数量を更新する。
8. labor行から `PricingRule` を自動作成または価格更新する。

特徴:

- 差分更新ではなく全置換方式。
- `EstimateItem.id` は更新ごとに変わる。
- `body.estimate.items` から直接 `EstimateItem` を作るのではなく、part行だけは `PartsMaster` 同期後の `syncedEstimateItems` を使う。

二重書きに使いやすいタイミング:

- `syncedEstimateItems` 作成後。
- `estimateItem.createMany` の直後。

## EstimateItem保存箇所

新規作成:

- `src/app/api/repairs/route.ts`
- `estimate.create({ data: { ..., items: { create: estimateItems.map(...) } } })`

更新:

- `src/app/api/repairs/[id]/route.ts`
- `estimate.upsert(...)`
- `estimateItem.deleteMany(...)`
- `estimateItem.createMany(...)`

関連する補助処理:

- `PartsMaster` 同期: `createOrUpdatePartsMaster`
- `PricingRule` 自動作成/更新: `pricingRule.createMany` / `pricingRule.updateMany`
- 部品発注/在庫連動: `OrderRequest` 作成・更新、`PartsMaster.stockQuantity` 更新

## RepairLineItem二重書き候補位置

### A案: EstimateItem保存直後に同じpayloadからRepairLineItemもreplace

概要:

- 既存の `EstimateItem` 保存処理はそのまま残す。
- `EstimateItem` 保存直後に、同じ同期済みpayloadから `RepairLineItem` を `replaceRepairLineItems` で全置換する。

利点:

- 既存UI/帳票/共有ページを壊しにくい。
- `PartsMaster` 同期後の `partsMasterId` を使える。
- 既存の全置換思想と揃う。
- `RepairLineItem` はまだ表示元ではないため、導入リスクが小さい。

欠点:

- `EstimateItem` と `RepairLineItem` の二重書きが始まる。
- `RepairLineItem.id` は更新時に再採番される可能性がある。
- 将来の `relatedWorkLineItemId` 再紐づけには不向き。

評価:

- 初期二重書きの第一候補。

### B案: payloadを先にRepairLineItemInputへ変換し、RepairLineItem保存後にEstimateItem保存

概要:

- 入力payloadを最初に `RepairLineItemInput` に変換する。
- `RepairLineItem` を保存した後、その結果から `EstimateItem` を作る。

利点:

- 将来方針の「RepairLineItemが正」に近い。
- `EstimateItem` を見積時点snapshotとして生成する本線へ移行しやすい。

欠点:

- 現行保存導線の順序を大きく変える。
- `PartsMaster` 同期、PricingRule同期、OrderRequest更新との責務整理が必要。
- 既存の `EstimateItem` 保存処理変更に近くなり、今回の段階としては重い。

評価:

- 将来目標としてはよいが、初期二重書きでは採用しない。

### C案: 既存EstimateItem保存結果からRepairLineItemを生成

概要:

- `EstimateItem` 保存後、DBからEstimateItemを読み直す。
- 読み直したEstimateItemから `RepairLineItem` を作る。

利点:

- 既存保存結果を正として扱える。
- `EstimateItem` に実際保存された値と `RepairLineItem` が一致しやすい。

欠点:

- `EstimateItem` には `grade` / `note2` snapshotがないため、PartsMaster後読みに戻りやすい。
- `PricingRuleId` などもEstimateItemにはない。
- 余分なDB readが増える。
- 正本方針の「RepairLineItemを正式明細本体」からは遠い。

評価:

- 既存値一致を重視するなら候補だが、snapshot設計としてはA案より弱い。

## A案/B案/C案比較

| 案 | 安全性 | 本線との近さ | 実装範囲 | 注意点 | 判断 |
|---|---|---|---|---|---|
| A案 | 高い | 中 | 小〜中 | 全置換でID再採番。関連紐づけは後回し。 | 初期採用 |
| B案 | 中 | 高い | 大 | 既存EstimateItem保存導線変更に近い。 | 後続 |
| C案 | 中 | 低〜中 | 中 | snapshot不足。PartsMaster後読みに寄りやすい。 | 補助案 |

推奨:

- 初期はA案。
- `PartsMaster` 同期後のpayloadを使い、`EstimateItem` 保存直後に `RepairLineItem` をreplaceする。
- 表示元は変えない。

## transaction方針

現行の新規作成・更新APIは、Repair本体、Estimate、EstimateItem、PartsMaster同期、PricingRule同期、OrderRequest処理をtransaction内で実行している。

最終方針:

- `EstimateItem` 保存と `RepairLineItem` 保存は同一transactionに入れる。
- `RepairLineItem` が正式明細本体であるため、保存に失敗した場合はRepair保存全体を失敗にする。

初期二重書きでの考え方:

- 既存導線への影響を避けるため、表示元はまだ `EstimateItem` のまま。
- ただしDB整合性としては `RepairLineItem` 二重書き失敗を無視しない。
- 失敗を握りつぶす「補助保存」にはしない方がよい。

理由:

- 補助保存として失敗を無視すると、どのRepairに正式明細があるか曖昧になる。
- 次段階で `RepairLineItem` を正にするときの移行確認が難しくなる。

## relatedWorkLineItemIdの初期扱い

現状:

- `replaceRepairLineItems` は全削除・再作成方式。
- 同一replace内で新規作成されたLABOR行のIDを、PART行へ自動紐づけする処理はない。

初期方針:

- 初期二重書きでは `relatedWorkLineItemId` を保存しない。
- adapter入力に値があっても、API接続時の変換では明示的にnullへ落とす方針を検討する。
- 部品と技術料の紐づけは後続Taskで扱う。

理由:

- 既存payloadには「どの部品がどの技術料に紐づくか」の安定情報がない。
- replace方式ではID再採番が起きる。
- 誤った紐づけはB2B PublicCase価格表示に影響する。

後続で検討すること:

- フォーム上で部品行と技術料行を紐づけるUI/データ構造。
- replace内で一時キーを使い、作成後IDに変換する方式。
- `relatedWorkLineItemId` がnullの部品を警告する仕組み。

## 既存UI/帳票/PublicCaseへ影響を出さない方針

この段階で変えないもの:

- RepairEntryFormの表示・入力。
- `/api/repairs` / `/api/repairs/[id]` のレスポンス形式。
- `EstimateItem` 保存処理。
- 見積書PDF。
- 納品書PDF。
- 顧客共有ページ。
- LINE送信。
- 請求書。
- PublicCase生成・表示。

二重書き後の読み取り方針:

- 既存UI/帳票/共有ページはまだ `EstimateItem` を読む。
- `RepairLineItem` は次段階の正式明細本体として蓄積する。
- PublicCaseはまだ既存 `PublicCase` snapshotを読む。

注意:

- `RepairLineItem` を保存し始めても、帳票表示を即座に変えない。
- `PartsMaster.grade` / `notes2` 後読み問題は別Taskで段階移行する。

## 推奨実装順

1. `src/lib/repair-line-items.ts` のadapterをAPI接続用に確認する。
2. 新規作成APIで、`PartsMaster` 同期後の `estimateItems` から `RepairLineItemInput[]` を作る。
3. 新規作成APIで、`EstimateItem` 保存直後に `replaceRepairLineItems(repair.id, inputs)` を呼ぶ。
4. 更新APIで、`PartsMaster` 同期後の `syncedEstimateItems` から `RepairLineItemInput[]` を作る。
5. 更新APIで、`EstimateItem` 保存直後に `replaceRepairLineItems(id, inputs)` を呼ぶ。
6. 初期接続では `relatedWorkLineItemId` をnullにする。
7. `npx tsc --noEmit --pretty false --incremental false` を実行する。
8. 可能ならローカルDBで新規作成・更新を手動確認する。

実装時の注意:

- `replaceRepairLineItems` は現在 `prisma.$transaction` を内部で開始する。既存APIの `tx` 内で呼ぶ場合、ネストtransactionにならないように調整が必要。
- そのため、実装前に `replaceRepairLineItems` が `tx` を受け取れる形か、別関数を追加するかを検討する。

## 次Task案

推奨:

```txt
Task 107-17:
RepairLineItem二重書き接続のため、replaceRepairLineItemsを既存transaction内で使える形に調整する。
```

理由:

- 現行 `replaceRepairLineItems` は内部で `prisma.$transaction` を開始する。
- `/api/repairs` と `/api/repairs/[id]` はすでにtransaction内で保存している。
- 先にlib側をtransaction client対応にしてからAPI接続した方が安全。

その次:

```txt
Task 107-18:
Repair新規作成APIと更新APIの両方にRepairLineItem二重書きを追加する。
```

107-18での方針:

- A案を採用。
- `EstimateItem` 保存直後に `RepairLineItem` をreplaceする。
- 既存UI/帳票/PublicCaseは変更しない。
- `relatedWorkLineItemId` は初期保存しない。

## 未解決事項

- `replaceRepairLineItems` をtransaction client対応にする具体的な関数形。
- 新規作成APIと更新APIで同じ変換処理を共通化するか。
- `PricingRuleId` を初期二重書きで保存できるか。
- `PricingRule` 自動作成後のIDをどう取得するか。
- `relatedWorkLineItemId` の本格対応。
- `RepairLineItem` を全置換し続けるか、安定IDを持つ差分更新に移るか。
- `EstimateItem.orderStatus` / `orderedAt` を将来どこへ移すか。
- `PartsMaster.grade` / `notes2` 後読みをいつ止めるか。
- 通常Repair由来PublicCase下書きをいつ `RepairLineItem` 起点にするか。

## 変更しなかったもの

- schema変更なし
- migration作成なし
- db pushなし
- seed変更なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- EstimateItem保存処理変更なし
- RepairLineItem保存処理の接続なし
- 帳票/PDF/LINE変更なし
- PublicCase生成変更なし
