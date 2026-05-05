# AI Task 011: 補助UIの選択値を明細追加時にどう扱うか設計

## 目的

AI Task 010で追加した交換部品入力補助UIの選択値を、今後どのように明細追加・保存・PartsMaster検索・発注管理へつなげるかを設計する。

今回は実装しない。  
まず、既存コードへの影響を調査し、安全な保存方針を決める。

## ブランチ

feature/design-part-helper-selection-persistence

## 触ってよい範囲

調査・設計のみ。

原則としてコード変更は禁止。

作業ログとして以下のみ追加・編集してよい。

- `docs/ai-tasks/011-design-part-helper-selection-persistence.md`

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-input-options.ts`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/*`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- UI実装
- 帳票生成処理

## 前提

AI Task 010 では、交換部品入力欄に以下の補助UIを追加した。

- 内装 / 外装
- 部品カテゴリ
- 部品名

追加されたstate：

```ts
selectedPartInputType
selectedPartCategoryKey
selectedPartNameKey

ただし、Task 010では保存payloadや明細categoryは変更していない。

現状の明細追加時のcategoryは既存どおり。

category: addItemCategory

Task 010で一度検討されたが、今回は戻した変更：

category: isAddingPartItem ? selectedPartInputType : addItemCategory

この変更は、保存payload・既存category判定・PartsMaster検索・発注管理・帳票へ影響する可能性があるため、Task 011で設計確認する。

設計上の重要論点
1. addItemCategory と selectedPartInputType の関係

現在の入力UIには、既存の addItemCategory がある。

一方、補助UIには以下がある。

selectedPartInputType: "part_external" | "part_internal"

検討すること：

addItemCategory は今後も残すべきか
交換部品入力時だけ selectedPartInputType を使うべきか
明細追加時の category に part_external / part_internal を保存してよいか
既存の addItemCategory の値とどう整合させるか
2. 既存category判定への影響

AI Task 007 の調査で、交換部品判定は主に以下だった。

item.category.includes("part")

確認すること：

part_external / part_internal はこの判定に通るか
internal は技術料系と衝突する可能性があるため使わない方針でよいか
技術料 internal と内装部品 part_internal が衝突しないか
既存の item.type === "part" 判定との関係
Task 001で追加した「技術料明細では部品検索サイトボタン非表示」と衝突しないか
3. 保存payloadへの影響

確認対象：

handleAddLineItem
handleSave
POST /api/repairs
PATCH /api/repairs/[id]
lineItems
estimateItems
partsMasterId
partId
category
type

確認すること：

明細追加時に category: part_external / part_internal を入れると保存payloadが変わるか
API側がその値を受け取れるか
DB保存時に既存schemaと衝突しないか
帳票や明細表示に影響が出ないか
既存保存済みデータと互換性があるか
4. 補助UI選択値をどこまで保存するか

検討候補：

案A: category だけ保存する
category: "part_external" | "part_internal"

メリット：

既存の category.includes("part") に乗りやすい
内装 / 外装の区別が明細に残る

デメリット：

部品カテゴリや部品名候補keyは残らない
UIで選んだ selectedPartCategoryKey / selectedPartNameKey が保存されない
案B: category は既存値のまま、別フィールドで保持する

例：

partType: "part_external" | "part_internal"
partCategoryKey: string
partNameKey: string

メリット：

既存categoryに影響が少ない
選択値を細かく残せる

デメリット：

schema / API / payload 変更が必要になる可能性が高い
今すぐやるには大きい
案C: 今は保存しない

Task 010の現状維持。

メリット：

安全
既存保存処理に影響しない

デメリット：

PartsMaster検索や発注管理に補助UI選択値を使いにくい
UIで選んだ情報が明細追加後に残らない
案D: 当面は newItemName のみ反映し、保存仕様は変えない

Task 010の現状。

メリット：

既存明細追加フローに最も安全
ユーザーは選択式で部品名を入れられる

デメリット：

内装 / 外装・カテゴリ・partNameKey は保存されない
5. PartsMaster検索との関係

将来的には、以下をPartsSearchPanelや /api/parts/search に渡したい。

partType
partCategoryKey
partNameKey
keyword

確認すること：

PartsSearchPanel は現在どのpropsを受けるか
/api/parts/search は partType / keyword / cal / ref を受けられるか
selectedPartInputType を検索条件に使うなら、保存前stateだけで足りるか
明細に保存する必要があるか
partsPanelRowIdx と組み合わせるべきか
6. 発注管理との関係

将来的に、見積承認後に必要部品を発注管理へ流す。

確認すること：

発注管理側は内装 / 外装を区別する必要があるか
part_internal / part_external がOrderRequestに必要か
既存のOrderRequestモデルや発注管理画面にpartType相当があるか
PartsMasterに紐付いていれば、明細側で保存しなくてもよいか
PartsMaster未登録部品の場合、明細側に最低限何を残すべきか
7. 帳票への影響

確認すること：

見積書・納品書・請求書・保証書が category を表示や集計に使っているか
part_internal / part_external が帳票表示に出てしまう可能性があるか
帳票側は name / description / price だけ見ているのか
category変更で並び順や区分表示が変わるか
調査対象

主対象：

src/components/repairs/RepairEntryForm.tsx
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
prisma/schema.prisma

必要に応じて：

src/components/parts/PartsSearchPanel.tsx
src/app/api/parts/search/route.ts
src/lib/parts-master.ts
src/lib/part-search.ts
src/actions/document-actions.ts
src/app/documents/*
src/components/documents/*
発注管理関連ファイル

ただし、今回は変更禁止。

設計してほしい項目
1. 現在の明細categoryの使われ方

以下を整理する。

addItemCategory の選択肢
lineItems[].category
item.category.includes("part")
item.type
partsMasterId
partId
selectedWorkOption
buildPartLineItem
finalizePartLineItem
2. part_internal / part_external を保存してよいか

以下の観点で判断する。

既存UI
保存payload
API
DB schema
帳票
PartsMaster検索
発注管理
既存データ互換
3. 選択値の保存方針案

以下を比較する。

今は保存しない
categoryだけ保存する
別フィールドとして保存する
PartsMasterに紐付いた時だけ保存する
4. 最小実装Task案

次に実装する場合、どこから始めるのが安全か提案する。

候補：

Task 012-A: 補助UI選択値をPartsSearchPanelの初期検索条件にだけ渡す
Task 012-B: 明細追加時に category を part_internal / part_external へ変える
Task 012-C: 保存payload / API / schemaを調査して別フィールド追加を検討
Task 012-D: PartsMaster選択時だけpartTypeを明細へ反映する
Task 012-E: まずは保存せず、検索導線だけに使う
完了条件
コード変更をしていない
現在のcategory使用箇所が整理されている
part_internal / part_external 保存可否が整理されている
保存payload / API / DB / 帳票への影響が整理されている
PartsMaster検索・発注管理への影響が整理されている
次に分けるべき最小Task案が整理されている
git status --short で想定外の変更がない
確認コマンド
git status --short

必要なら以下も実行してよい。

npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts

ただし今回は設計Taskなので、型チェックは必須ではない。

Codexへの指示

まず既存コードを調査してください。

今回の目的は、AI Task 010で追加した補助UIの選択値を、明細追加時に保存するべきか、検索だけに使うべきか、安全に設計することです。

今回は実装しないでください。
コード変更は禁止です。

この docs/ai-tasks/011-design-part-helper-selection-persistence.md の末尾に調査・設計結果を追記することだけ許可します。

以下を必ず整理してください。

現在の明細categoryの使われ方
part_internal / part_external を保存してよいか
保存payload / API / DB / 帳票への影響
PartsMaster検索・発注管理への影響
選択値の保存方針案
次に分けるべき最小Task案
Codexの返答形式

以下の形式で返してください。

調査対象ファイル
現在の明細categoryの使われ方
part_internal / part_external 保存可否
保存payload / API / DBへの影響
帳票への影響
PartsMaster検索への影響
発注管理への影響
推奨方針
次に分けるべき最小Task案
変更ファイル
git status結果
カタリにレビューしてほしい点
Codex設計結果 2026-05-03

未記入。
 

---

## Codex設計結果 2026-05-05

### 調査対象ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `prisma/schema.prisma`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/app/api/parts/search/route.ts`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/actions/document-actions.ts`
- `src/app/documents/*`

### 現在の明細categoryの使われ方

`RepairEntryForm.tsx` の `LineItem.category` は、画面上の明細が技術料か交換部品かを判定する主要なフラグになっている。

- 新規追加欄の `addItemCategory` は現状 `internal | part_external`
- 技術料は `internal`
- 交換部品は `part_external`
- 判定は主に `item.category.includes("part")`
- 保存payloadでは `type: i.category.includes("part") ? "part" : "labor"` を作る
- payloadには `category: i.category` も含まれる

ただし、Prisma の `EstimateItem` モデルには `category` カラムがない。そのため、明細の `category` は `EstimateItem` としては永続化されていない。編集画面で既存見積を復元すると、技術料は `internal`、部品は `part_external` として再構成される。

一方で、API側では保存前のpayload上の `category` が PartsMaster 同期処理に使われている。`src/app/api/repairs/route.ts` と `src/app/api/repairs/[id]/route.ts` では `item.category === "internal" || item.category === "part_internal"` を内装判定に使い、さらに `createOrUpdatePartsMaster` に `category: item.category` を渡している。

### part_internal / part_external 保存可否

現時点で `part_internal / part_external` を明細 `category` として保存するのは非推奨。

理由:

- `EstimateItem` には `category` カラムがなく、明細categoryとしては永続化されない
- payload上の `category` は API の PartsMaster 同期に使われる
- PartsMaster 側の `category` は schema コメント上 `internal / external / generic` の既存互換値として扱われている
- `part_internal / part_external` をそのまま渡すと、PartsMaster.category にUI明細用の値が混入する可能性がある
- PartsMaster の `partType` は `interior / exterior` 系で、`part_internal / part_external` とは値体系が違う

したがって、Task 010 時点では選択値を明細 `category` に保存せず、補助UIの選択は品名入力または将来の検索条件に使うだけに留めるのが安全。

### 保存payload / API / DBへの影響

現在の保存payloadは `type`, `category`, `partType`, `name`, `price`, `cost`, `notes`, `grade`, `note1`, `note2`, `partRef`, `cousinsNumber`, `stockQuantity`, `partsMasterId`, `quantity` を送っている。

ただしDBの `EstimateItem` に保存されるのは主に `itemName`, `type`, `unitPrice`, `quantity`, `partsMasterId`。補助UIの `selectedPartInputType`, `selectedPartCategoryKey`, `selectedPartNameKey` を永続化したい場合、既存DBには保存先がない。

永続化するなら、少なくとも次のどちらかを別Taskで設計する必要がある。

1. `EstimateItem` に専用カラムを追加する
   - `partInputType`
   - `partCategoryKey`
   - `partNameKey`
2. metadata JSON のような拡張領域を追加する

どちらの場合も API routes、保存payload、編集画面の復元、帳票影響確認が必要になるため、Task 010/011 の範囲では実装しない。

### 帳票への影響

帳票系は主に `EstimateItem.itemName`, `unitPrice`, `quantity`, `partsMaster.grade`, `partsMaster.notes2` を使っている。

確認対象:

- `src/actions/document-actions.ts`
- `src/app/documents/estimate/[id]/page.tsx`
- `src/app/documents/delivery/[id]/page.tsx`
- `src/app/documents/invoice/[id]/page.tsx`

現状では `EstimateItem.category` が存在しないため、明細category変更が直接帳票表示に出る構造ではない。ただし、補助UIの部品名選択で `newItemName` に `displayJa ?? nameJa` を入れると、保存後の `itemName` として帳票に表示される。この影響はTask 010で意図した範囲。

### PartsMaster検索への影響

`PartsSearchPanel.tsx` は独自に `partType: all | interior | exterior`, `keyword`, `calNumber`, `refKeyword` を持つ。`/api/parts/search` は `partType`, `keyword`, `cal`, `ref` を受け取る。

Task 010 の補助UI state は現時点で PartsSearchPanel へ渡っていない。将来的に補助UI選択値を検索へ使う場合は、保存より先に「検索初期条件として渡す」Taskに分けるのが安全。

注意点:

- 補助UIの `part_internal / part_external` は PartsMaster検索の `interior / exterior` へ変換が必要
- `partCategoryKey` は現行 `/api/parts/search` に対応パラメータがない
- `partNameKey` は検索語 `keyword` に変換するのが現実的

### 発注管理への影響

発注管理は `partsMasterId` を中心に動いている。

主な確認点:

- `RepairEntryForm.tsx` の `ensureOrderRequest`
- `/api/orders`
- `/api/orders/[id]`
- `OrderRequest` モデル

`OrderRequest` は `partsMasterId`, `partNameJp`, `partNameEn`, `partRefs`, `cousinsNumber`, `quantity`, `supplierId`, `status` を持つが、補助UIの `partCategoryKey` や `partNameKey` は持たない。

したがって、補助UIだけで選んだ未マスタ部品は、発注管理へ直接つながらない。発注連携するには PartsMaster に紐づく必要がある。

### 推奨方針

現時点の推奨は以下。

1. Task 010 の現状維持
   - 補助UI選択値は保存しない
   - `newItemName` への反映だけ行う
   - `category` は既存の `addItemCategory` のまま
2. 次Taskでは保存ではなく検索接続から始める
   - 補助UIの選択値を PartsSearchPanel の初期条件へ渡す
   - `part_internal / part_external` は `interior / exterior` に変換する
   - 部品名は `displayJa ?? nameJa` または `nameJa/nameEn` を keyword に使う
3. 永続化はさらに後続Taskに分離する
   - `EstimateItem` に専用カラムを追加するか
   - metadata JSON を追加するか
   - API / DB / 帳票 / 編集復元をまとめて設計する

`category` に `part_internal / part_external` を保存して内外装情報を兼用する案は避ける。既存のUI判定・APIのPartsMaster同期・PartsMaster.categoryの値体系が混ざるため。

### 次に分けるべき最小Task案

#### Task 012-A: 補助UI選択値をPartsSearchPanelの初期検索条件へ渡す

- DB変更なし
- 保存payload変更なし
- `selectedPartInputType` を `interior / exterior` へ変換
- `selectedPartNameKey` から表示名または日英名称を検索keywordにする
- PartsSearchPanel の初期値props追加を検討

#### Task 012-B: 補助UI選択値を明細行の一時metadataとして保持する

- DB保存なし
- lineItems上だけに `partInputType`, `partCategoryKey`, `partNameKey` を持たせるか検討
- 編集保存後には消える前提
- UI上の検索・発注補助に使えるか検証

#### Task 012-C: 補助UI選択値の永続化設計

- Prisma schemaに専用カラムを追加する案
- JSON metadata案
- API POST/PATCHの保存・復元
- 既存データ互換
- 帳票非表示方針

#### Task 012-D: PartsMaster登録・同期との接続設計

- `part_internal / part_external` と PartsMaster `interior / exterior` の変換
- `partCategoryKey` を PartsMaster.category/subcategory にどう対応させるか
- 未マスタ部品を登録する導線の要否

#### Task 012-E: 発注管理連携設計

- 補助UI選択のみの部品を発注候補にできるか
- PartsMaster必須を維持するか
- OrderRequest に補助UI由来情報を持たせる必要があるか

### 結論

Task 011時点では、補助UI選択値は保存しない方針が最も安全。次は「保存」ではなく「PartsMaster検索の初期条件に使う」最小Taskへ進むのがよい。永続化は schema / API / 帳票 / 編集復元まで含むため、別Taskで扱う。
