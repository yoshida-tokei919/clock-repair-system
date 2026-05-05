# AI Task 010: 交換部品入力欄に内装/外装・カテゴリ・部品名の補助UI枠を出す

## 目的

交換部品入力フローの第一段階として、見積・修理明細の入力行に、内装 / 外装・部品カテゴリ・部品名を選ぶための補助UI枠を追加する。

今回の目的は、UI接続の入口を作ること。

まだ以下は実装しない。

- PartsSearchPanel への初期検索条件渡し
- PartsMaster検索
- PartsMaster候補から明細挿入
- 外部検索
- 部品マスタ登録
- 保存payload変更
- DB変更
- API変更

## ブランチ

feature/add-part-input-helper-ui

## 触ってよい範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/010-add-part-input-helper-ui.md`

必要なら import 追加のみ。

- `src/lib/part-input-options.ts`

ただし `src/lib/part-input-options.ts` の中身は原則変更しない。

## 触ってはいけない範囲

- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/*`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- PartsMaster検索ロジック
- 外部検索導線
- 帳票生成処理

## 前提

AI Task 008 で以下の定義ファイルを作成済み。

- `src/lib/part-input-options.ts`

このファイルには以下がある。

- `PartInputType`
- `PartCategoryOption`
- `PartNameOption`
- `PART_INPUT_TYPES`
- `PART_CATEGORIES`
- `PART_NAME_OPTIONS`
- `getPartCategoriesByType`
- `getPartNamesByCategory`
- `getPartNameOptionByKey`
- `searchPartNameOptions`

AI Task 009 でレビュー済み。

- 外装カテゴリ 6件
- 内装カテゴリ 10件
- 部品名候補 223件
- key重複なし
- categoryKey不整合なし
- `aliasesJa` / `aliasesEn` なし
- `part_internal` / `part_external` のみ使用

## 今回の実装方針

### 1. 入力行側に補助UIを出す

対象は、見積・修理明細欄の「新規追加用の入力行」。

既存の `addItemCategory` や作業名 / 部品名入力欄の周辺に、以下を追加する。

- 内装 / 外装
- 部品カテゴリ
- 部品名

ただし、既存UIを大きく作り替えない。

### 2. 交換部品入力時だけ表示する

補助UIは、交換部品入力時だけ表示する。

既存のカテゴリ判定に合わせて、例えば以下のように判断する。

```ts
const isAddingPartItem = addItemCategory.includes("part");

既存コードに同等の判定があれば、それを使う。

技術料入力時には表示しない。

3. 保存payloadにはまだ入れない

今回選んだ値は、まだ保存payloadには反映しない。

今回の目的は「入力補助UIの表示」と「state保持」まで。

保存処理、POST / PATCH payload、API routes は変更しない。

4. 既存の作業名 / 部品名入力は壊さない

既存の AdvancedCombobox / workOpts / selectedWorkOption の挙動は維持する。

候補選択時の価格・原価・partsMasterId 反映ロジックは変更しない。

実装要件
1. import

RepairEntryForm.tsx で、必要なものだけ import する。

例：

import {
  type PartInputType,
  getPartCategoriesByType,
  getPartNamesByCategory,
  getPartNameOptionByKey,
} from "@/lib/part-input-options";

実際の import パスは既存のalias設定に合わせること。

2. state追加

新規追加入力行用に、最小限のstateを追加する。

例：

const [selectedPartInputType, setSelectedPartInputType] =
  useState<PartInputType>("part_external");

const [selectedPartCategoryKey, setSelectedPartCategoryKey] =
  useState<string>("");

const [selectedPartNameKey, setSelectedPartNameKey] =
  useState<string>("");

命名は既存コードに合わせてよい。

3. derived values

選択肢を取得する。

例：

const partCategoryOptions = getPartCategoriesByType(selectedPartInputType);

const partNameOptions = selectedPartCategoryKey
  ? getPartNamesByCategory(selectedPartCategoryKey)
  : [];
4. partType変更時の挙動

内装 / 外装を切り替えたら、カテゴリと部品名はクリアする。

setSelectedPartInputType(nextType);
setSelectedPartCategoryKey("");
setSelectedPartNameKey("");
5. カテゴリ変更時の挙動

カテゴリを切り替えたら、部品名はクリアする。

setSelectedPartCategoryKey(nextCategoryKey);
setSelectedPartNameKey("");
6. UI表示

交換部品入力時だけ、既存入力行の近くに補助UIを表示する。

表示項目：

内装 / 外装
外装部品
内装部品

PART_INPUT_TYPES を使ってもよい。

表示は select でも segmented button でもよい。
最小差分なら select でよい。

部品カテゴリ

getPartCategoriesByType(selectedPartInputType) の結果を表示する。

未選択時は以下のような placeholder を表示する。

部品カテゴリを選択
部品名

getPartNamesByCategory(selectedPartCategoryKey) の結果を表示する。

表示は以下を優先する。

option.displayJa ?? option.nameJa

未選択時は以下のような placeholder を表示する。

部品名を選択

カテゴリ未選択の場合は disabled にする。

7. 部品名選択時の入力欄反映

部品名を選択したら、既存の新規入力行の「作業名 / 部品名」入力欄にも、表示名を反映してよい。

例：

const selected = getPartNameOptionByKey(nextPartNameKey);
setAddItemName(selected?.displayJa ?? selected?.nameJa ?? "");

ただし、既存の変数名が違う場合は既存コードに合わせる。

この処理が危険そうなら、今回は部品名state保持だけにして、入力欄反映は行わず報告する。

8. UIラベル

補助UIの近くに、簡単な説明を表示する。

例：

部品カテゴリは部品名を絞り込むために使用します。
重要な禁止事項

以下は絶対にしない。

保存payloadの変更
POST / PATCH処理の変更
API route の変更
Prisma schema の変更
PartsMaster検索ロジックの変更
PartsSearchPanel連携
外部検索連携
部品マスタ登録導線追加
明細挿入ロジックの変更
workOpts生成ロジックの変更
selectedWorkOptionの構造変更
unrelated file の変更
UI全体の作り替え
ついでのリファクタリング
完了条件
交換部品入力時だけ補助UIが表示される。
技術料入力時には補助UIが表示されない。
内装 / 外装を選べる。
内装 / 外装に応じてカテゴリ候補が変わる。
カテゴリに応じて部品名候補が変わる。
部品名の表示は displayJa ?? nameJa を使う。
内装 / 外装を切り替えるとカテゴリ・部品名がクリアされる。
カテゴリを切り替えると部品名がクリアされる。
保存payloadは変更されていない。
API routes は変更されていない。
Prisma schema は変更されていない。
PartsSearchPanel は変更されていない。
src/lib/part-input-options.ts の定義内容は変更されていない。
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts が通る。
可能なら npx.cmd tsc --noEmit も実行する。ただし既存エラーがある場合は、今回変更由来かを切り分ける。
git status --short で想定外の変更がない。
確認コマンド
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts
git status --short

可能なら以下も実行する。

npx.cmd tsc --noEmit

ただし、既存のPrisma型不一致・依存不足エラーがある場合は、今回変更由来かどうかを報告すること。

画面確認

可能なら以下を確認する。

交換部品入力時
見積・修理明細の入力行で、交換部品を選ぶ
内装 / 外装の補助UIが表示される
外装を選ぶと外装カテゴリが出る
内装を選ぶと内装カテゴリが出る
カテゴリを選ぶと部品名候補が出る
針候補は 秒針・6H のように表示される
耐震系候補も選択肢として表示できる
技術料入力時
技術料を選ぶ
補助UIが表示されない
既存の技術料入力が壊れていない
Codexへの指示

まず以下を確認してください。

docs/ai-tasks/008-create-part-input-options-definition.md
docs/ai-tasks/009-review-part-input-options-definition.md
src/lib/part-input-options.ts
src/components/repairs/RepairEntryForm.tsx

そのうえで、RepairEntryForm.tsx の見積・修理明細入力行に、内装 / 外装・部品カテゴリ・部品名の補助UIを最小差分で追加してください。

今回はUI補助枠とstate保持だけです。

以下は禁止です。

保存payloadの変更
API routes の変更
Prisma schema の変更
PartsSearchPanel の変更
PartsMaster検索の変更
外部検索の変更
部品マスタ登録導線追加
明細挿入ロジック変更
workOpts生成ロジック変更
unrelated file の変更
ついでのリファクタリング

実装後、変更内容を最小限にまとめて報告してください。

Codexの返答形式

以下の形式で返してください。

実施内容
変更ファイル
追加したstate
追加したUI
既存挙動への影響
触っていない重要ファイル
確認コマンド
画面確認
git status結果
未対応・注意点
カタリにレビューしてほしい点
Codex実装結果 2026-05-03

未記入。