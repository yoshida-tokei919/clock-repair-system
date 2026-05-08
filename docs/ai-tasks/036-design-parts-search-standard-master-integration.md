# AI Task 036: PartsSearchPanel / Web検索連携の現状調査

## 目的

PartsFormで登録できるようになった標準部品カテゴリ・標準部品名・グレード・仕入先を、PartsSearchPanel / parts search API / Web検索へどう接続するかを調査・設計する。

今回は調査・設計のみで、コード変更・DB変更・schema変更・API変更は行わない。

## 調査対象

確認したファイル:

- `docs/design/critical-master-design-principles.md`
- `docs/ai-tasks/031-design-parts-form-standard-master-integration.md`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/app/api/parts/search/route.ts`
- `src/app/api/master-data/route.ts`
- `src/lib/parts-master.ts`
- `src/lib/part-search.ts`
- `prisma/schema.prisma`

存在しない調査対象ファイルはなかった。

## PartsSearchPanelの現状

`src/components/parts/PartsSearchPanel.tsx` が部品検索UIを担当している。

現在の主なstate:

- `partType`: `all` / `interior` / `exterior`
- `keyword`: 部品名・部品Ref向けの文字列
- `calNumber`: Cal / ベースCal向けの文字列
- `refKeyword`: Ref / モデル向けの文字列
- `parts`: 検索結果

検索APIへ送っているquery:

- `partType`
- `keyword`
- `cal`
- `ref`

検索結果表示:

- 区分: `part.partType`
- 部品名: `nameJp`, `nameEn`
- Cal / Ref: 内装は `caliber.name` / `baseCaliber.name`、外装は `partRefs`
- グレード: 既存 `grade`
- 上代: `retailPrice`
- 仕入: `latestCostYen`
- 在庫: `stockQuantity`
- 操作: 編集または選択

現在の扱い:

- `nameJp` / `nameEn` / `partRefs` は検索・表示の中心。
- `grade` は表示のみで、フィルタ条件には使っていない。
- `supplierId` は検索条件には使っていない。結果には `supplier.name` を含めているが、一覧表示には出していない。
- `category` / `subcategory` は検索条件・表示に使っていない。
- `standardPartNameId` / `gradeId` は現在使っていない。
- `standardPartName` / `gradeMaster` は検索API結果にincludeされていない。

`PartsSearchPanel` の末尾で `PartsWebSearchPanel` を表示している。渡している情報は `watchRef`, `cal`, `partType`, `partName` で、Brand / Model / 標準部品名英語 / Supplier は渡していない。

## 検索APIの現状

`src/app/api/parts/search/route.ts` は `prisma.partsMaster.findMany` で検索している。

現在の検索条件:

- `partType`: 完全一致
- `keyword`: `nameJp`, `nameEn`, `partRefs` の部分一致
- `cal`: `caliber.name`, `baseCaliber.name` の部分一致
- `ref`: `watchRefs`, `model.name` の部分一致

現在のinclude:

- `caliber.name`
- `baseCaliber.name`
- `brand.name`
- `supplier.name`

現在不足している条件:

- `standardPartNameId`
- `gradeId`
- `supplierId`
- `category`
- `subcategory`
- `grade`
- `partRefs` 専用優先検索
- `watchRefs + standardPartNameId` の複合条件

現在不足しているinclude:

- `standardPartName`
- `gradeMaster`
- `model`
- `movementMaker`
- `baseMaker`
- Supplierの `id`, `url`, `isOnline`

最小変更案:

- queryに `standardPartNameId`, `gradeId`, `supplierId` を追加する。
- `standardPartNameId` は完全一致で絞る。
- `gradeId` は完全一致で絞る。互換用に必要なら後続で `grade` 文字列も補助条件にする。
- `supplierId` は完全一致で絞る。
- includeに `standardPartName`, `gradeMaster`, `supplier` を追加する。
- 既存の `keyword`, `cal`, `ref`, `partType` は壊さず残す。

注意点:

- DB/APIの正式partTypeは、標準マスター側では `part_internal` / `part_external` だが、既存 `PartsMaster.partType` は `interior` / `exterior` のまま残っている。
- 検索APIが受ける `partType` は現時点では既存 `PartsMaster.partType` に合わせた `interior` / `exterior`。
- 標準マスターの `partType` とPartsMasterの `partType` 変換は、UI側または専用helperに閉じる必要がある。

## Web検索パネルの現状

`src/components/parts/PartsWebSearchPanel.tsx` がWeb検索UIを担当している。

主なprops:

- `brandName`
- `modelName`
- `watchRef`
- `cal`
- `partType`
- `categoryLabel`
- `partName`
- `partNameEn`
- `disabled`

現在 `PartsSearchPanel` から渡しているprops:

- `watchRef={refKeyword}`
- `cal={calNumber}`
- `partType={partType === 'all' ? initialPartType : partType}`
- `partName={keyword}`
- `disabled={loading}`

つまり、PartsSearchPanel経由ではBrand / Model / 標準英語名 / categoryLabelはほぼ空のまま。

検索サイト定義:

- `src/lib/part-search.ts` の `DEFAULT_PART_SEARCH_SITES`
- 現在のコード定義は6件:
  - Yahooオークション
  - メルカリ
  - Watch Parts Market
  - eBay
  - AliExpress
  - Cousins UK

ただし、実画面ではlocalStorageにより `WATCH MATERIAL` を含む7件表示になっている。Supplier seedではこの実画面の7件と中村時計材料店を初期投入した。

検索語生成:

- `buildJapanesePartQueries`
- `buildEnglishPartQueries`
- `buildSearchUrls`

現在の英語検索語生成は、`partName` 文字列と `PART_NAME_EN_ALIASES` に依存している。

課題:

- `PART_NAME_EN_ALIASES` は固定コード定義で、標準部品名DBとはまだ連携していない。
- `PartNameMaster.nameEn` / `displayEn` を優先的に使えば、表記ゆれやalias依存を減らせる。
- Web検索パネルはSupplier DBと連携しておらず、検索サイト設定はlocalStorage中心。

## 標準マスター連携方針

### standardPartNameId

用途:

- PartsMaster候補を標準部品名で絞る。
- 表記ゆれのある `nameJp` / `nameEn` ではなく、分類軸として `PartNameMaster` を使う。
- Web検索語生成では `PartNameMaster.displayEn ?? nameEn` を英語候補に使う。

検索API方針:

- `standardPartNameId` を完全一致条件として追加する。
- 結果includeに `standardPartName` を追加する。
- 既存 `keyword` 検索は残し、標準部品名が選択されている場合は標準ID条件を優先する。

UI方針:

- PartsSearchPanelにも `/api/master-data` の `partCategories`, `partNames`, `partGrades`, `suppliers` を読み込ませる。
- 部品種別からカテゴリ、カテゴリから標準部品名へ絞る。
- PartsFormと同様、標準マスター側の `part_internal` / `part_external` と既存UI側 `interior` / `exterior` の変換を局所化する。

### gradeId

用途:

- 純正 / FIT / 合わせで候補を絞る。
- 同じ標準部品名でも品質・価格・仕入先・在庫が違う候補を区別する。
- 既存 `grade` 文字列は互換用に残す。

検索API方針:

- `gradeId` を完全一致条件として追加する。
- 結果includeに `gradeMaster` を追加する。
- 表示は `gradeMaster.nameJa ?? grade` を優先候補にする。

互換方針:

- 新規登録データは `gradeId` が入る。
- 既存/テストデータは `gradeId` がnullの場合があるため、当面は既存 `grade` 表示を残す。
- `grade` 文字列での検索は、必要になった段階で補助条件として追加する。

### supplierId

用途:

- 仕入先でPartsMaster候補を絞る。
- 価格・在庫・購入元の違いを明確にする。
- Supplier seed 8件を候補として使う。

検索API方針:

- `supplierId` を完全一致条件として追加する。
- 結果表示に `supplier.name` を出す。
- Web検索サイトとの紐づけは短期では名前・URLベース、長期では検索サイト設定をSupplierへ寄せるか検討する。

UI方針:

- PartsSearchPanelに仕入先selectを追加する。
- 初期値は未指定。
- 検索結果には仕入先列または補助表示を追加する。

## 外装部品検索優先順位との整合

外装部品は以下の優先順位で候補を特定する。

1. 部品Ref
2. WatchRef + 標準部品名
3. モデル名 + サイズ + バリエーション

PartsSearchPanel方針:

- 外装検索時は `partRefs` の専用入力または既存keywordを最優先に扱う。
- `refKeyword` は現在 `watchRefs` / `model.name` を検索しているが、外装ではWatchRef検索であることをUI上で明確にする。
- 標準部品名が選択されている場合は `standardPartNameId` を検索条件に追加し、`watchRefs + standardPartNameId` の絞り込みを行う。
- サイズ・バリエーションはまだschema上の専用項目が弱いため、短期では `size`, `notes1`, `notes2`, `nameJp`, `nameEn` を補助検索対象にするか検討する。

Web検索方針:

- `partRefs` がある場合は `partRef + standardNameEn` を優先する。
- `partRefs` がない場合は `brand + watchRef + standardNameEn` を優先する。
- `modelName + size + standardNameEn` は後続で追加する。

必要な追加データ:

- 検索パネル側にBrand / Model / WatchRef / PartRef / 標準部品名を渡せる状態。
- 検索結果からWeb検索する場合は、該当PartsMasterの `brand`, `model`, `watchRefs`, `partRefs`, `standardPartName` を使う。

## 内装部品検索との整合

内装部品はCal中心で絞る。

主な条件:

- Cal
- ベースCal
- 互換Cal
- `standardPartNameId`
- `gradeId`
- `supplierId`

PartsSearchPanel方針:

- 既存 `cal` 検索は維持する。
- `caliber.name` / `baseCaliber.name` に加え、将来はmovementMaker / baseMakerも表示・条件に含める。
- 標準部品名が選択されている場合は `standardPartNameId` を追加する。
- グレード・仕入先が選択されている場合は `gradeId` / `supplierId` を追加する。

Web検索方針:

- `brand/movementMaker + cal + standardNameEn`
- `cal + standardNameEn`
- 部品Refがある場合は `brand/movementMaker + cal + partRef + standardNameEn`

注意:

- 現在 `PartsWebSearchPanel` は `partName` 文字列から英語aliasを生成している。
- 内装部品では `PartNameMaster.nameEn` を渡すことで、固定alias依存を減らせる。

## 推奨実装方針

短期は、既存検索UIを大きく作り直さずに以下を追加する。

1. PartsSearchPanelで `/api/master-data` を読み込み、標準部品名 / グレード / 仕入先フィルタを追加する。
2. 検索APIで `standardPartNameId`, `gradeId`, `supplierId` を受け取る。
3. 検索結果に `standardPartName`, `gradeMaster`, `supplier` をincludeして表示する。
4. Web検索語生成では、選択中または検索結果の `PartNameMaster.displayEn ?? nameEn` を優先する。

中期は、PartsSearchPanelを以下の二系統に整理する。

- 内装: Cal中心 + 標準部品名 + グレード + 仕入先
- 外装: 部品Ref優先 + WatchRef + 標準部品名 + グレード + 仕入先

ただし、今回すぐに大きく分けず、フィルタ追加から進めるのが安全。

## 後続Task分割案

### Task037: PartsSearchPanelに標準マスターフィルタを追加

- `/api/master-data` から `partCategories`, `partNames`, `partGrades`, `suppliers` を読み込む。
- 部品種別からカテゴリ、カテゴリから標準部品名を絞る。
- グレードselect、仕入先selectを追加する。
- まだ検索APIの挙動変更は最小限にするか、Task038と合わせるか判断する。

### Task038: 検索APIで標準条件を扱う

- `/api/parts/search` に `standardPartNameId`, `gradeId`, `supplierId` を追加する。
- includeに `standardPartName`, `gradeMaster`, `supplier`, 必要なら `model` を追加する。
- 既存 `keyword`, `cal`, `ref`, `partType` は壊さない。

### Task039: 検索結果に標準部品名 / グレード / 仕入先を表示

- 標準部品名は `standardPartName.displayJa ?? nameJa` を優先表示する。
- グレードは `gradeMaster.nameJa ?? grade` を表示する。
- 仕入先は `supplier.name` を表示する。
- 既存表示と大きく競合しない列構成にする。

### Task040: Web検索語生成でPartNameMaster.nameEnを使う

- `PartsWebSearchPanel` に `standardPartNameEn` 相当のpropsを渡す。
- `buildEnglishPartQueries` で `PartNameMaster.displayEn ?? nameEn` を優先する。
- 既存aliasはフォールバックとして残す。

### Task041: 外装検索優先順位に沿った検索UI整理

- 部品Ref検索を明確化する。
- `watchRefs + standardPartNameId` を外装検索の主条件にする。
- サイズ・バリエーションの扱いを設計する。

### Task042: 内装Cal中心検索の改善

- Cal / ベースCal / movementMaker / baseMakerの表示と検索条件を整理する。
- 内装検索で `standardPartNameId`, `gradeId`, `supplierId` をCal条件と組み合わせる。

### Task043: 既存PartsMaster補正dry-run

- `nameJp` / `nameEn` / `grade` から `standardPartNameId` / `gradeId` を推測する。
- 更新はせず、補正候補リストを出す。
- 問題なければ後続で補正実行を検討する。

## 注意点

- DB/APIの標準マスター正式値は `part_internal` / `part_external` のまま維持する。
- 既存 `PartsMaster.partType` は当面 `interior` / `exterior` の互換値を維持する。
- `standardNameJa` / `standardNameEn` / `standardPartNameKey` / `gradeKey` をPartsMasterへ追加しない。
- SupplierはPartsMasterの実部品候補に紐づく購入元として扱う。Web検索サイト設定と完全同一視しない。
- PartsForm保存済みの `standardPartNameId` / `gradeId` を検索側で使うのは次Task以降。

## コード変更していないこと

今回変更したのはこの調査docsのみ。

- `src/components/parts/*` は変更していない。
- `src/app/api/*` は変更していない。
- `src/lib/*` は変更していない。
- `prisma/schema.prisma` は変更していない。
- migrationは作成していない。
- DBは書き換えていない。
- seedは実行していない。
