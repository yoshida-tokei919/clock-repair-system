# AI Task 022: Enable web search sites in parts web search panel

## 目的

右部品パネル内の `PartsWebSearchPanel` で、検索サイトの追加・削除・JA/EN指定・個別検索・一括検索を使えるようにする。

## 変更ファイル

- `src/components/parts/PartsWebSearchPanel.tsx`
- `docs/ai-tasks/022-enable-web-search-sites-in-parts-web-search-panel.md`

## 実装内容

- 検索サイト一覧を右部品パネル内に表示
- サイトごとの enabled チェックボックスを追加
- サイトごとの JA / EN 切替を追加
- サイトごとの個別「開く」ボタンを追加
- enabled のサイトを対象にした「選択サイトを一括検索」ボタンを維持
- サイト追加フォームを追加
- サイト削除ボタンを追加
- 検索キーワード入力値がある場合、プレビュー候補が空でも検索できるように修正

## 検索ボタンの有効条件

以下の優先順位で検索語を決める。

1. 検索キーワード input の値
2. JAサイトは日本語候補の先頭
3. ENサイトは英語候補の先頭
4. どれも無い場合のみ disabled

## 検索サイト保存先

- 既存ダイアログと同じ `localStorage` キーを利用
- キー: `repair-part-search-sites:v1`
- 右パネル側の再読み込み復元用に `repair-part-search-sites:v1:parts-panel` にも同内容を保存
- 追加、削除、enabled変更、JA/EN変更時に即時保存
- DB保存はしていない

## 既存part-search.ts利用有無

以下を引き続き利用。

- `DEFAULT_PART_SEARCH_SITES`
- `buildJapanesePartQueries`
- `buildEnglishPartQueries`
- `buildSearchUrls`
- `SearchSite`

## API変更の有無

なし。

## 保存payload変更の有無

なし。

## Prisma変更の有無

なし。

## 未対応項目

- 検索語生成ロジックの整理
- Web検索結果取得
- PartsMaster登録フォーム連携
- 新規登録 / 在庫登録フォームへの入力連携

## ブラウザ制約

- 一括検索は enabled サイトすべてに対して `window.open` をループ実行する。
- ただし、ブラウザのポップアップブロックにより複数タブの一部が開かない場合がある。
- その場合はサイトごとの個別「開く」を使って確認する。

## 型チェック結果

`npx.cmd tsc --noEmit` 成功。

## 画面確認してほしい操作

1. `/repairs/new` を開く
2. 明細行の検索ボタンから右部品パネルを開く
3. Web検索エリアでサイトのチェック切替、JA/EN切替、個別「開く」、一括検索を確認
4. サイト追加後、画面を再読み込みして localStorage に残ることを確認
5. サイト削除後、一覧から消えることを確認
