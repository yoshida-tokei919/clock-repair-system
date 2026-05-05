# AI Task 012: 補助UI選択値をPartsSearchPanelの初期検索条件へ渡す

## 目的

AI Task 010で追加した交換部品入力補助UIの選択値を、右下の部品パネル `PartsSearchPanel` の初期検索条件として渡す。

今回の目的は、補助UIで選んだ情報を **既存PartsMaster候補検索の初期条件** に使えるようにすること。

まだ以下は実装しない。

- 明細category保存
- DB schema変更
- API route変更
- PartsMaster登録導線
- 外部検索サイト連携
- 発注管理連携
- 見積承認後のOrderRequest連携

## ブランチ

feature/pass-helper-selection-to-parts-search-panel

## 触ってよい範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `docs/ai-tasks/012-pass-helper-selection-to-parts-search-panel.md`

必要最小限で、型定義参照のみ。

- `src/lib/part-input-options.ts`

ただし、`src/lib/part-input-options.ts` の定義内容は原則変更しない。

## 触ってはいけない範囲

- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/parts/route.ts`
- `src/app/api/parts/[id]/route.ts`
- `src/app/api/master-data/route.ts`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- 外部検索導線
- 帳票生成処理
- 発注管理

## 前提

AI Task 010で、`RepairEntryForm.tsx` に以下の補助UI state を追加済み。

```ts
selectedPartInputType
selectedPartCategoryKey
selectedPartNameKey

AI Task 011で、以下の方針に決定済み。

補助UI選択値は当面保存しない。
明細categoryは変更しない。
category: addItemCategory を維持する。
補助UI選択値は、まずPartsMaster検索の初期条件に使う。
part_internal / part_external をDB保存へ流すのはまだ行わない。
今回の実装方針
1. PartsSearchPanel に初期条件propsを追加する

PartsSearchPanel に、初期検索条件用の optional props を追加する。

例：

type PartsSearchPanelProps = {
  mode?: "standalone" | "embedded";
  onSelect?: (part: PartsMasterLike) => void;

  initialKeyword?: string;
  initialPartType?: "interior" | "exterior";
  initialCategoryKey?: string;
  initialPartNameKey?: string;
};

実際の既存Props名・型に合わせて、最小差分で追加する。

2. part_internal / part_external を検索用partTypeに変換する

UI側の値：

"part_external"
"part_internal"

検索側の値として必要なら：

"exterior"
"interior"

へ変換する。

変換は RepairEntryForm.tsx 側、または PartsSearchPanel.tsx 側の近くに小さいhelperとして実装してよい。

例：

function toPartsSearchPartType(partInputType: PartInputType): "interior" | "exterior" {
  return partInputType === "part_internal" ? "interior" : "exterior";
}

ただし、既存 /api/parts/search が期待する値を必ず確認すること。
もし既存APIが別の値体系を使っている場合は、その既存仕様に合わせる。

3. 初期keywordを作る

補助UIで選ばれた部品名を、PartsSearchPanel の初期検索キーワードとして渡す。

優先順位：

選択済み部品名の displayJa
選択済み部品名の nameJa
newItemName
空文字

例：

const selectedPartNameOption = selectedPartNameKey
  ? getPartNameOptionByKey(selectedPartNameKey)
  : undefined;

const partsPanelInitialKeyword =
  selectedPartNameOption?.displayJa ??
  selectedPartNameOption?.nameJa ??
  newItemName ??
  "";
4. PartsSearchPanel側で初期値を使う

PartsSearchPanel 内部に検索keyword stateがある場合、初期値として initialKeyword を使う。

例：

const [keyword, setKeyword] = useState(initialKeyword ?? "");

既にstate名が違う場合は既存に合わせる。

5. initialKeywordが変わった場合の扱い

PartsSearchPanelが開きっぱなしのまま対象明細や選択値が変わる可能性がある。

安全な方針：

初期表示時に反映する
必要なら useEffect で initialKeyword 変更時に内部keywordを同期する
ただし、ユーザーが手入力した検索語を不用意に上書きしないよう注意する

今回の最小実装では、以下のどちらかでよい。

案A: 初回のみ反映
const [keyword, setKeyword] = useState(initialKeyword ?? "");
案B: パネルを開いたタイミングで反映

