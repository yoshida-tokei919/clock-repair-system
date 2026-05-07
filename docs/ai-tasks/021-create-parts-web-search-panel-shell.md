# AI Task 021: PartsWebSearchPanelの土台作成

## 目的

右部品パネル内に常時表示するWeb検索エリアの土台として、専用コンポーネント `PartsWebSearchPanel` を作成する。

今回はWeb検索UI全体の完成ではなく、props境界と最小表示だけを作る。

## 変更ファイル

- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `docs/ai-tasks/021-create-parts-web-search-panel-shell.md`

## 作成したprops

`PartsWebSearchPanel` は以下のpropsを受け取る。

- `brandName?: string`
- `modelName?: string`
- `watchRef?: string`
- `cal?: string`
- `partType?: "interior" | "exterior"`
- `categoryLabel?: string`
- `partName?: string`
- `partNameEn?: string`
- `disabled?: boolean`

Reactの特殊propである `ref` との衝突を避けるため、時計Refは `watchRef` とした。

## 表示したUI

- セクションタイトル「候補にない場合（Web検索）」
- 現在の検索条件
- 検索キーワード編集欄
- 検索語プレビュー
  - 日本語候補
  - 英語候補
- 検索サイト一覧の仮表示
- 「選択サイトを一括検索」ボタン
- サイトごとの「開く」ボタン

## 既存part-search.ts利用有無

利用した。

- `DEFAULT_PART_SEARCH_SITES`
- `buildJapanesePartQueries`
- `buildEnglishPartQueries`
- `buildSearchUrls`

検索語生成ロジック本体は変更していない。

## 右パネルへ接続したか

接続した。

`PartsSearchPanel.tsx` の候補一覧下部に `PartsWebSearchPanel` を仮表示した。

渡している値:

- `watchRef`: `refKeyword`
- `cal`: `calNumber`
- `partType`: 現在のPartsSearchPanelの区分
- `partName`: `keyword`
- `disabled`: `loading`

## 未対応項目

- サイト追加
- サイト削除
- JA / EN の編集保存
- localStorage実装
- 検索語生成ロジックの全面整理
- Web検索結果取得
- PartsMaster登録
- 新規登録フォーム
- API変更
- DB変更

## 型チェック結果

`npx.cmd tsc --noEmit` 通過。

## 画面確認してほしい操作

1. `/repairs/new` または既存案件編集モードで右部品パネルを開く。
2. 候補一覧の下に「候補にない場合（Web検索）」が表示されることを確認する。
3. 検索条件、検索語プレビュー、検索サイト一覧が表示されることを確認する。
4. `/parts` standaloneでも表示が崩れていないことを確認する。
