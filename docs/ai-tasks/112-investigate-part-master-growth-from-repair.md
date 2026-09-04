# Task 112: Repair案件からPartsMasterを育てるフロー調査

## 目的

Phase 2の次工程として、`PartsMaster`未登録の交換部品でも、Web検索で`partRef`判明後にRepair案件情報から部品マスタを登録できるフローを調査・設計する。

今回は調査・設計のみ。コード、schema、migration、API、UI、DBデータは変更しない。

## 読んだもの

- `AGENTS.md`
- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai/04_IMPLEMENTATION_RULES.md`
- `docs/ai-tasks/110-0` から `110-7`
- PartsMaster / PartNameMaster 関連の既存Task docs
- GitHub Issue #1: Phase 2 案件から部品マスタを育てるフローと解説書取込入口
- `prisma/schema.prisma`
- `src/lib/parts-master.ts`
- `src/lib/parts-master-search-info.ts`
- `src/lib/estimate-item.ts`
- `src/app/api/parts/*`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/components/parts/PartsForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`

## 現在のPartsMaster schema

`PartsMaster`は実部品・在庫・仕入・価格・発注用のマスタで、`PartNameMaster`とは別物。

主なfield:

- 識別: `id`
- 標準名/グレード: `standardPartNameId`, `gradeId`
- 内外装分類: `partType`, `category`, `subcategory`
- 外装時計情報: `brandId`, `modelId`, `watchRefs`
- 内装ムーブメント情報: `caliberId`, `baseCaliberId`, `movementMakerId`, `baseMakerId`
- 部品情報: `name`, `nameJp`, `nameEn`, `partRefs`, `cousinsNumber`, `grade`, `size`, `photoKey`
- 備考: `notes1`, `notes2`
- 価格: `costCurrency`, `costOriginal`, `latestCostYen`, `markupRate`, `retailPrice`
- 在庫/仕入: `stockQuantity`, `minStockAlert`, `minStockAlertEnabled`, `location`, `supplierId`

必須列は`name`, `nameJp`, `category`。価格/在庫系はDB defaultがある。

現行実装では`src/lib/parts-master.ts`の`createOrUpdatePartsMaster`がPartsMaster保存の中心。`POST /api/parts`と`PUT /api/parts/[id]`はこのhelperを呼ぶ。

## 新規PartsMaster作成に必須のfield

DB上の必須:

- `category`
- `name`
- `nameJp`

このフローで業務上最低限必須にすべきもの:

- `partType`: `interior`または`exterior`
- `category`: `interior`なら`internal`、`exterior`なら`external`
- `nameJp`: Repair明細の部品名または標準部品名表示
- `name`: legacy互換として`nameJp`と同値
- `partRefs`: Web検索で判明した部品番号。このフローの重複確認軸なので、未入力ならマスタ作成ではなく候補検索に留める

内装で追加取得/設定したいもの:

- `movementMakerId`
- `caliberId`
- `baseMakerId`
- `baseCaliberId`
- `standardPartNameId`がある場合は保存

外装で追加取得/設定したいもの:

- `brandId`
- `modelId`
- `watchRefs`
- `standardPartNameId`がある場合は保存

価格・在庫・仕入先は不明なら既存defaultを使う。`PROVISIONAL`やsource/evidence用fieldは現行schemaにないため、今回の最小フローでは追加しない。

## Repair明細からそのまま取得できるfield

Repair画面の編集中`LineItem` stateから取得できるもの:

- `partType`
- `name`
- `partNameEn`
- `partRef`
- `grade`
- `note1`
- `note2`
- `cousinsNumber`
- `stockQuantity`
- `partsMasterId`

ただしDB上の`RepairLineItem`には`partRef` / `partType` / `category` / `standardPartNameId`専用列はない。`RepairEntryForm`の保存payloadでは部品行について`targetPartNameId`などの構造化作業項目は`null`にしている。

そのため、保存済みの`RepairLineItem`だけから完全なPartsMaster候補を復元するのは難しい。最小実装では、Repair画面で部品パネルを開いている編集中のline item stateを候補作成元にするのが現実的。

## 親Repair/Watch等から取得が必要なfield

親Repair / Watch / 入力stateから取得するもの:

- 時計ブランド: `Watch.brandId`または画面の`brand`
- モデル: `Watch.modelId`または画面の`model`
- Ref: `Watch.reference.name`または画面の`refName`
- 時計Cal: `Watch.caliberId`または画面の`caliber`
- ムーブメントメーカー: `Repair.movementMakerId`または画面の`movementMaker`
- ムーブメントCal: `Repair.movementCaliberId`または画面の`movementCaliber`
- ベースメーカー: `Repair.baseMovementMakerId`または画面の`baseMovementMaker`
- ベースCal: `Repair.baseMovementCaliberId`または画面の`baseMovementCaliber`

内装PartsMasterでは`movementMakerId + caliberId`を主軸にし、外装PartsMasterでは`brandId + watchRefs`を主軸にする。

## 内装の重複判定

Issue #1の方針では、内装は`movementMaker + movementCaliber + partRef`が最強の重複キー。

現行schemaでの実装候補:

- `partType = interior`
- `movementMakerId`
- `caliberId`
- `partRefs`内の個別番号一致

`partRef`がない場合の候補検索:

- `partType = interior`
- `caliberId`
- `standardPartNameId`

注意:

- 手入力名だけでは自動同一判定しない
- `movementMakerId`がない場合でも`caliberId + partRef`候補表示は可能だが、自動確定は避ける
- `baseCaliberId` / `baseMakerId`は候補拡張軸で、強い確定キーにはしない

## 外装の重複判定

Issue #1の方針では、外装は`brand + partRef`が最強の重複キー。

現行schemaでの実装候補:

- `partType = exterior`
- `brandId`
- `partRefs`内の個別番号一致

`partRef`がない場合の候補検索:

- `partType = exterior`
- `brandId`
- `watchRefs`
- `standardPartNameId`

注意:

- 外装は同名でも年式、素材、純正/FIT、汎用品、サイズ差が出るため、部品名だけで自動mergeしない
- `watchRefs + standardPartNameId`は候補提示まで。自動確定キーにはしない

## partRef比較の現行実装

現行の比較箇所:

- `src/lib/parts-master.ts`
  - `splitMultiValue`
  - `normalizeRefToken`
  - `findExistingPartsMaster`
- `src/lib/parts-master-search-info.ts`
  - `splitPartRefs`
  - `normalizePartRefForCompare`
  - `mergePartRefs`

現行比較は、比較時に空白・ハイフン・ドット・スラッシュを削除して小文字化する。

これは`24-603`、`24603`、`24.603`、`24/603`を同一扱いし得るため、Issue #1の「ハイフン等を無条件に剥がして重複判定しない」方針とは合わない。

## 110-4のpartRef正規化を修正する必要

必要あり。

次の実装Taskで重複確認を土台にする前に、少なくとも以下のように保守的に寄せるべき。

- 分割: 改行、半角カンマ、全角カンマ、読点
- 正規化: trim、連続空白の単一化、NFKC、小文字化
- 同一判定ではハイフン、ドット、スラッシュを削除しない
- ハイフン違い等は「参考候補」にはできるが「重複確定」には使わない

この変更は`parts-master.ts`と`parts-master-search-info.ts`で比較ルールを揃える必要がある。

## 推奨API/UIフロー

既存`POST /api/parts`は保存まで行い、`createOrUpdatePartsMaster`は重複時に既存レコードを更新する経路を持つ。今回必要な「既存候補を見せて、使う/新規作成を確認する」には直接向かない。

推奨する最小フロー:

1. `PartsWebSearchPanel`でPartsMaster未選択時も`partRef`入力を許可する
2. 「部品マスタ候補を作成」または「マスタへ登録」押下
3. サーバーへ候補作成リクエスト
4. サーバーでRepair/Watch情報とline item snapshotを検証し、PartsMaster登録候補を返す
5. 同時にpartRef重複候補を返す
6. 候補があれば「既存PartsMasterを使う」確認を出す
7. 候補がなければ、確認後に新規PartsMasterを作成
8. 作成または既存選択された`partsMasterId`を現在のRepair line item stateへ反映
9. その`partsMasterId`と`partRef`でWeb検索contextを即時更新

APIは2段階が安全:

- preview/check: 登録候補と重複候補を返すだけ
- commit: 既存を使う、または新規作成する

保存済みRepairLineItemのみから復元できないfieldがあるため、最初の実装は「RepairEntryForm上の編集中line item contextをpayloadに含める」形が現実的。ただし、サーバー側で親Repair/WatchのIDと整合する値は必ず再取得・検証する。

## 新規PartsMaster作成後のRepairLineItem紐付け

画面上では、作成済みまたは選択済みの`PartsMaster.id`を対象`LineItem.partsMasterId`へ入れる。

次回Repair保存時には既存payload経路により:

- `estimate.items[].partsMasterId`
- `EstimateItem.partsMasterId`
- `RepairLineItem.partsMasterId`
- 必要なら`OrderRequest.partsMasterId`

へ流れる。

即時DB反映まで行う場合は、専用commit APIで`RepairLineItem.partsMasterId`を更新する選択肢もある。ただし、Repair画面の未保存変更との競合が起きやすいため、最小実装ではまずUI state反映に留め、通常のRepair保存で永続化する方が安全。

## PROVISIONAL / VERIFIED

今回の最小フローでは不要。

理由:

- 現行schemaにsource/status/evidence fieldがない
- Web検索で見つけたpartRefは強い手がかりだが、証拠管理を始めるとschema設計が大きくなる
- Issue #1でもPROVISIONAL/VERIFIEDやsource/evidence正式schemaは、必要性が確認できてから後続に回す方針

ただし将来の解説書取込やbulk registerでは、`PartEvidence`相当の別tableを検討する価値がある。

## 解説書取込将来フローとの整合性

アプリ内AI APIは使わず、ChatGPT/Codexを外部作業者として使う方針にする。

アプリ側に将来置く入口:

- 「解説書から部品マスタ作成」ボタンまたは画面
- 対象Cal / base Cal / movement maker / document locator / 既存PartsMaster一覧をexport
- Codexがメーカー原語名、partRef、日本語修理用語、カテゴリ/機能グループを抽出
- アプリへ取込前にユーザー確認
- partRef重複確認を通して既存利用または新規登録

この将来フローでも、今回設計するpartRef重複確認とPartsMaster作成候補の仕組みを共通部品にできる。

## 次の実装Task分割案

### 112-A: partRef比較ルール保守化

- `parts-master.ts`と`parts-master-search-info.ts`の比較正規化を揃える
- ハイフン、ドット、スラッシュを削除しない
- 既存merge / duplicate helperの小テストを追加する

### 112-B: PartsMaster登録候補preview API

- 入力: Repair/line item context、partRef
- 出力: 新規作成候補、必須field不足、重複候補
- DB作成はしない

### 112-C: PartsWebSearchPanelの未登録部品マスタ作成UI

- PartsMaster未選択時にpartRef入力と候補作成を可能にする
- 重複候補があれば既存利用確認を出す
- 候補がなければ新規作成確認を出す

### 112-D: commit API / line item state反映

- 既存PartsMaster利用または新規作成を確定する
- `partsMasterId`をRepairEntryFormの対象LineItemへ反映する
- Web検索contextを即時更新する

### 112-E: 解説書取込入口の設計/実装

- アプリ内AI APIは呼ばない
- Codex作業用export/import形式を設計する
- bulk registerはユーザー確認を必須にする

## 今回変更しないもの

- TypeScript/React/API実装
- Prisma schema
- migration
- DBデータ
- 検索語生成
- site profile
- localStorage
- PublicCase
- PricingRule
- QR
- スケジュール

