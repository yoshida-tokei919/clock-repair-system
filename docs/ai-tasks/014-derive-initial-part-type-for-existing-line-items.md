# AI Task 014: 既存明細行からPartsSearchPanelを開く場合の initialPartType 導出

## 目的

AI Task 013 の画面確認で、既存明細行からPartsSearchPanelを開いた場合、検索欄には明細名が入るが、部品種別が「すべて」になることが分かった。

今回の目的は、既存明細行から部品パネルを開く場合に、可能な範囲で `initialPartType` を `interior` / `exterior` に導出して渡すこと。

ただし、保存仕様やDB構造には触れない。

## ブランチ

feature/derive-initial-part-type-for-existing-line-items

## 触ってよい範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/014-derive-initial-part-type-for-existing-line-items.md`

必要な場合のみ、型参照・helper追加を最小限。

- `src/components/parts/PartsSearchPanel.tsx`

ただし、PartsSearchPanel側の挙動変更は原則避ける。  
Task 012で追加した `initialPartType` props を使うことを優先する。

## 触ってはいけない範囲

- `src/lib/part-input-options.ts`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/*`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- 外部検索導線
- 発注管理
- 帳票生成処理

## 前提

AI Task 012で、`PartsSearchPanel` に以下の optional props を追加済み。

```ts
initialKeyword?: string
initialPartType?: "interior" | "exterior"

AI Task 013で、以下を確認済み。

/repairs/new の補助UI選択から部品パネルを開くと、検索欄に初期keywordが入る
外装補助UI選択時は外装側の初期条件が入る
/parts standalone利用は壊れていない
既存明細行から部品パネルを開くと、検索欄には明細名が入るが、部品種別が「すべて」になる
今回の実装方針
1. 保存仕様は変更しない

以下は禁止。

明細category保存仕様の変更
category: addItemCategory の変更
DB schema変更
API変更
payload変更
2. 既存明細行から導出できる場合だけ initialPartType を渡す

既存明細行から部品パネルを開く場合、次のような情報を使って、可能な範囲で interior / exterior を導出する。

確認候補：

lineItems[partsPanelRowIdx]
item.category
item.type
item.partsMasterId
item.partId
item.partType
item.partsMaster?.partType
selectedWorkOption
既存のPartsMaster候補データ

ただし、存在しない項目を無理に使わない。

3. 安全な導出優先順位

可能なら以下の順番で導出する。

優先1: 明細行に明確なpartTypeがある場合

例：

item.partType === "interior" → "interior"
item.partType === "exterior" → "exterior"

または既存コードで以下のような値を持っている場合：

item.partType === "internal" / "external"
item.category === "part_internal" / "part_external"

既存仕様に合わせて安全に変換する。

優先2: categoryから推定できる場合
item.category === "part_internal" → "interior"
item.category === "part_external" → "exterior"

ただし、現在Task 010〜012では明細category保存は変更していないため、通常はこの値は入っていない可能性がある。

優先3: 補助UI選択中のpartTypeを使う場合

新規追加行から開く場合は、Task 012で実装済みの selectedPartInputType 由来を使う。

既存明細行の場合は、補助UIの現在選択値を無理に流用しないこと。

優先4: 推定不能なら undefined

推定できない場合は、initialPartType を渡さない。

この場合、PartsSearchPanelは従来どおり all で開く。

4. 既存明細行名による推測は禁止

以下のような文字列推測は今回しない。

ゼンマイだから interior
リューズだから exterior

理由：

誤判定リスクがある
部品名辞書との照合を始めると実装範囲が広がる
今回は最小差分が目的
5. helper関数はRepairEntryForm内に小さく作る

必要なら RepairEntryForm.tsx 内に小さいhelperを作る。

例：

function toPartsSearchPartTypeFromLineItem(item: LineItem | undefined): "interior" | "exterior" | undefined {
  if (!item) return undefined;

  if (item.partType === "interior" || item.partType === "exterior") {
    return item.partType;
  }

  if (item.category === "part_internal") return "interior";
  if (item.category === "part_external") return "exterior";

  return undefined;
}

ただし、既存LineItem型に partType がない場合、TypeScriptエラーを出さないようにする。
必要なら安全な型ガードを使う。

例：

const partType = "partType" in item ? item.partType : undefined;

または既存型に存在するプロパティだけ使う。

実装要件
1. PartsSearchPanelに渡すinitialPartTypeを整理する

現在Task 012では、以下のような形で渡している。

initialPartType={isAddingPartItem ? partsPanelInitialPartType : undefined}

今回、既存明細行の場合も考慮する。

方針例：

const activePartsPanelLineItem =
  partsPanelRowIdx !== null ? lineItems[partsPanelRowIdx] : undefined;

const existingLineInitialPartType =
  derivePartsSearchPartTypeFromLineItem(activePartsPanelLineItem);

const partsPanelEffectiveInitialPartType =
  existingLineInitialPartType ??
  (isAddingPartItem ? partsPanelInitialPartType : undefined);

このように、既存明細行から導出できる場合はそれを優先する。

2. newItemName / initialKeyword の既存挙動は壊さない

Task 012で実装した partsPanelInitialKeyword の挙動は維持する。

優先順位：

補助UIで選択中の部品名
対象明細行の name
newItemName

この挙動を大きく変えない。

3. 推定不能時はallのまま

既存明細行からpartTypeが導出できない場合、initialPartType は undefined のままにする。

その場合、PartsSearchPanel側は従来どおり all になる。

これは不具合ではなく、今回の安全な挙動。

重要な禁止事項

以下は絶対にしない。

部品名文字列から内装 / 外装を推測する
ゼンマイ などの辞書照合を始める
保存payloadの変更
明細category保存仕様の変更
category: addItemCategory の変更
DB schema変更
API route変更
PartsSearchPanelの検索APIロジック変更
PartsMaster登録導線追加
外部検索連携
発注管理連携
src/lib/part-input-options.ts の候補定義変更
unrelated file の変更
ついでのリファクタリング
完了条件
既存明細行からPartsSearchPanelを開く場合、明示的に導出できるpartTypeがあれば initialPartType に渡される
導出できない場合は従来どおり all
新規追加行の補助UI選択から開く場合の挙動は維持
検索keyword初期値の挙動は維持
保存payloadは変更されていない
明細category保存は変更されていない
API routes は変更されていない
Prisma schema は変更されていない
PartsSearchPanel standalone利用は壊れていない
src/lib/part-input-options.ts は変更されていない
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts が通る
可能なら npx.cmd tsc --noEmit も実行する
git status --short で想定外の変更がない
確認コマンド
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts
git status --short

可能なら以下も実行する。

npx.cmd tsc --noEmit
画面確認

可能なら以下を確認する。

新規追加行から部品パネルを開く場合
/repairs/new
交換部品を選択
外装 / 文字盤・針 / 秒針・6H を選択
部品パネルを開く
keywordが 秒針・6H
partTypeが外装側
既存明細行から部品パネルを開く場合
既存案件詳細を編集モードで開く
既存交換部品行から部品パネルを開く
明細行からpartTypeを導出できる場合は、内装 / 外装が初期選択される
導出できない場合は すべて のままでよい
検索欄には明細名が入る
standalone PartsSearchPanel
/parts
検索欄が空
partTypeが すべて
従来どおり検索できる
Codexへの指示

まず以下を確認してください。

docs/ai-tasks/012-pass-helper-selection-to-parts-search-panel.md
docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md
src/components/repairs/RepairEntryForm.tsx
src/components/parts/PartsSearchPanel.tsx

そのうえで、既存明細行からPartsSearchPanelを開く場合に、可能な範囲で initialPartType を導出して渡す最小差分を実装してください。

今回は保存仕様を変更しないでください。

以下は禁止です。

部品名文字列から内装 / 外装を推測する
保存payloadの変更
明細category保存仕様の変更
API routes の変更
Prisma schema の変更
PartsSearchPanelの検索APIロジック変更
src/lib/part-input-options.ts の変更
unrelated file の変更

実装後、変更内容を最小限にまとめて報告してください。

Codexの返答形式

以下の形式で返してください。

実施内容
変更ファイル
追加した導出ロジック
initialPartTypeの優先順位
既存明細行で導出できない場合の挙動
既存挙動への影響
触っていない重要ファイル
確認コマンド
画面確認
git status結果
未対応・注意点
カタリにレビューしてほしい点
Codex実装結果 2026-05-03

未記入。