# AI Task 004: 右下の部品パネルの現状調査

## 目的

見積・修理明細欄の右下、または明細周辺にある部品検索・部品パネルの現状を調査する。

現時点では、いきなり実装しない。
まず現在のコードで以下を把握する。

- 部品パネルがどこで描画されているか
- どのstateで開閉・選択・挿入を管理しているか
- 内装 / 外装の判定がどこにあるか
- 部品検索ダイアログと部品マスタ導線がどう繋がっているか
- 明細行への挿入処理がどこにあるか
- 既存実装を壊さずに、次の最小修正Taskへ分けられるか

## ブランチ

feature/investigate-parts-panel-flow

## 触ってよい範囲

調査のみ。

原則としてコード変更は禁止。

ただし、調査結果を作業ログとして追記する場合のみ、以下は変更してよい。

- `docs/ai-tasks/004-investigate-parts-panel-flow.md`

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/upload/route.ts`
- `prisma/schema.prisma`
- `src/actions/document-actions.ts`
- 保存ロジック
- 検索ロジック本体
- API routes
- DB schema
- UI実装

## 前提

右下の部品パネルについて、ユーザーの理想フローは以下。

1. 交換部品入力窓をクリック
2. 内装・外装を選択
3. 部品カテゴリを選択
4. 部品名を選択
5. 過去に交換済みの場合、候補に挙がる
6. そのものならクリックで明細へ挿入
7. 違った場合は部品検索
8. 内外装に合わせたロジックで時計情報を取得して検索ワード生成
9. 各サイトの検索窓にワード挿入、または検索URLを開く
10. 別ウインドウで部品マスタを開く
11. サイトの部品Ref、価格、店舗など必要情報を入力
12. マスタの「この部品を明細に挿入」ボタンで明細行へ必要情報を挿入

補足：

- 部品カテゴリは事前定義
- 部品カテゴリは部品名を絞り込み選択しやすくするためだけにある
- 部品カテゴリに英語名は不要
- 部品名には英語名が必要
- 部品名は数百件程度想定
- 一度作れば選択肢に無いことは少なくなる想定
- ただし今回は実装しない。現状把握のみ。

## 調査対象

まず `src/components/repairs/RepairEntryForm.tsx` を中心に確認する。

以下のキーワードで関連箇所を探す。

- `partSearch`
- `partSearchDialog`
- `partSearchRowIdx`
- `handleOpenPartSearchDialog`
- `Part`
- `Parts`
- `partsMaster`
- `PartsMaster`
- `lineItems`
- `setLineItems`
- `selectedWorkOption`
- `workOpts`
- `category`
- `partType`
- `internal`
- `external`
- `movement`
- `brand`
- `model`
- `caliber`
- `cousins`
- `insert`
- `addLineItem`
- `addPart`
- `estimateItems`

必要に応じて、関連コンポーネントが分離されているか確認する。

候補：

- `src/components/parts/*`
- `src/app/parts/*`
- `src/lib/parts/*`
- `src/app/api/parts/*`
- `src/app/api/master-data/*`

ただし、調査のみで変更しない。

## 調査してほしい項目

### 1. 部品パネル / 部品検索UIの場所

以下を確認する。

- 部品検索ボタンはどこで描画されているか
- 部品検索ダイアログはどこで描画されているか
- 右下の部品パネルに該当するUIがあるか
- UIが `RepairEntryForm.tsx` 内にあるのか、別コンポーネントに分離されているのか

### 2. 開閉state

以下を確認する。

- `partSearchDialogOpen`
- `partSearchRowIdx`
- その他、部品パネル・ダイアログの開閉に関係するstate
- どのクリックで開くか
- どの処理で閉じるか

### 3. 明細行との紐付け

以下を確認する。

- 部品検索がどの明細行に対して開くか
- `idx` や `item.id` で紐付いているか
- 部品検索結果を明細行へ戻す処理があるか
- 「この部品を明細に挿入」に相当する処理が既にあるか

### 4. 内装 / 外装の判定

以下を確認する。

- 交換部品行が内装・外装を区別しているか
- `category`
- `partType`
- `movement`
- `brand`
- `model`
- `caliber`
- どの値を使って検索ワードを作っているか

### 5. 検索ワード生成

以下を確認する。

- Yahoo / eBay / Cousins / その他サイト用の検索ワード生成処理があるか
- 検索URL生成処理があるか
- どの時計情報を使っているか
- 内装と外装で検索ワードが分かれているか

### 6. 部品マスタとの接続

以下を確認する。

- PartsMaster を検索して候補表示しているか
- PartsMaster への新規登録導線があるか
- PartsMaster から明細へ挿入する導線があるか
- 既存の `/parts` ページやAPIが存在するか

### 7. 次Taskに分けるべき最小修正案

調査後、次に実装するなら何から小さく始めるべきか提案する。

例：

- Task 005-A: 部品検索ダイアログの表示条件整理
- Task 005-B: 内装 / 外装選択UIだけ追加
- Task 005-C: 部品カテゴリ選択UIだけ追加
- Task 005-D: 部品マスタ検索ページへのリンクだけ追加
- Task 005-E: 明細行への挿入処理だけ確認・整備

ただし、今回のTask 004では実装しない。

## 完了条件

- コード変更をしていない
- 現状の部品パネル / 部品検索UIの場所が説明されている
- 関連stateが説明されている
- 明細行との紐付けが説明されている
- 内装 / 外装判定の有無が説明されている
- 検索ワード生成の現状が説明されている
- 部品マスタとの接続状況が説明されている
- 次に行うべき最小実装Taskが提案されている
- `git status --short` で想定外の変更がない

## 確認コマンド

```bash
git status --short

## Codex調査結果 2026-05-02

### 調査対象ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-search.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/parts/route.ts`
- `src/app/api/parts/[id]/route.ts`
- `src/app/(app)/parts/page.tsx`
- `src/app/(app)/parts/new/page.tsx`
- `src/app/(app)/parts/[id]/edit/page.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/parts-master.ts`
- `src/app/api/master-data/route.ts`

### 部品パネル / 部品検索UIの場所

- 明細行の部品検索ボタンは `RepairEntryForm.tsx` の見積・修理明細行内にある。
- 現在は `isSearchablePartItem` が true の行だけ、虫眼鏡ボタンを表示する。
- ボタン押下で `handleOpenPartSearchDialog(idx)` を呼び、`partSearchRowIdx` に対象行indexを保存して `partSearchDialogOpen` を true にする。
- 部品検索ダイアログは `RepairEntryForm.tsx` 下部の `<Dialog open={partSearchDialogOpen}>` にある。
- 右下の部品パネル枠も `RepairEntryForm.tsx` 内にあり、実際の検索UIは `PartsSearchPanel` に分離されている。
- 部品検索ダイアログ内の「部品パネル」ボタンから `handleOpenPartsPanelFromSearch()` を呼び、右下パネルを開く。

### 関連state

- `partSearchDialogOpen`: 部品検索ダイアログの開閉。
- `partSearchRowIdx`: どの明細行から部品検索を開いたかを保持する。
- `activePartSearchItem`: `partSearchRowIdx` から現在対象の `lineItems` 行を参照する派生値。
- `partsPanelOpen`: 右下の部品パネルの開閉。
- `partsPanelRowIdx`: 部品パネルで選択した部品を戻す対象行index。
- `partsSearchQuery`: stateはあるが、現状の `PartsSearchPanel` へ渡されておらず実質未使用に見える。
- `searchSites`: 検索サイト一覧。localStorageに保存される。
- `selectedSearchSiteId`: 検索サイト一覧で現在選択中のサイトID。
- `workOpts` / `selectedWorkOption`: 新規明細入力欄の候補選択と追加に使う。右下パネルとは別導線。

### 明細行との紐付け

- 部品検索ダイアログは `partSearchRowIdx` で明細行と紐付く。
- 部品パネルは `handleOpenPartsPanelFromSearch()` で `partsPanelRowIdx = partSearchRowIdx` にして開く。
- `PartsSearchPanel` の `onSelect(part)` で部品を選ぶと、`lineItems.map` により `partsPanelRowIdx` の行だけを `buildPartLineItem(li, part)` で更新する。
- `buildPartLineItem` は `createEstimateItemFromPart` を通して、部品名、上代、原価、grade、partsMasterIdなどを明細行へ反映する。
- 部品選択後、`partsMasterId` があれば不足数量を見て `ensureOrderRequest` へつなぐ。
- 「この部品を明細に挿入」に相当する処理は、右下パネルの `PartsSearchPanel mode="panel"` の選択ボタンで既に存在する。
- 一方で `/parts/new` や `/parts/[id]/edit` 側から修理明細へ戻す導線は現状見当たらない。

### 内装 / 外装判定の現状

- 明細行では `category.includes('part')` を部品行判定に使っている。
- 検索対象が内装かどうかは `activePartSearchItem.partType === 'interior'` または `category === 'internal'` / `category === 'part_internal'` で判定している。
- 内装検索コンテキストは `movementMaker + movementCaliber` と `baseMovementMaker + baseMovementCaliber` を優先する。
- 内装でも movement情報が空の場合は `brand + caliber` にフォールバックする。
- 外装検索コンテキストは `brand + caliber` を使う。
- `PartsSearchPanel` 側にも `partType` stateがあり、`all` / `interior` / `exterior` で `/api/parts/search` に渡す。

### 検索ワード生成の現状

- 検索語生成は `src/lib/part-search.ts` に分離されている。
- `buildJapanesePartQueries` / `buildEnglishPartQueries` が、brand、watchRef、caliber、partType、category、partName、partRefから検索語を作る。
- `buildSearchUrls` が、サイトごとの `lang` に応じて日本語または英語の先頭検索語をURLへ差し込む。
- デフォルト検索先は Yahooオークション、メルカリ、Watch Parts Market、eBay、AliExpress、Cousins UK。
- 内装は caliber / movement caliber 寄り、外装は watchRef / partRef 寄りの検索語になる。
- ただし `part-search.ts` 内の一部日本語定数・サイト名・aliasキーは文字化けしており、検索語品質に影響する可能性がある。

### 部品マスタとの接続状況

- 新規明細入力欄では、`getPartsMatched` により PartsMaster 候補を `workOpts` に入れ、候補選択から明細追加できる。
- 右下部品パネルでは `PartsSearchPanel` が `/api/parts/search` を叩いて PartsMaster を検索する。
- `/api/parts/search` は `partType` / `keyword` / `cal` / `ref` を受け、`PartsMaster` の nameJp、nameEn、partRefs、caliber、baseCaliber、watchRefs、model.name を検索する。
- `/parts` は `PartsSearchPanel mode="standalone"` を表示し、`/parts/new` へ遷移できる。
- `/parts/new` と `/parts/[id]/edit` は `PartsForm` を使う。
- `PartsForm` は `/api/parts` / `/api/parts/[id]` と `/api/master-data` に接続して PartsMaster を作成・更新する。
- ただし、外部サイト検索結果から `/parts/new` を別ウインドウで開いて、保存後に修理明細へ自動挿入する導線は現状見当たらない。

### 現時点の問題点

- Task 004 のmdが `docs/ai-tasks/004...` ではなく、`docs/ai-tasks/docs/ai-tasks/004...` にある。
- `PartsSearchPanel.tsx` と `part-search.ts`、`PartsForm.tsx`、`/parts` ページの日本語UI文言に文字化けが残っている。
- 右下部品パネルの `partsSearchQuery` state は現状 `PartsSearchPanel` に渡されておらず、対象行名による初期検索には使われていない。
- 部品カテゴリの事前定義UIは、修理明細側の右下パネルにはまだ見当たらない。
- 部品検索ダイアログから部品パネルを開くことはできるが、理想フローの「部品カテゴリ選択 -> 部品名選択 -> なければ検索」の段階UIはまだ未整理。
- `/parts/new` への導線は `/parts` ページにはあるが、修理明細の検索ダイアログから直接新規部品マスタを開く導線は見当たらない。
- PartsMaster登録後に、登録した部品を元の修理明細へ戻す仕組みは見当たらない。
- 内装/外装判定が `category` と `partType` の複数基準に分散している。

### 次に分けるべき最小Task案

- Task 005-A: `docs/ai-tasks/docs/ai-tasks/004...` を正しい `docs/ai-tasks/004...` に移動する。
- Task 005-B: `PartsSearchPanel` の文字化けUI文言だけを修正する。
- Task 005-C: 部品検索ダイアログに `/parts/new` を別タブで開くリンクだけ追加する。
- Task 005-D: 右下部品パネルを開く時、対象明細の部品名を `PartsSearchPanel` の初期keywordへ渡す。
- Task 005-E: `PartsSearchPanel` に `initialPartType` を渡し、対象明細の内装/外装に合わせて初期フィルタを設定する。
- Task 005-F: 部品カテゴリ選択UIだけを追加し、検索ロジックや保存処理には触らない。
- Task 005-G: PartsMaster新規登録後の「明細へ挿入」導線を設計だけ調査する。

### 変更ファイル

- `docs/ai-tasks/docs/ai-tasks/004-investigate-parts-panel-flow.md`

コード変更はなし。

### git status結果

調査開始時点・追記前は `?? docs/ai-tasks/docs/` のみ。

追記後もコード変更はなし。`docs/ai-tasks/docs/` は未追跡のまま残る想定。

### カタリにレビューしてほしい点

- 右下部品パネルは既に「選択した部品を明細行へ反映」まではできているため、次は新規マスタ登録導線より先に、`PartsSearchPanel` の文字化け修正と初期検索条件の受け渡しを小さく進めるのが安全そう。
- `partType` と `category` の判定が複数箇所に分散しているため、大改修せずにまず初期値渡しだけで揃える方針がよさそう。
