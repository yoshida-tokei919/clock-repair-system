# AI Task 015: 閲覧モードでも部品検索ボタンを使えるようにする

## 目的

既存案件詳細の閲覧モードで、交換部品行の部品検索ボタンが表示されているのにクリックできない問題を整理・修正する。

今回の方針は、**閲覧モードでも部品検索ボタンは使えるようにする**。

理由：

- 部品検索はDB保存を伴わない
- 詳細画面を見ながら部品情報を調べたい実務ニーズがある
- 検索パネルを開くだけなら破壊的操作ではない
- 編集・保存・削除などの操作は引き続き閲覧モードで禁止する

## ブランチ

feature/enable-part-search-button-in-view-mode

## 触ってよい範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/015-enable-part-search-button-in-view-mode.md`

必要がある場合のみ、最小限で以下を確認してよい。

- `src/components/parts/PartsSearchPanel.tsx`

ただし、原則として `PartsSearchPanel.tsx` は変更しない。

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
- 外部検索URL生成ロジック
- 発注管理
- 帳票生成処理

## 前提

AI Task 013 の画面確認で、以下が分かっている。

- 既存案件詳細の閲覧モードでは、交換部品行の検索ボタンが見える
- しかしクリックできない
- 編集モードでは部品パネルを開ける
- 部品パネルを開くと検索欄には明細名が入る

AI Task 014 で、既存明細行からPartsSearchPanelを開く場合の `initialPartType` 導出を追加済み。

## 今回の方針

閲覧モードでも、交換部品行の部品検索ボタンはクリック可能にする。

ただし、閲覧モードで許可するのは以下のみ。

- 部品検索サイト選択ダイアログを開く
- PartsSearchPanel を開く
- 外部検索サイトを開く
- PartsSearchPanel 内でPartsMaster候補を検索する

閲覧モードで禁止するものは維持する。

- 明細の追加
- 明細の削除
- 明細の編集
- 保存
- 写真アップロード
- QR撮影
- DB更新
- PartsMasterを明細に挿入して保存する操作

## 調査ポイント

`RepairEntryForm.tsx` 内で以下を確認する。

### 1. 部品検索ボタンの表示条件

交換部品行だけに表示されているか。

確認候補：

```ts
item.type === "part"
item.category.includes("part")

AI Task 001で、技術料行には部品検索ボタンを表示しない修正済み。

この条件を壊さないこと。

2. 部品検索ボタンのクリック条件

現在、閲覧モードでクリックできない原因を確認する。

可能性：

<fieldset disabled={isReadOnly}> の中にボタンが入っている
Buttonに disabled={isReadOnly} が付いている
onClick内で if (isReadOnly) return; している
上位コンテナのdisabledやpointer-eventsに巻き込まれている
3. 閲覧モードで許可してよい操作か

部品検索ボタンのクリックが、保存・DB更新・明細変更を伴わないことを確認する。

許可してよいもの：

setPartSearchRowIdx(...)
setPartSearchDialogOpen(true)
setPartsPanelOpen(true)
window.open(...)

禁止すべきもの：

handleSave(...)
setLineItems(...)
delete...
create...
update...
4. PartsSearchPanelのonSelect

閲覧モードでPartsSearchPanelを開ける場合、PartsMaster候補の onSelect が明細へ反映・変更してしまう可能性がある。

確認すること：

閲覧モードで PartsSearchPanel の候補選択を許可するか
候補選択が setLineItems などを呼ぶなら、閲覧モードでは無効化するか
今回は検索・閲覧のみ許可し、明細反映は編集モードだけにするのが安全

推奨：

onSelect={isReadOnly ? undefined : existingOnSelect}

または既存onSelect内で、

if (isReadOnly) return;

ただし、検索パネルを開くこと自体は許可する。

実装要件
1. 閲覧モードでも部品検索ボタンをクリック可能にする

以下のどれかで最小修正する。

案A: ボタンをfieldset disabledの外に出す

大きなJSX変更になるなら避ける。

案B: ボタンだけdisabled対象から外す

可能なら最小差分で行う。

案C: onClickの isReadOnly guard を部品検索ボタンでは外す

今回の推奨。

ただし、DB更新・明細変更に繋がる処理ではguardを残す。

2. 技術料行には引き続き表示しない

AI Task 001 の方針を維持する。

item.type === "part"

または既存の安全な判定を維持する。

3. 閲覧モードでPartsSearchPanelを開いても、明細反映はしない

閲覧モードでは検索・確認だけ許可する。

候補選択で明細に挿入する処理は、編集モードのみ許可する。

4. 保存payloadは変更しない

以下は禁止。

handleSave 変更
POST / PATCH payload変更
API route変更
Prisma schema変更
完了条件
閲覧モードの既存案件詳細で、交換部品行の部品検索ボタンがクリックできる
技術料行には部品検索ボタンが表示されない
閲覧モードで部品検索サイト選択ダイアログを開ける
閲覧モードでPartsSearchPanelを開ける
閲覧モードでPartsSearchPanel候補を選んでも明細変更・保存が発生しない、または候補選択が無効化されている
編集モードでは従来どおりPartsMaster候補から明細反映できる
保存payloadは変更されていない
API routes は変更されていない
Prisma schema は変更されていない
npx.cmd tsc --noEmit が通る
git status --short で想定外の変更がない
画面確認

ヨシダさんが確認する項目：

既存案件詳細・閲覧モード
既存案件詳細を開く
例：/repairs/38
交換部品行を見る
部品検索ボタンを押す

OK：

検索サイト選択ダイアログが開く
部品パネルを開ける
検索欄に明細名が入る

NG：

ボタンが見えるのに反応しない
技術料行にも部品検索ボタンが出る
閲覧モードなのに明細内容が変更される
保存処理が走る
既存案件詳細・編集モード
編集モードにする
交換部品行から部品パネルを開く
PartsMaster候補を選ぶ

OK：

従来どおり明細に反映できる
新規案件画面
/repairs/new を開く
技術料行を確認
交換部品行を確認

OK：

技術料では部品検索ボタンなし
交換部品では部品検索ボタンあり
補助UIは従来どおり動く
確認コマンド
npx.cmd tsc --noEmit
git status --short

既存エラーが出る場合は、今回変更由来かどうかを報告すること。

Codexへの指示

まず以下を確認してください。

docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md
docs/ai-tasks/014-derive-initial-part-type-for-existing-line-items.md
src/components/repairs/RepairEntryForm.tsx

今回は、閲覧モードでも部品検索ボタンを使えるようにする最小修正をしてください。

ただし、閲覧モードで許可するのは検索・確認だけです。
明細反映・保存・DB更新は許可しないでください。

以下は禁止です。

技術料行に部品検索ボタンを出す
保存payloadの変更
明細category保存仕様の変更
API routes の変更
Prisma schema の変更
外部検索URL生成ロジックの変更
src/lib/part-input-options.ts の変更
unrelated file の変更
ついでのリファクタリング
Codexの返答形式

短く以下だけ返してください。

実施内容
変更ファイル
保存/API/Prismaを触ったか
閲覧モードで許可した操作
閲覧モードで禁止した操作
型チェック
git status
画面確認してほしい操作
Codex実装結果 2026-05-03

未記入。