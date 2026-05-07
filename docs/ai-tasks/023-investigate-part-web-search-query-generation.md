# AI Task 023: 部品Web検索語生成ロジック調査

## 目的

部品Web検索で使う検索語生成ロジックの現状を確認し、今後の改善方針を整理する。

今回は調査のみ。コード変更は行わない。

## 調査対象ファイル

- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/lib/part-input-options.ts`
- `docs/ai-tasks/017-design-right-parts-panel-role-and-ui.md`
- `docs/ai-tasks/020-investigate-web-search-area-for-parts-panel.md`
- `docs/ai-tasks/021-create-parts-web-search-panel-shell.md`
- `docs/ai-tasks/022-enable-web-search-sites-in-parts-web-search-panel.md`

## 現在の検索語生成関数

### `buildJapanesePartQueries`

受け取る入力:

- `brand`
- `watchRef`
- `caliber`
- `partName`
- `partRef`
- `partType`
- `category`

主な挙動:

- `brand` は大文字variantも作る。
- `caliber` は `normalizeCaliber` で `cal.` を除去し、空白を詰める。
- `watchRef` / `partRef` は `expandPartRefVariants` で表記ゆれを作る。
- 内装部品は `brand + caliber + partName` を優先する。
- 外装部品は `brand + watchRef + partName` を優先する。
- `pushUnique` / `uniqueQueries` で空値除外と重複除去をしている。

課題:

- `brand` が空の場合、検索語が生成されにくい。
- `caliber + partName` のような brand なし候補がない。
- `partName` 側が文字化けしていると英語aliasが効かない。

### `buildEnglishPartQueries`

受け取る入力は日本語版と同じ。

主な挙動:

- `getEnglishPartTerms` で英語部品名候補を作る。
- `PART_NAME_EN_ALIASES` に一致した場合だけ英語aliasを追加する。
- ASCIIを含む部品名はそのまま英語候補に入る。
- 内装部品は `brand + caliber + partName` 系を作る。
- 外装部品は `brand + watchRef + partName` 系を作る。

課題:

- `PART_NAME_EN_ALIASES` のキーが文字化けしており、`ゼンマイ -> mainspring` のような変換が安定しない。
- `partNameEn` は `PartsWebSearchPanel` 側のfallbackにしか使われず、`part-search.ts` 本体の入力にはない。
- `brand` が空の場合、`3135 mainspring` のような候補が出にくい。

### `buildSearchUrls`

受け取る入力:

- `sites`
- `japaneseQueries`
- `englishQueries`

主な挙動:

- `site.lang === "ja"` の場合は日本語候補の先頭を使う。
- `site.lang === "en"` の場合は英語候補の先頭を使う。
- `{query}` を `encodeURIComponent(query)` で置換する。
- 検索語がないサイトはURLを生成しない。

課題:

- サイトごとの最適検索語は持たず、JA/ENごとの先頭1件だけを使う。
- eBay / Cousins / Yahoo / メルカリごとの差はURLテンプレートのみ。

### `DEFAULT_PART_SEARCH_SITES`

主な項目:

- Yahooオークション
- メルカリ
- Watch Parts Market
- eBay
- AliExpress
- Cousins UK

各サイトは `id`, `name`, `lang`, `url`, `enabled` を持つ。

課題:

- `name` に文字化けが残っている。
- サイトごとの検索語タイプや優先順位は持っていない。

## PartsWebSearchPanelで渡している検索条件

`PartsWebSearchPanel` のprops:

- `brandName`
- `modelName`
- `watchRef`
- `cal`
- `partType`
- `categoryLabel`
- `partName`
- `partNameEn`
- `disabled`

`PartsSearchPanel` から実際に渡している値:

- `watchRef`: `refKeyword`
- `cal`: `calNumber`
- `partType`: `partType === "all" ? initialPartType : partType`
- `partName`: `keyword`
- `disabled`: `loading`

現状渡っていない、または空になりやすい値:

- `brandName`
- `modelName`
- `categoryLabel`
- `partNameEn`

影響:

- `ROLEX 3135 ゼンマイ` のようなブランド込み検索語は右パネル単体では生成しにくい。
- `partNameEn` が空のため、`mainspring` のような英語候補は alias 依存になる。
- aliasが効かない場合、英語候補が空になりやすい。
- Task 022で input 値を検索語fallbackにしたため検索自体はできるが、検索語の質はまだ低い。

## 内装部品の検索語方針

理想候補:

- `ROLEX 3135 ゼンマイ`
- `ROLEX 3135 mainspring`
- `3135 mainspring`
- `Rolex 3135 mainspring`
- `3135 ゼンマイ`
- `mainspring 3135`

推奨方針:

- 内装部品は `brand + caliber + partName` を最優先。
- brandがない場合でも `caliber + partName` を生成する。
- 英語名がある場合は `partNameEn` を優先して英語候補に使う。
- alias辞書は文字化けを直して、部品キー基準にする。

## 外装部品の検索語方針

理想候補:

- `ROLEX 16233 竜頭`
- `ROLEX 16233 crown`
- `ROLEX crown`
- `16233 crown`
- `Rolex 16233 crown`

推奨方針:

- 外装部品は `brand + watchRef + partName` を最優先。
- watchRefがない場合は `brand + partName` を生成する。
- 英語名がある場合は `partNameEn` を優先して英語候補に使う。
- 外装部品は `caliber` より `watchRef` を優先する。

## サイト別検索語方針

### Yahoo / メルカリ

- 日本語候補を優先。
- `ブランド + Cal/Ref + 日本語部品名` を優先。
- 見つからない場合に `Cal/Ref + 日本語部品名` を使う。

### eBay / AliExpress

- 英語候補を優先。
- `brand + caliber/ref + englishPartName` を優先。
- `caliber/ref + englishPartName` も候補に入れる。

### Cousins UK

- 英語候補を優先。
- 部品番号やCousins番号がある場合は最優先にする。
- 次点で `caliber + englishPartName`。

## 現状の主な課題

- `part-search.ts` に文字化けしたaliasとサイト名が残っている。
- `PartsSearchPanel` から `brandName` / `partNameEn` が渡っていない。
- `PartSearchInput` に `partNameEn` がない。
- brandが空の場合の検索語候補が弱い。
- サイト別の検索語優先順位がない。
- `buildSearchUrls` は各言語候補の先頭1件だけを使う。

## 推奨実装方針

1. まず `part-search.ts` の文字化けaliasを修正し、`partNameEn` を扱えるようにする。
2. `PartsSearchPanel` から `PartsWebSearchPanel` へ `brandName` と `partNameEn` を渡せるか調査する。
3. `buildJapanesePartQueries` / `buildEnglishPartQueries` に brandなし候補を追加する。
4. サイト別に使用する検索語を選べる薄い関数を追加する。
5. 大きなリファクタリングではなく、現行関数を保ちながら候補追加で改善する。

## 次Task案

- Task 024: `part-search.ts` の文字化けaliasとサイト名を修正する
- Task 025: `PartSearchInput` に `partNameEn` を追加し、英語候補生成に使う
- Task 026: brandなしの `caliber/ref + partName` 候補を追加する
- Task 027: `PartsSearchPanel` から `brandName` / `partNameEn` を渡す調査と最小接続
- Task 028: Cousins / eBay / Yahoo向けの検索語優先順位を整理する

## コード変更有無

なし。

## 確認コマンド

`git status --short`