RepairEntryForm 側で、パネルを開く前に既存stateへ渡す。

どちらが既存構造に合うか調査してから最小差分で選ぶ。

6. PartsSearchPanel検索APIへの影響

今回、API routes は変更しない。

既存 /api/parts/search が partType を受け取れるなら、PartsSearchPanelから既存queryに含めてよい。
ただし、API側の実装変更は禁止。

もしPartsSearchPanelがまだpartTypeをAPIに渡せない構造なら、今回は initialKeyword だけの反映に留め、partType連携は次Taskへ分ける。

実装要件
RepairEntryForm.tsx
補助UIで選ばれた部品名候補を取得する。
PartsSearchPanelを呼び出している箇所へ、初期条件propsを渡す。
selectedPartInputType を必要に応じて "interior" | "exterior" へ変換する。
selectedPartCategoryKey / selectedPartNameKey は保存せず、propsとして渡すだけにする。
明細category保存は変更しない。
保存payloadは変更しない。
PartsSearchPanel.tsx
optional propsを追加する。
initialKeyword が渡された場合、検索欄の初期値に使う。
既存のstandalone利用を壊さない。
mode="standalone" の既存挙動を維持する。
initialPartType を既存API queryに安全に渡せるなら渡す。
もし危険なら、partType連携は今回は見送り、報告する。
変換方針

UI補助値：

part_external
part_internal

検索条件：

exterior
interior

ただし、既存APIの期待値が違う場合は既存仕様に合わせる。

重要な禁止事項

以下は絶対にしない。

保存payloadの変更
POST / PATCH処理の変更
API route の変更
Prisma schema の変更
PartsMaster登録導線追加
外部検索サイト連携
明細category保存仕様の変更
category: addItemCategory の変更
workOpts生成ロジックの変更
selectedWorkOptionの構造変更
src/lib/part-input-options.ts の候補定義変更
unrelated file の変更
UI全体の作り替え
ついでのリファクタリング
完了条件
補助UIで選んだ部品名がPartsSearchPanelの初期検索キーワードに反映される。
可能なら、補助UIで選んだ内装 / 外装がPartsSearchPanelの検索条件に反映される。
standalone のPartsSearchPanel利用が壊れていない。
保存payloadは変更されていない。
明細category保存は変更されていない。
API routes は変更されていない。
Prisma schema は変更されていない。
外部検索ロジックは変更されていない。
src/lib/part-input-options.ts の定義内容は変更されていない。
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts が通る。
可能なら npx.cmd tsc --noEmit も実行する。ただし既存エラーがある場合は今回変更由来かを切り分ける。
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
見積・修理明細の入力行で交換部品を選ぶ。
内装 / 外装を選ぶ。
部品カテゴリを選ぶ。
部品名を選ぶ。
部品パネルを開く。
PartsSearchPanelの検索欄に選んだ部品名が初期表示される。
可能なら、内装 / 外装の検索条件も反映されている。
standalone PartsSearchPanel
/parts など既存の単独PartsSearchPanel利用が壊れていない。
Codexへの指示

まず以下を確認してください。

docs/ai-tasks/010-add-part-input-helper-ui.md
docs/ai-tasks/011-design-part-helper-selection-persistence.md
src/lib/part-input-options.ts
src/components/repairs/RepairEntryForm.tsx
src/components/parts/PartsSearchPanel.tsx
src/app/api/parts/search/route.ts

そのうえで、補助UIの選択値をPartsSearchPanelの初期検索条件へ渡す実装を、最小差分で行ってください。

今回は検索初期条件の連携だけです。

以下は禁止です。

保存payloadの変更
明細category保存仕様の変更
API routes の変更
Prisma schema の変更
外部検索の変更
部品マスタ登録導線追加
発注管理連携
src/lib/part-input-options.ts の候補定義変更
unrelated file の変更
ついでのリファクタリング

実装後、変更内容を最小限にまとめて報告してください。

Codexの返答形式

以下の形式で返してください。

実施内容
変更ファイル
追加したprops
初期検索keywordの作り方
part_internal / part_external の変換方針
PartsSearchPanel側の変更
既存挙動への影響
触っていない重要ファイル
確認コマンド
画面確認
git status結果
未対応・注意点
カタリにレビューしてほしい点
Codex実装結果 2026-05-03

未記入。