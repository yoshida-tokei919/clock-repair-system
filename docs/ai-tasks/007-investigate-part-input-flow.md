# AI Task 007: 交換部品入力フローの既存コード調査

## 目的

交換部品入力欄から、内装 / 外装選択、部品カテゴリ選択、部品名選択、既存PartsMaster候補表示、明細挿入までのフローを実装する前に、既存コード上の差し込み位置を調査する。

今回は実装しない。コード変更は禁止。

## 調査対象

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-search.ts`
- `src/app/api/parts/search/route.ts`
- `src/lib/parts-master.ts`
- `prisma/schema.prisma`

## 調査結果

### 交換部品入力欄の場所

交換部品の追加入力欄は、`RepairEntryForm.tsx` の見積・修理明細カード内にある「入力行」。

- `lineItems.map(...)` が既存明細行の描画。
- その下に `addItemCategory`、`newItemName`、`newItemCost`、`newItemPrice`、`newItemQty`、`newItemSpec` を使う新規追加行がある。
- `addItemCategory` は現在 `internal` / `part_external` の2択。
- `internal` は技術料、`part_external` は交換部品として扱われる。
- 入力欄本体は `AdvancedCombobox`。
- 候補は `workOpts` から渡される。
- 候補選択時は `selectedWorkOption` に候補オブジェクト全体を保持する。

既存明細行側では、`item.category.includes('part')` で部品行かどうかを判定している。

注意点として、`LineItem` には `partType` のような内装/外装専用フィールドは明示されていないが、PartsMaster由来の候補には `partType` が渡りうる。

### 入力欄クリック時の既存挙動

`AdvancedCombobox` はクリックまたはフォーカスで候補リストを開く。

- 手入力時は `onChange` で `newItemName` を即時更新する。
- 手入力で値が変わると `selectedWorkOption` は `null` に戻る。
- 候補クリック時は `onChange(opt.value)` と `onSelectOption(opt)` が呼ばれる。
- `onSelectOption` で価格・原価を入力欄へ反映し、候補オブジェクトを保持する。
- 「＋追加」時は、交換部品の場合 `selectedWorkOption` を優先し、なければ既存フォールバックで `workOpts` から探す。

この構造により、同名候補が複数ある場合でも、クリックした候補の `partsMasterId`、価格、原価を使える。

### 内装 / 外装選択UIの差し込み候補

安全な差し込み位置は3案ある。

1. 入力行の `addItemCategory` select の近く
現在の「技術料 / 交換部品」selectに近く、最小差分で入れやすい。交換部品を選んだ時だけ、内装 / 外装、部品カテゴリ、部品名候補を表示する形が自然。

2. 明細行の下の補助UI
既存明細行ごとに `idx` があり、行単位で編集できる。ただし既存明細行のUIが密なので、補助UIを増やすと見通しが悪くなりやすい。

3. 右下の部品パネル
既に `partsPanelOpen` / `partsPanelRowIdx` があり、対象行に候補を挿入できる。ただし現在のPartsSearchPanelは独立検索フォームなので、入力行の補助UIまで持たせると責務が広がる。

推奨は、まず入力行側に内装 / 外装とカテゴリを追加し、PartsSearchPanelには初期検索条件を渡すだけに留める案。

### 部品カテゴリ・部品名候補データの持ち方案

既存DBの `PartsMaster` には以下がある。

- `partType`: `interior` / `exterior`
- `category`: `internal` / `external` / `generic`
- `subcategory`: 内装サブカテゴリ想定
- `nameJp`
- `nameEn`
- `partRefs`
- `watchRefs`
- `caliberId`
- `baseCaliberId`
- `movementMakerId`
- `baseMakerId`

ただし、「部品カテゴリを選ぶための固定候補」と「部品名候補マスタ」は現時点では独立した定義としては見当たらない。

最小実装としては、最初はコード内定義でよい。

- 部品カテゴリ: UI絞り込み用。英語名は不要。
- 部品名: `nameJp` と `nameEn` を持つ。
- 部品名候補は数百件程度なら、まず `src/lib` または小さな定義ファイルで始められる。
- 将来的にはDBマスタ化できるよう、`id`、`partType`、`categoryKey`、`nameJp`、`nameEn` 形式に寄せると安全。

PartsMasterの `category` は既に保存用途で使われているため、UIカテゴリ候補と完全一致させるかは慎重に決める必要がある。

### PartsSearchPanelとの接続状況

`RepairEntryForm.tsx` には右下の部品パネルがあり、`PartsSearchPanel mode="panel"` を表示する。

- 明細行の 🔍 ボタンで `partSearchDialogOpen` を開く。
- ダイアログ内の「部品パネル」ボタンで `partsPanelOpen` が true になり、`partsPanelRowIdx` に対象行indexが入る。
- `PartsSearchPanel` の `onSelect(part)` で対象行へPartsMaster候補を挿入する。

現在の接続上の制約。

- `partsSearchQuery` state はあるが、現状 `PartsSearchPanel` には渡されていない。
- `PartsSearchPanel` は props として `mode` と `onSelect` だけを受け取る。
- `PartsSearchPanel` 内部に `partType`、`keyword`、`calNumber`、`refKeyword` のstateがあり、初期値を外から渡す仕組みはない。
- `/api/parts/search` は `partType`、`keyword`、`cal`、`ref` を受け取れる。

つまり、選択した内装 / 外装、カテゴリ、部品名をPartsMaster候補検索に接続するには、まず `PartsSearchPanel` に初期条件propsを足すのが最小差分になりそう。

### 明細への挿入処理

新規入力行からの挿入。

- 「＋追加」ボタンで `baseItem` を作る。
- 交換部品かつ候補がある場合、`buildPartLineItem(baseItem, match)` を通す。
- `buildPartLineItem` は `createEstimateItemFromPart` を使い、部品名、価格、原価、`partsMasterId` などを反映する。
- その後 `finalizePartLineItem` を通して `lineItems` に追加する。
- `partsMasterId` があり不足数量があれば `ensureOrderRequest` に進む。

PartsSearchPanelからの挿入。

- `partsPanelRowIdx` で対象行を特定する。
- `lineItems.map((li, i) => i === partsPanelRowIdx ? ... : li)` で対象行だけ置き換える。
- `buildPartLineItem(li, part)` と `finalizePartLineItem` を通す。
- `partsMasterId` があれば不足分を見て `ensureOrderRequest` へ進む。

対象行の特定は基本的に配列index。行削除や並び替えが入る場合は注意が必要だが、現状のUIでは大きな問題にはなっていない。

### 既存コード上の制約・注意点

- `category.includes('part')` が部品判定の中心なので、新しいカテゴリ名を追加する場合も `part_...` 形式にするのが安全。
- `internal` は技術料として使われているため、「内装部品」を `internal` にすると技術料と衝突する。
- 内装部品は `part_internal`、外装部品は `part_external` のように分けるのが既存判定と相性がよい。
- PartsMaster側の `partType` は `interior` / `exterior` なので、UIカテゴリから保存値への変換が必要。
- `PartsSearchPanel` は今は自己完結した検索フォームで、外部から初期検索条件を受け取れない。
- `partsSearchQuery` は既にstateとして存在するが未接続なので、次Taskで使う余地がある。
- 外部検索語生成は `part-search.ts` にあり、検索ロジック本体を触るTaskとは分けるべき。

## 次に分けるべき最小実装Task案

### Task 008: 交換部品選択時に補助UI枠だけ表示

- `addItemCategory === 'part_external'` の時だけ、内装 / 外装・カテゴリ・部品名の表示枠を出す。
- 値の保存や検索連動はまだしない。

### Task 009: 内装 / 外装選択stateを追加

- 入力行専用に `newPartType` を持つ。
- 値は `interior` / `exterior`。
- 既存の `category.includes('part')` 判定は壊さない。

### Task 010: 部品カテゴリ・部品名候補の定義ファイルを作る

- 最初はコード内定義。
- `partType`、`categoryKey`、`categoryLabel`、`nameJp`、`nameEn` を持つ。
- DB化は将来Task。

### Task 011: カテゴリ選択で部品名候補を絞り込む

- UI候補だけを絞り込む。
- PartsMaster検索や保存ロジックはまだ触らない。

### Task 012: 選択した部品名を入力欄・外部検索語へ反映

- 選んだ部品名で `newItemName` を更新する。
- `part-search.ts` のロジック本体は変えず、既存の引数に渡る値だけ整える。

### Task 013: PartsSearchPanelに初期検索条件propsを追加

- `initialPartType`、`initialKeyword`、`initialCal`、`initialRef` のようなpropsを検討する。
- `/api/parts/search` の検索条件は既存のまま使う。

### Task 014: PartsMaster候補から明細挿入する項目の確認・補正

- `partType`、`category`、`partsMasterId`、価格、原価、在庫、仕入先が明細へ期待通り反映されるか確認する。
- 発注連携への影響も確認する。

### Task 015: 候補がない場合の外部検索・PartsMaster登録導線

- 外部検索サイトを開く。
- `/parts/new` を別タブで開く。
- 明細へ戻す導線は別Taskに分ける。

## 推奨方針

まずは入力行側に「交換部品用の補助UI」を最小追加するのが安全。

部品パネルは既存PartsMaster候補の検索・選択に限定し、カテゴリ選択やPartsMaster新規登録フォームを抱え込ませない方がよい。

内装 / 外装の保存値は、UIでは分かりやすく「内装 / 外装」、内部では `partType: interior/exterior`、明細カテゴリでは `part_internal/part_external` のように分けるのが既存コードに馴染みやすい。
