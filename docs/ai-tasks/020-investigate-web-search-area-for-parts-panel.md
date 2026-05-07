# AI Task 020: 右部品パネルWeb検索エリア調査

## 目的

右部品パネル内に常時表示するWeb検索エリアを作る前に、既存の検索サイト設定・検索語生成・検索実行ロジックを調査し、実装方針を整理する。

今回は調査のみで、コード変更は行わない。

## 調査対象ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-search.ts`
- `docs/ai-tasks/017-design-right-parts-panel-role-and-ui.md`
- `docs/ai-tasks/019-show-cost-in-parts-panel-candidates.md`

## 既存Web検索UIの場所

既存Web検索UIは `src/components/repairs/RepairEntryForm.tsx` の検索サイト選択ダイアログにある。

主なUI:

- `Dialog open={partSearchDialogOpen}`: 検索サイト選択ダイアログ
- `searchSites.map(...)`: 検索サイト一覧
- `Checkbox`: サイトごとの有効 / 無効
- `site.lang.toUpperCase()`: JA / EN 表示
- `handleAddSearchSite`: サイト追加
- `handleDeleteSearchSite`: サイト削除
- `japanesePartQueries` / `englishPartQueries`: 検索語プレビュー
- `handleExecutePartSearch`: 有効サイトを一括検索
- `handleOpenPartsPanelFromSearch`: ダイアログから右部品パネルを開く

現在の `PartsSearchPanel.tsx` はPartsMaster候補検索・表示・選択に集中しており、Web検索UIは持っていない。

## 既存stateの整理

### Web検索ダイアログ系

- `searchSites`
  - `SearchSite[]`
  - 検索サイト一覧。初期値は `DEFAULT_PART_SEARCH_SITES`。
  - 追加・削除・有効/無効切り替えの対象。

- `selectedSearchSiteId`
  - 現在選択中の検索サイトID。
  - サイト削除対象、一覧の選択表示に使う。

- `partSearchDialogOpen`
  - 検索サイト選択ダイアログの開閉。

- `partSearchRowIdx`
  - Web検索対象の明細行index。
  - `activePartSearchItem` と検索語生成の起点。

- `activePartSearchItem`
  - `partSearchRowIdx` から取得した `lineItems[partSearchRowIdx]`。
  - 検索語生成、ダイアログ説明文、部品パネル起動に使う。

### 右部品パネル系

- `partsPanelOpen`
  - 右部品パネルの開閉。

- `partsPanelRowIdx`
  - PartsMaster候補選択を反映する対象明細行index。

- `partsSearchQuery`
  - stateは存在するが、現状では `handleOpenPartsPanelFromSearch` で空文字に戻すのみで、実検索には使われていない。

- `partsPanelInitialKeyword`
  - PartsSearchPanelへ渡す初期キーワード。
  - 優先順は、部品補助UIの選択名、対象明細行名、新規入力中の部品名。

- `partsPanelInitialPartType`
  - 新規入力行の部品種別から `interior` / `exterior` を決める。

- `partsPanelEffectiveInitialPartType`
  - 既存明細行の場合は明細行から推定した部品種別を優先し、新規入力中は `partsPanelInitialPartType` を使う。

### 部品補助UI系

- `selectedPartInputType`
  - 内装部品 / 外装部品などの部品入力種別。

- `selectedPartCategoryKey`
  - 部品カテゴリ選択。

- `selectedPartNameKey`
  - 部品名選択。

これらは右部品パネルの初期検索条件に影響するが、Web検索ダイアログとは直接統合されていない。

## 検索語生成ロジックの現状

検索語生成ロジックは `src/lib/part-search.ts` にある。

主な定義:

- `DEFAULT_PART_SEARCH_SITES`
  - Yahooオークション、メルカリ、Watch Parts Market、eBay、AliExpress、Cousins UK。
  - 各サイトは `id`, `name`, `lang`, `url`, `enabled` を持つ。

- `buildJapanesePartQueries`
  - ブランド、時計Ref、Cal、部品名、部品Ref、部品種別から日本語向け検索語を作る。

- `buildEnglishPartQueries`
  - 同条件から英語向け検索語を作る。

- `buildSearchUrls`
  - `site.lang === "ja"` なら日本語検索語の先頭、`en` なら英語検索語の先頭を使う。
  - URLテンプレートの `{query}` を `encodeURIComponent(query)` で置換する。

現状の制約:

- サイトごとに使う検索語は各言語配列の先頭のみ。
- 検索キーワード編集欄はない。
- 個別サイト検索ボタンはない。
- `part-search.ts` 内に文字化けしている定数・alias・コメントが残っている。
- alias整理や検索語生成の大改造は別Taskに分けるべき。

## 右パネルへ移す場合の推奨方針

推奨は、新コンポーネント `PartsWebSearchPanel.tsx` を作り、右部品パネル内に組み込む段階移行。

理由:

- `RepairEntryForm.tsx` はすでに大きく、右パネル内にWeb検索UIを直書きするとさらに肥大化する。
- `PartsSearchPanel.tsx` はPartsMaster候補検索に集中させたい。
- `part-search.ts` の関数は既に分離されており、Web検索UIから再利用しやすい。
- サイト管理、検索語プレビュー、実行ボタンはPartsMaster候補一覧とは責務が別。

安全な実装方針:

1. まず `PartsWebSearchPanel` を作り、既存の `searchSites` / `japanesePartQueries` / `englishPartQueries` / 実行handlerをpropsで受ける。
2. 右部品パネル内に検索語プレビューだけ表示する。
3. 次にサイト一覧と個別検索ボタンを追加する。
4. 最後にサイト追加・削除を右パネルへ移す。
5. 既存ダイアログは移行完了まで残す。

## 既存ダイアログの扱い

既存の検索サイト選択ダイアログは当面残すのが安全。

推奨:

- 右パネル内Web検索エリアへ段階的に移行する。
- 新規案件と既存案件で挙動を分けない。
- 右パネル側で同等機能が安定したら、検索サイト選択ダイアログを削除する。
- 削除前に、検索サイト追加・削除・JA/EN指定・一括検索・部品パネル起動導線の代替を確認する。

## 検索サイト管理の保存先

検索サイト設定は `localStorage` に保存している。

保存キー:

- `repair-part-search-sites:v1`

現状:

- 初期値は `DEFAULT_PART_SEARCH_SITES`
- 起動時に `localStorage` から復元
- `searchSites` 更新時に `localStorage` へ保存
- DB保存はない

今後の推奨:

- 当面は `localStorage` 継続。
- 全ユーザー共通設定や端末間同期が必要になった段階でDB保存を検討する。
- 右パネル移行時も保存方式は変更しない。

## 次Task案

- Task 021: `PartsWebSearchPanel` の設計とprops境界を作る
- Task 022: 右部品パネルに検索語プレビューだけ表示する
- Task 023: 右部品パネルに検索サイト一覧とサイトごとの個別検索ボタンを表示する
- Task 024: 選択サイトの一括検索を右部品パネル内へ移す
- Task 025: サイト追加・削除・JA/EN指定を右部品パネル内へ移す
- Task 026: 既存検索サイト選択ダイアログの削除可否を検証する
- Task 027: `part-search.ts` の文字化け・alias整理を別途行う

## コード変更有無

コード変更なし。
