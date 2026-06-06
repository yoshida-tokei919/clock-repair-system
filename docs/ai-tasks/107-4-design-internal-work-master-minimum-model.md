# AI Task 107-4: 内装作業マスタ最小モデル設計

> 注記:
> 本ファイルは内装作業マスタの最小モデル案であり、schema実装指示ではない。
> 旧Excel由来候補や107-5の大量seed案を正式マスタとして採用しない。
> 実装前に、Repair明細 / EstimateItem / RepairLineItem の受け皿方針を確定する。

## 調査概要

内装作業マスタを新設する前に、最小DBモデル案と責務分離を設計する。

今回確認した主なファイル:

- `docs/ai-tasks/107-0-investigate-current-internal-work-master-structure.md`
- `docs/ai-tasks/107-1-investigate-repair-items-documents-shared-page-for-work-master.md`
- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`
- `docs/ai-tasks/107-3-design-common-line-item-snapshot-fields.md`
- `prisma/schema.prisma`
- `src/lib/estimate-item.ts`
- `src/lib/repairs.ts`
- `src/lib/masterData.ts`
- `src/actions/master-actions.ts`
- `src/app/api/masters/pricing/route.ts`
- `src/app/api/masters/pricing/[id]/route.ts`
- `src/app/(app)/masters/pricing/page.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/lib/public-cases.ts`

確認できたこと:

- 現行schemaに独立した作業マスタ本体はない。
- `PricingRule` は `suggestedWorkName` と価格条件を持つが、作業カテゴリ、内装/外装区分、B2B/B2C表示名を持たない。
- `getWorkMasters()` / `upsertWorkMaster()` は `PricingRule` をWorkMaster風に扱っている。
- `upsertWorkMaster()` の引数には `category: internal | external` があるが、`PricingRule` には保存先がない。
- `RepairEntryForm` の内装技術料候補は `getPricingRules()` から取得され、`suggestedWorkName` / `minPrice` が候補になる。
- 部品側は `PartCategoryMaster` / `PartNameMaster` / `PartsMaster` と `part-input-options.ts` があり、カテゴリ・部品名の土台がある。

## 107-0〜107-3の結論整理

107-0:

- 現行アプリに独立した内装作業マスタ本体はない。
- `PricingRule` は価格ルールとして残し、作業マスタは新規に作るべき。
- 部品マスタは作業マスタとは別物として扱う。

107-1:

- 現行の確定明細は `EstimateItem` が中心。
- 帳票・共有ページ・LINE・PDF生成は `Repair -> Estimate -> EstimateItem` を広く読む。
- PublicCaseは公開事例用の別スナップショットであり、確定明細とは分ける。

107-2:

- 短期安全性は `EstimateItem` 拡張案が高い。
- 長期保守性は `RepairLineItem` 新設案が高い。
- 最終形は `RepairLineItem` 新設寄りだが、まずA案/B案共通のスナップショット仕様を固める段階B案を推奨。

107-3:

- 帳票・共有ページ・PublicCaseでマスタ後読みしないため、表示名・価格・グレード・注記は明細側へスナップショット保存する。
- 技術料明細には `workMasterId` / `pricingRuleId` / 表示名snapshot / 価格表示フラグが必要。
- 部品明細には `partsMasterId` / `relatedWorkLineItemId` / 部品表示snapshotが必要。

## 内装作業マスタの責務

内装作業マスタは、以下を担当する。

- 案件入力時の作業内容候補。
- 内装修理の作業カテゴリ選択。
- 技術料明細の標準作業名。
- 帳票向け表示名のdefault。
- B2B表示名のdefault。
- B2C表示名のdefault。
- PublicCase生成時に明細へ保存する表示名default。
- PricingRule検索・候補価格取得への接続。
- 自由入力を減らし、候補がない場合だけ新規候補化する導線の土台。

担当しないもの:

- 部品在庫。
- 部品仕入価格。
- 部品写真。
- 部品サイズ詳細。
- 海外検索。
- FMP過去案件の文字列クリーニング。
- 帳票・共有ページ・PublicCaseの過去表示そのもの。

重要な責務分離:

- 作業マスタは入力補助と標準化の元データ。
- 明細スナップショットは確定表示データ。
- PricingRuleは価格ルール。
- PartsMasterは部品実体。
- PublicCaseは公開用スナップショット。

## 作業カテゴリモデル案

推奨は、`WorkCategoryMaster` を階層型にする。

理由:

- UIで「内装修理 -> カレンダー系 -> 日車/曜車系」のようにドリルダウンしやすい。
- `categoryPathSnapshot` を明細側に保存する前提と相性がよい。
- 初期は2階層程度で始め、将来3階層以上に増やせる。
- 外装修理を将来追加する場合も同じモデルを使える。

固定2階層案との比較:

- 固定2階層は実装が単純だが、カテゴリ追加時に設計変更が起きやすい。
- 階層型は少し複雑だが、初期seedを浅い階層にすれば運用負荷は抑えられる。

初期カテゴリ例:

- 内装修理
- オーバーホール系
- 精度調整系
- 巻上げ系
- 針回し系
- カレンダー系
- 輪列系
- 脱進調速系
- 自動巻系
- 電池・電子回路系
- その他

カテゴリは「部品カテゴリ」ではなく「作業カテゴリ」。ただし、内装部品カテゴリと対応しやすい名前にしておくと入力時の候補絞り込みに使いやすい。

## 作業名モデル案

推奨は、`WorkNameMaster` に完成作業名を持つ。

例:

- オーバーホール
- 半オーバーホール
- 精度調整
- ゼンマイ交換
- 巻真交換
- カレンダー修理
- 自動巻修理
- 輪列修理
- 脱進調速修理
- 電池交換
- 回路交換
- 接点修理

`WorkNameMaster` は、作業マスタ本体として以下を持つ。

- 作業カテゴリへの参照。
- 内装/外装などのscope。
- 標準名。
- 検索用テキスト。
- 帳票/B2B/B2C/PublicCase向け表示名default。
- 価格候補のdefault。
- 価格表示フラグdefault。
- 有効/無効。

このモデルは、作業の「完成名」を中心にする。初期実装では「対象部品 + 処置」から都度生成しない。

## 作業名と処置を分けるかの比較

### 案A: WorkNameMasterに完成名として持つ

例:

- ゼンマイ交換
- 巻真交換
- 精度調整
- カレンダー修理

メリット:

- 実装が単純。
- 帳票・共有ページ・PublicCaseへ渡しやすい。
- PricingRuleの `suggestedWorkName` と紐づけやすい。
- 検索型コンボボックスで候補表示しやすい。

デメリット:

- 「対象部品 + 処置」の再利用性は低い。
- 作業名が増えやすい。
- 分析時に「交換」だけで集計するには別項目が必要。

### 案B: 作業対象と処置を分ける

例:

- 作業対象: ゼンマイ
- 処置: 交換
- 生成名: ゼンマイ交換

メリット:

- 構造化としてきれい。
- 将来的な分析に強い。
- 部品マスタとの関係を整理しやすい。

デメリット:

- 初期実装が重い。
- 表示名生成ルールが必要。
- B2B/B2Cの丸め表示が複雑になる。
- FMP由来の既存候補名とは直接合わせづらい。

### 案C: 初期は完成名で持ち、optionalでtarget/actionの余地を残す

推奨は案C。

初期実装では `WorkNameMaster` に完成名を持つ。将来のために、任意項目として以下を持てる余地を残す。

- `targetLabel`
- `actionLabel`
- `treatmentLabel`
- `relatedPartCategoryId`
- `relatedPartNameId`

ただし、これらは最小実装では必須にしない。

理由:

- 現行導線からの移行が軽い。
- PricingRuleとの接続がしやすい。
- 将来の構造化・分析にも逃げ道を残せる。
- FMP過去案件の文字列に引っ張られすぎない。

## B2B/B2C/帳票/PublicCase表示名設計

表示名は `WorkNameMaster` にdefaultとして持ち、明細保存時に `EstimateItem` または `RepairLineItem` へsnapshotする。

マスタ側に持つdefault:

- `defaultInternalName`
- `defaultEstimateDisplayName`
- `defaultB2bDisplayName`
- `defaultB2cDisplayName`
- `defaultPublicCaseDisplayName`

明細側に保存するsnapshot:

- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`

