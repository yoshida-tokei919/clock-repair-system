# AI Task 027: PartsMaster標準部品名DB設計

## 目的

PartsMasterに標準部品名・カテゴリ・内外装分類を保存できるDB設計を整理する。

今回は設計のみで、コード変更・Prisma schema変更・migration作成は行わない。

## 調査対象ファイル

- `prisma/schema.prisma`
- `src/lib/part-input-options.ts`
- `src/components/parts/PartsForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `docs/ai-tasks/017-design-right-parts-panel-role-and-ui.md`
- `docs/ai-tasks/023-investigate-part-web-search-query-generation.md`
- `docs/ai-tasks/024-fix-part-search-aliases-and-site-names.md`
- `docs/ai-tasks/025-pass-brand-and-english-part-name-to-web-search-panel.md`

注: Task 025の実装はstash退避中のため、現在の作業ツリーにはTask 025 docsは存在しない。

## 現在のPartsMaster schema概要

現在の`PartsMaster`は1テーブルで、以下を保持している。

- 分類: `partType`, `category`, `subcategory`
- 外装条件: `brandId`, `modelId`, `watchRefs`
- 内装条件: `caliberId`, `baseCaliberId`, `movementMakerId`, `baseMakerId`
- 部品表示情報: `name`, `nameJp`, `nameEn`, `partRefs`, `cousinsNumber`, `grade`, `size`, `photoKey`
- 備考: `notes1`, `notes2`
- 価格: `costCurrency`, `costOriginal`, `latestCostYen`, `markupRate`, `retailPrice`
- 在庫: `stockQuantity`, `minStockAlert`, `minStockAlertEnabled`, `location`, `supplierId`
- 関連: `Brand`, `Model`, `Caliber`, `Supplier`, `OrderRequest`, `EstimateItem`

PartsMasterには標準部品名のkey、標準カテゴリkey、標準名スナップショットはまだ存在しない。

## 現在の問題点

- `nameJp` / `nameEn` が表示名・検索分類・帳票名・発注名を兼ねている。
- `ゼンマイ`, `ぜんまい`, `ゼンマイ（純正）`, `main spring` のような表記ゆれをDB上で判定しづらい。
- `part-input-options.ts` の `PartNameOption.key` がPartsMasterに保存されないため、候補選択の意味がデータに残らない。
- PartsSearchPanelは `nameJp` / `nameEn` / `partRefs` の文字列検索中心で、標準部品名による絞り込みができない。
- Web検索語生成は部品名文字列に依存し、標準英語名を安定して使えない。
- 発注管理は `partsMasterId` を持つが、部品の標準分類までは参照できない。

## 標準部品名と表示名の役割分担

PartsMasterでは、分類用の標準情報と、表示・帳票用の名称を分ける。

今回のDB設計は、現在のPartsForm UIを大きく作り直す前提ではない。現在の部品マスタ画面の構成を基本維持し、裏側の保存先として標準部品名key・カテゴリkey・内外装分類を追加する方針にする。

維持するUI:

- 現在のPartsForm UI全体の流れ
- 部品種別 / 部品カテゴリ / 部品名候補 の選択
- 部品名（日本語）/ 部品名（英語）の手入力欄
- 候補にない部品を手入力できる運用

避けること:

- UI全面刷新
- PartsFormの大規模な再設計
- 最小実装段階での部品名マスタDB化
- 保存処理の作り直し

標準分類用:

- `partInputType`: `part_internal` / `part_external`
- `partCategoryKey`: `mainspring_barrel`, `crown_tube` など
- `standardPartNameKey`: `mainspring`, `crown` など
- `standardNameJa`: `ゼンマイ`, `竜頭` など
- `standardNameEn`: `mainspring`, `crown` など

表示・帳票用:

- `nameJp`
- `nameEn`

`standardPartNameKey` は検索・分類・在庫集計・発注連携の軸にする。`nameJp` / `nameEn` は画面表示、帳票、顧客向け表記として引き続き編集可能にする。

## 内装部品の設計

内装部品はCal中心で管理する。

推奨保持項目:

- `partInputType = "part_internal"`
- `partCategoryKey`
- `standardPartNameKey`
- `standardNameJa`
- `standardNameEn`
- `movementMakerId`
- `caliberId`
- `baseMakerId`
- `baseCaliberId`
- `partRefs`
- `cousinsNumber`
- `grade`
- `latestCostYen`
- `retailPrice`
- `stockQuantity`
- `supplierId`
- `notes1`, `notes2`

例:

```text
standardPartNameKey: mainspring
standardNameJa: ゼンマイ
standardNameEn: mainspring
movementMakerId: ROLEX
caliberId: 3135
grade: 純正
```

検索語生成では `movementMaker/brand + cal + standardNameEn` を優先し、`ROLEX 3135 mainspring` のような語を作る。

## 外装部品の設計

外装部品はRef / 部品Ref / サイズ中心で管理する。

推奨保持項目:

- `partInputType = "part_external"`
- `partCategoryKey`
- `standardPartNameKey`
- `standardNameJa`
- `standardNameEn`
- `brandId`
- `modelId`
- `watchRefs`
- `partRefs`
- `cousinsNumber`
- `size`
- `grade`
- 将来候補: `variant`, `material`, `color`
- `latestCostYen`
- `retailPrice`
- `stockQuantity`
- `supplierId`
- `notes1`, `notes2`

例:

```text
standardPartNameKey: crown
standardNameJa: 竜頭
standardNameEn: crown
brandId: ROLEX
watchRefs: 16233
partRefs: 24-603-8
grade: 純正
```

検索語生成では `brand + watchRef + standardNameEn`、または `partRef + standardNameEn` を優先する。

## part-input-options.tsとの対応

`part-input-options.ts` には以下の候補定義がある。

- `PartInputType = "part_internal" | "part_external"`
- `PartCategoryOption.key`
- `PartNameOption.key`
- `PartNameOption.nameJa`
- `PartNameOption.nameEn`
- `displayJa`
- `displayEn`

PartsMaster保存時の対応:

- `partInputType` に `PartNameOption.partType`
- `partCategoryKey` に `PartNameOption.categoryKey`
- `standardPartNameKey` に `PartNameOption.key`
- `standardNameJa` に `displayJa ?? nameJa`
- `standardNameEn` に `displayEn ?? nameEn`

まずはコード定義keyをDBへ保存する方針で十分。将来、候補定義をDBマスタ化する場合は、`PartCategoryMaster` / `PartNameMaster` のようなテーブルを追加し、同じkeyを移行軸にする。

## 検索語生成との連携

Web検索では、標準名を優先して検索語を作る。

内装:

- `brand/movementMaker + cal + standardNameJa`
- `brand/movementMaker + cal + standardNameEn`
- `cal + standardNameEn`

外装:

- `brand + watchRef + standardNameJa`
- `brand + watchRef + standardNameEn`
- `partRef + standardNameEn`
- `standardNameEn + size + variant`

`nameJp` / `nameEn` はユーザー表示名として残し、検索語生成の主軸は `standardNameJa` / `standardNameEn` に寄せる。

## PartsSearchPanelとの連携

右部品パネルの候補検索では、以下をPartsMaster側で持てる必要がある。

- `partInputType`
- `partCategoryKey`
- `standardPartNameKey`
- `brandId` / `movementMakerId`
- `caliberId` / `watchRefs`
- `partRefs`
- `grade`
- `stockQuantity`

検索APIは将来的に、文字列keywordだけでなく `partInputType + partCategoryKey + standardPartNameKey` を優先条件にする。これにより、明細行で「内装 / 動力・巻上 / ゼンマイ」を選んだとき、表記ゆれに左右されずPartsMaster候補を出せる。

## 発注管理・在庫管理への影響

発注管理は引き続き `partsMasterId` を中心にするのがよい。

既存の `OrderRequest.partsMasterId` は活かし、発注候補表示ではPartsMasterの標準分類を参照する。

短期:

- `stockQuantity`
- `minStockAlert`
- `minStockAlertEnabled`
- `supplierId`
- `latestCostYen`
- `partsMasterId`

を活かす。

将来:

- `reservedStock`
- `orderThreshold`
- `lastSupplierId`
- 仕入履歴テーブル

を検討する。ただしTask 028の最小schema変更には含めない。

## 既存データ移行方針

既存データを壊さないため、新規カラムはすべてnullableで追加する。

移行方針:

1. `nameJp` / `nameEn` を正規化する。
2. 末尾や文字列内のグレード表記を除去する。
   - `（純正）`
   - `（FIT）`
   - `（合わせ）`
   - `(純正)`
   - `(FIT)`
   - `(合わせ)`
3. `part-input-options.ts` の `nameJa` / `displayJa` / `nameEn` / `displayEn` と一致するものを推測する。
4. 推測できた行だけ `partInputType`, `partCategoryKey`, `standardPartNameKey`, `standardNameJa`, `standardNameEn` を補完する。
5. 推測できない行はnullのまま残し、後続Taskで手動補正UIまたは補正リストを作る。

required化は、既存データ補正と画面保存対応が終わるまで行わない。

## 推奨schema変更案

Task 028の最小案として、`PartsMaster` にnullableカラムを追加する。

```prisma
partInputType       String?
partCategoryKey     String?
standardPartNameKey String?
standardNameJa      String?
standardNameEn      String?
variant             String?
```

`variant` はガラスのドーム/フラット、針形状、外装差異などに使えるが、最小実装では追加を後回しにしてもよい。

推奨index:

```prisma
@@index([partInputType, partCategoryKey, standardPartNameKey])
@@index([standardPartNameKey])
@@index([movementMakerId, caliberId, standardPartNameKey])
@@index([brandId, modelId, standardPartNameKey])
```

enumではなく `String?` を推奨する。理由は、候補keyが `part-input-options.ts` と一緒に段階的に変わる可能性があり、Prisma enumにすると小さな候補追加でもmigrationが必要になるため。

## 1テーブル維持か関連テーブル追加か

最小実装では1テーブル維持を推奨する。

理由:

- 既存のPartsForm、PartsSearchPanel、Repair API、OrderRequestがすべてPartsMaster中心で動いている。
- 内装/外装の項目差はすでにnullableカラムで吸収している。
- 関連テーブル分割を先に行うと、保存payload・検索API・発注連携の変更が大きくなる。

将来、内装と外装で項目差がさらに大きくなった場合は、以下を検討する。

- `PartsMasterInternalDetail`
- `PartsMasterExternalDetail`
- `PartCategoryMaster`
- `PartNameMaster`

ただし現時点では、標準keyをPartsMasterに追加するのが最小で安全。

## 最小実装案

Task 028:

- Prisma schemaにnullable標準カラムを追加する。
- 必要なindexを追加する。
- APIやUIはまだ大きく変えない。

Task 029:

- 現在のPartsForm UIを基本維持したまま、部品候補を選んだときに標準keyと標準名スナップショットを保存する。
- 既存の部品種別 / 部品カテゴリ / 部品名候補の流れを使う。
- 手入力欄は残す。
- 部品名（日本語）/ 部品名（英語）は表示・帳票用として引き続き編集可能にする。
- 保存payloadには標準分類用フィールドを追加するが、既存の保存項目は壊さない。

Task 030:

- PartsSearchPanel / Web検索 / parts search APIで標準keyと標準名を優先利用する。

Task 031:

- 既存PartsMasterの標準key補正方針を実装または補正リスト化する。

## 将来拡張案

- `PartCategoryMaster` / `PartNameMaster` をDB化し、候補の有効/無効、表示順、aliasを管理する。ただし最小実装ではDB化せず、現在の `part-input-options.ts` のkeyを保存する方針を優先する。
- `reservedStock` を追加し、発注予定・修理割当済み在庫を分ける。
- 仕入履歴テーブルを作り、`latestCostYen` を履歴から更新する。
- 外装向けに `material`, `color`, `variant` を追加する。
- 部品Refの複数値を正規化する場合は、`PartsMasterPartRef` のような子テーブルを検討する。

## 次Task案

- Task 028: PartsMasterに標準部品名key用のnullableカラムとindexを追加する。
- Task 029: PartsFormで標準部品名keyと標準名スナップショットを保存する。
- Task 030: PartsSearchPanel / Web検索で標準key・標準名を使う。
- Task 031: 既存PartsMasterデータの補正方針と補正UIを整理する。
- Task 032: 発注・在庫連携向けに予約在庫や発注閾値を設計する。

## コード変更していないこと

今回変更したのはこの設計docsのみ。

- `prisma/schema.prisma` は変更していない。
- `src/components/*` は変更していない。
- `src/lib/*` は変更していない。
- `src/app/api/*` は変更していない。
- DB migrationは作成していない。
- 保存payloadは変更していない。
