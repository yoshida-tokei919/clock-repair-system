# AI Task 005: PartsSearchPanel の文字化けUI文言だけ修正する

## 目的

部品検索パネル周辺に残っている文字化けしたUI文言を修正する。

AI Task 004 の調査で、以下の周辺に文字化けが残っている可能性が確認された。

- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-search.ts`
- `src/components/parts/PartsForm.tsx`
- `/parts` 関連ページ

ただし、今回のTaskでは検索導線や部品マスタ登録フローは変更しない。
まずはユーザーに見える文字化けUI文言だけを安全に直す。

## ブランチ

feature/fix-mojibake-in-parts-search-panel

## 触ってよい範囲

原則として以下のみ。

- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-search.ts`

必要最小限で、明らかに文字化けUI文言だけを直す場合に限り以下も可。

- `src/components/parts/PartsForm.tsx`
- `src/app/(app)/parts/page.tsx`
- `src/app/(app)/parts/new/page.tsx`
- `src/app/(app)/parts/[id]/edit/page.tsx`

作業ログとして以下を追加する。

- `docs/ai-tasks/005-fix-mojibake-in-parts-search-panel.md`

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `prisma/schema.prisma`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/parts/route.ts`
- `src/app/api/parts/[id]/route.ts`
- `src/app/api/master-data/route.ts`
- 保存ロジック
- 検索ロジック本体
- API routes
- DB schema
- UI全体の大改修

## 前提

- 今回は文字化け修正だけを行う。
- 部品検索パネルの導線追加はしない。
- `/parts/new` へのリンク追加はしない。
- PartsMaster登録後に修理明細へ戻す導線は作らない。
- `partsSearchQuery` を `PartsSearchPanel` に渡す修正は今回しない。
- 内装 / 外装の判定ロジックは変更しない。
- 検索URL生成ロジックは変更しない。
- 保存処理は変更しない。
- API routes は変更しない。
- 不要なリファクタリングは禁止。
- 日本語ファイルは必ず UTF-8 で扱う。

## 実装要件

- `PartsSearchPanel.tsx` のユーザーに見える文字化け文言を修正する。
- `part-search.ts` にユーザー表示用の文字化けラベルやaliasがある場合は、表示文言として必要な範囲だけ修正する。
- 文字化けしている検索ロジック本体やURL生成処理を、意味が判断できないまま変更しない。
- 意味が推定できない文字化けは、勝手に直さず報告する。
- 文字化け修正に関係ない整形やリファクタリングはしない。
- unrelated file を変更しない。

## 修正対象の優先順位

### 優先1: ユーザーに見えるUI文言

例：

- タイトル
- ボタン
- プレースホルダー
- 説明文
- 空状態メッセージ
- エラーメッセージ
- ラベル
- タブ名

### 優先2: 検索サイト名・表示ラベル

例：

- Yahooオークション
- メルカリ
- Watch Parts Market
- eBay
- AliExpress
- Cousins UK

### 優先3: 日本語alias・カテゴリ名

意味が明確に分かる場合だけ修正する。

ただし、検索語生成ロジックに影響する可能性があるため、判断できないものは変更しない。

## 重要な注意

`src/lib/part-search.ts` は検索語生成に関係する可能性が高い。

そのため、以下は原則禁止。

- 検索URLの構造変更
- 検索対象サイトの追加・削除
- 検索語生成順序の変更
- alias配列の大幅な変更
- 内装 / 外装別の検索ロジック変更
- brand / model / caliber / movement の扱い変更

修正する場合は、文字化けしていて意味が明らかな表示名・ラベルだけに限定する。

## 完了条件

- `PartsSearchPanel.tsx` の主要な文字化けUI文言が修正されている。
- 必要に応じて `part-search.ts` の表示ラベル文字化けが修正されている。
- 検索ロジック本体は変更されていない。
- API routes は変更されていない。
- Prisma schema は変更されていない。
- `RepairEntryForm.tsx` は変更されていない。
- unrelated file を変更していない。
- `npx tsc --noEmit` が通る。
- `git status --short` で想定外の変更がない。

## 確認コマンド

```bash
npx tsc --noEmit
git status --short

## Codex実装ログ 2026-05-02

### 実施内容

- `src/components/parts/PartsSearchPanel.tsx` をUTF-8で確認したところ、主要なユーザー表示UI文言は既に正常な日本語だったため、コード差分は残さない。
- `src/lib/part-search.ts` の検索サイト表示名について、ユーザーに表示される名前だけを修正する。
- 検索URL、検索語生成順序、内装/外装判定、alias配列は変更しない。

### 修正した文字化け文言

- 検索サイト表示名:
  - `ヤフオク` -> `Yahooオークション`
  - `メルカリ` は正常表示のため、表示維持

### 判断できず残した文字化け

- `PART_NAME_EN_ALIASES` は検索語生成ロジックに関わるため、今回は変更しない。
- `PartsForm.tsx` と `/parts` 関連ページにも文字化けが残っているが、今回の直接対象外として変更しない。

### 触っていない重要ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- API routes
- Prisma schema
- 保存ロジック
- 検索ロジック本体
- 部品検索導線

## Codex再確認ログ 2026-05-02

- `src/components/parts/PartsSearchPanel.tsx` を確認したが、主要なユーザー表示文言に文字化けは見当たらなかった。
- `src/lib/part-search.ts` の `ヤフオク` は文字化けではなく略称だったため、今回はコード変更しない。
- `PART_NAME_EN_ALIASES` など検索語生成に関わる箇所は、検索ロジック本体に関係するため今回は触らない。
- `PartsForm.tsx` や `/parts` 関連ページの文字化け確認・修正は、必要なら別Taskに分ける。