方針:

- 管理画面・社内用は `defaultInternalName`。
- 見積書・納品書は `defaultEstimateDisplayName`。
- B2B共有ページ・B2B PublicCaseは `defaultB2bDisplayName`。
- B2C共有ページ・B2C PublicCaseは `defaultB2cDisplayName`。
- `defaultPublicCaseDisplayName` は任意。初期はB2B/B2C表示名から生成してよい。

例:

| 内部名 | 帳票表示名 | B2B表示名 | B2C表示名 | PublicCase B2C |
|---|---|---|---|---|
| カンヌキ修正 | カンヌキ修正 | カンヌキ修正 | 巻上げ機構修理 | 内装修理 |
| ゼンマイ交換 | ゼンマイ交換 | ゼンマイ交換 | 内装修理 | 内装修理 |
| 電池接点修理 | 接点修理 | 接点修理 | 電池まわり修理 | 電池まわり修理 |

B2Cでは作業粒度を粗くする必要がある。B2Bでは専門用語を出してよい。帳票表示名と共有ページ表示名は初期は同じでもよいが、保存項目は分けておく。

## PricingRuleとの関係

PricingRuleは価格ルールとして残す。作業マスタ本体にはしない。

現行PricingRuleの役割:

- ブランド/モデル/Cal条件付き価格候補。
- 技術料候補名。
- Repair入力時の候補価格。
- labor明細保存時の学習先。

