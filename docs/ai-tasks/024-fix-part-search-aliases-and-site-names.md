# AI Task 024: Fix part search aliases and site names

## 目的

`src/lib/part-search.ts` に残っている文字化けalias、検索サイト名、明らかに壊れた検索語整形を最小修正する。

検索語生成ロジックの大改造は行わない。

## 変更ファイル

- `src/lib/part-search.ts`
- `docs/ai-tasks/024-fix-part-search-aliases-and-site-names.md`

## 修正した文字化けalias

`PART_NAME_EN_ALIASES` の文字化けキーを、意味が確定できる日本語部品名に修正した。

- `ゼンマイ` -> `mainspring`
- `香箱真` -> `barrel arbor`
- `リューズ` / `竜頭` -> `crown`
- `チューブ` -> `crown tube`
- `ガラス` / `風防` -> `crystal`
- `パッキン` -> `gasket`
- `裏蓋` -> `case back`
- `裏蓋パッキン` -> `case back gasket`, `case back ring`
- `文字盤` -> `dial`
- `針` -> `hands`
- `天真` -> `balance staff`
- `バネ棒` -> `spring bar`
- `巻真` -> `stem`
- `ローター` -> `rotor`
- `切替車` -> `reversing wheel`

意味が確定できない文字化けaliasは残さず、今回の修正対象から除外した。

## 修正した検索サイト定義

`DEFAULT_PART_SEARCH_SITES` の表示名を修正した。

- `Yahooオークション`
- `メルカリ`

以下は既に自然な表示名とURLテンプレートだったため維持。

- `Watch Parts Market`
- `eBay`
- `AliExpress`
- `Cousins UK`

各URLテンプレートに `{query}` が含まれていることを確認した。

Google は既定サイトに存在しなかったため、今回追加しなかった。

## 修正した検索語整形

文字化けしていた括弧付き注記除去処理を、以下の対象へ最小修正した。

- `（...）`
- `(...)`

これにより、`ゼンマイ（純正）` から `ゼンマイ` の検索語候補を作れる。

## 変更しなかったこと

- 内装 / 外装ごとの検索語生成ロジック全面変更
- サイト別優先順位の実装
- `partNameEn` 対応
- 右パネルへのprops追加
- UI変更
- localStorage変更
- API routes変更
- Prisma schema変更
- 保存payload変更

## 型チェック結果

`npx.cmd tsc --noEmit` 成功。

## 画面確認してほしい操作

1. `/repairs/new` を開く
2. 右部品パネルを開く
3. Web検索エリアの初期サイト名が文字化けしていないことを確認
4. 検索キーワードに `ゼンマイ（純正）` を入れ、英語候補に `mainspring` 系が出るか確認
5. 各サイトの個別検索と一括検索が引き続き動くことを確認