不足:

- 作業カテゴリ。
- 内装/外装区分。
- B2B/B2C表示名。
- 帳票表示名。
- 作業/処置。
- PublicCase向け表示名。

推奨する接続:

- `PricingRule.workNameId` を追加候補にする。
- `PricingRule.workCategoryId` は初期必須にしない。`workNameId -> categoryId` で辿れるため。
- `PricingRule.suggestedWorkName` は移行期間fallbackとして残す。
- `PricingRule.customerType` は検索条件に使う方向で再設計する。
- `brandId` / `modelId` / `caliberId` は現行互換として残す。
- 将来的に `movementMakerId` / `movementCaliberId` / `baseMovementMakerId` / `baseMovementCaliberId` を価格条件に追加検討する。

PricingRule検索の優先度案:

1. `workNameId` + movementCaliberId + customerType
2. `workNameId` + baseMovementCaliberId + customerType
3. `workNameId` + caliberId + customerType
4. `workNameId` + brandId/modelId/caliberId
5. `suggestedWorkName` fallback

明細保存時にsnapshotするもの:

- `pricingRuleId`
- `pricingRuleNameSnapshot`
- `unitPrice`
- `priceSource`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`

価格ルールが後で変わっても、過去明細は変えない。

## EstimateItem / RepairLineItemとの接続

作業マスタ選択時、明細側には以下を保存する。

- `workNameId`
- `pricingRuleId`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `workCategoryPathSnapshot`
- `workTypeSnapshot`
- `showPriceB2b`
- `showPriceB2c`
- `unitPrice`
- `priceSource`

### EstimateItem拡張案の場合

既存 `EstimateItem` に以下を追加する想定。

- `workNameId`
- `pricingRuleId`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `pricingRuleNameSnapshot`
- `priceSource`
- `showPriceB2b`
- `showPriceB2c`

互換方針:

- 既存 `itemName` は当面維持。
- `itemName` には `estimateDisplayNameSnapshot` と同じ値を入れる。
- 帳票・共有ページは段階的に `estimateDisplayNameSnapshot -> itemName` fallbackへ移す。

### RepairLineItem新設案の場合

`RepairLineItem` に以下を持たせる想定。

- `repairId`
- `estimateId`
- `lineType`
- `workNameId`
- `pricingRuleId`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `pricingRuleNameSnapshot`
- `priceSource`
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
- `sortOrder`

互換方針:

- 最終的には `RepairLineItem` を正とし、`EstimateItem` は見積書互換または派生明細にする。
- 二重管理期間を作る場合は、正を `RepairLineItem` に固定する。

## PublicCase生成元としての扱い

PublicCaseは作業マスタを直接後読みしない。

基本方針:

- 作業マスタ選択時に、明細へ表示名・価格表示フラグをsnapshotする。
- PublicCase生成時は、Repair明細スナップショットから `PublicCaseWorkItem` / `PublicCasePartItem` を作る。
- PublicCase生成後は、WorkNameMaster / PricingRule / PartsMaster の変更で表示を変えない。

PublicCaseWorkItemへ渡すもの:

- `normalizedWorkName`: `internalNameSnapshot` または標準名。
- `b2bDisplayName`: `b2bDisplayNameSnapshot`。
- `b2cDisplayName`: `b2cDisplayNameSnapshot`。
- `laborPrice`: `amount` または `unitPrice`。
- `showPriceB2b`: 明細snapshot。
- `showPriceB2c`: B2Cではfalse固定。
- `category`: `workCategoryPathSnapshot`。
- `action` / `actionDetail`: optionalの `actionLabel` / `treatmentLabel` があれば渡す。
- `ruleSnapshot`: `workNameId`, `pricingRuleId`, `priceSource` など公開可能な範囲。

表示ルール:

- B2C PublicCaseは価格非表示。
- B2B PublicCaseは `showPriceB2b = true` かつ正の価格のみ表示。
- 内部管理文言は表示しない。
- コピー表記を含むRepairはPublicCase化しない、またはレビュー除外する。

## 推奨する最小DBモデル案

### WorkCategoryMaster

作業カテゴリ。内装/外装を同じモデルで扱えるが、初期は内装のみ投入する。

必要項目案:

| 項目名 | 型イメージ | 必要性 | 説明 |
|---|---|---|---|
| `id` | String cuid | 必須 | 主キー。 |
| `key` | String unique | 必須 | `internal_calendar` など安定キー。 |
| `parentId` | String nullable | 推奨 | 階層カテゴリ用。 |
| `scope` | String | 必須 | `internal` / `external`。初期は `internal`。 |
| `nameJa` | String | 必須 | 管理・表示用カテゴリ名。 |
| `nameEn` | String nullable | 任意 | 英語名。 |
| `displayOrder` | Int | 必須 | 表示順。 |
| `isActive` | Boolean | 必須 | 有効/無効。 |
| `createdAt` | DateTime | 必須 | 作成日時。 |
| `updatedAt` | DateTime | 必須 | 更新日時。 |

index案:

- `scope`
- `parentId`
- `scope, displayOrder`
- `isActive`

### WorkNameMaster

作業名本体。初期は完成作業名として持つ。

必要項目案:

| 項目名 | 型イメージ | 必要性 | 説明 |
|---|---|---|---|
| `id` | String cuid | 必須 | 主キー。 |
| `key` | String unique | 必須 | `mainspring_replace` など安定キー。 |
| `categoryId` | String | 必須 | `WorkCategoryMaster` 参照。 |
| `scope` | String | 必須 | `internal` / `external`。初期は `internal`。 |
| `nameJa` | String | 必須 | 標準作業名。例: `ゼンマイ交換`。 |
| `nameKana` | String nullable | 任意 | かな検索用。 |
| `nameEn` | String nullable | 任意 | 英語名。 |
| `searchText` | String | 必須 | 検索型コンボボックス用。 |
| `defaultInternalName` | String | 必須 | 社内管理名default。 |
| `defaultEstimateDisplayName` | String | 必須 | 帳票表示名default。 |
| `defaultB2bDisplayName` | String | 必須 | B2B表示名default。 |
| `defaultB2cDisplayName` | String | 必須 | B2C表示名default。 |
| `defaultPublicCaseDisplayName` | String nullable | 任意 | PublicCase専用表示名。初期はnullableでよい。 |
| `defaultLaborPrice` | Int nullable | 任意 | 価格ルールがない場合の目安。 |
| `defaultShowPriceB2b` | Boolean | 必須 | B2B価格表示default。 |
| `defaultShowPriceB2c` | Boolean | 必須 | B2C価格表示default。PublicCaseではfalseに寄せる。 |
| `targetLabel` | String nullable | 任意 | 将来用。例: `ゼンマイ`。 |
| `actionLabel` | String nullable | 任意 | 将来用。例: `交換`。 |
| `treatmentLabel` | String nullable | 任意 | 将来用。例: `修理`。 |
| `relatedPartCategoryId` | String nullable | 任意 | `PartCategoryMaster` 参照候補。 |
| `relatedPartNameId` | String nullable | 任意 | `PartNameMaster` 参照候補。 |
| `displayOrder` | Int | 必須 | 表示順。 |
| `isActive` | Boolean | 必須 | 有効/無効。 |
| `createdAt` | DateTime | 必須 | 作成日時。 |
| `updatedAt` | DateTime | 必須 | 更新日時。 |

index案:

- `categoryId`
- `scope`
- `scope, isActive, displayOrder`
- `searchText`
- `relatedPartCategoryId`
- `relatedPartNameId`

### PricingRuleへの追加候補

PricingRuleは価格ルールとして残す。

追加候補:

| 項目名 | 型イメージ | 必要性 | 説明 |
|---|---|---|---|
| `workNameId` | String nullable | 推奨 | `WorkNameMaster` 参照。 |
| `workCategoryId` | String nullable | 後回し | `workNameId` から辿れるため初期必須ではない。 |
| `movementMakerId` | Int nullable | 後回し | ムーブメントメーカー条件。 |
| `movementCaliberId` | Int nullable | 後回し | ムーブメントCal条件。 |
| `baseMovementMakerId` | Int nullable | 後回し | ベースムーブメーカー条件。 |
| `baseMovementCaliberId` | Int nullable | 後回し | ベースムーブCal条件。 |

残す項目:

- `suggestedWorkName`
- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `minPrice`
- `maxPrice`
- `notes`

移行方針:

- 初期は `suggestedWorkName` をfallbackとして残す。
- 新規作成分はできるだけ `workNameId` を持たせる。
- 既存PricingRuleは手動または別タスクで `workNameId` へ紐づける。

### 明細側へ保存する項目

EstimateItem拡張案の場合:

- `workNameId`
- `pricingRuleId`
- `workTypeSnapshot`
- `workCategoryPathSnapshot`
- `internalNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `pricingRuleNameSnapshot`
- `priceSource`
- `showPriceB2b`
- `showPriceB2c`

RepairLineItem新設案の場合:

- 上記に加えて、`repairId`, `lineType`, `sortOrder`, `amount`, `taxRateSnapshot`, `showOnEstimate`, `showOnDeliveryNote`, `showOnInvoice`, `showOnCustomerPage` を正式明細側に持つ。

## 初期実装でやらないこと

- 外装修理作業マスタの詳細設計。
- 部品マスタ全体の再設計。
- WorkActionMaster / WorkTreatmentMaster の独立テーブル化。
- WorkDisplayNameRule の独立テーブル化。
- FMP過去案件の再クリーニング。
- FMP由来文字列の自動マスタ投入。
- PublicCase生成ロジック変更。
- RepairEntryForm UI変更。
- schema変更。
- seed作成。
- migration作成。
- PricingRuleのmovement条件追加。
- InvoiceLineItem設計。

## 次Task案

- Task 107-5: `EstimateItem` 拡張で始める場合の最小schema差分案を設計する。
- Task 107-6: `RepairLineItem` 新設で始める場合の最小schema差分案を設計する。
- Task 107-7: 作業マスタ初期seed候補を、内装修理のカテゴリ・完成作業名だけに限定して設計する。
- Task 107-8: PricingRuleとWorkNameMasterの移行・紐づけ設計を行う。
- Task 107-9: RepairEntryFormの内装修理ドリルダウン/検索型コンボボックス入力設計を行う。
- Task 107-10: PublicCase生成時の明細スナップショット変換設計を行う。

## 未解決事項

- モデル名を `WorkCategoryMaster` / `WorkNameMaster` にするか、将来の外装も見据えて `RepairWorkCategoryMaster` / `RepairWorkNameMaster` にするか。
- `scope` の値を `internal/external` にするか、既存UIに合わせて `part_internal/part_external` と揃えるか。
- `WorkNameMaster.defaultLaborPrice` を持つか、価格は完全にPricingRuleへ寄せるか。
- `WorkNameMaster.defaultPublicCaseDisplayName` を初期から使うか、B2B/B2C表示名から生成するか。
- `targetLabel` / `actionLabel` / `treatmentLabel` を初期から持つか、後で追加するか。
- 作業名検索の `searchText` にカナ、英語、別名、部品名をどこまで含めるか。
- 自由入力された作業名を即マスタ候補にするか、レビュー待ち候補テーブルを挟むか。
- `PricingRule.customerType` をRepairEntryFormの候補取得にいつ反映するか。
- movementCaliber / baseMovementCaliber をPricingRule条件にいつ追加するか。

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed変更なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- PublicCase生成ロジック変更なし
- 帳票/PDF/LINE送信処理変更なし
- テスト修正なし
- git addなし
- commitなし
- pushなし
