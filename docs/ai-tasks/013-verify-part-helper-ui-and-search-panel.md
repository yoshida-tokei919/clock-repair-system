# AI Task 013: 部品入力補助UIとPartsSearchPanel初期検索の画面動作確認

## 目的

AI Task 010〜012で追加した、交換部品入力補助UIとPartsSearchPanel初期検索条件の連携を、画面上で確認する。

今回は原則として実装しない。  
目的は、実際の画面で以下が期待どおり動くかを確認し、問題があれば次の修正Taskへ分解すること。

## ブランチ

feature/verify-part-helper-ui-and-search-panel

## 触ってよい範囲

原則、調査・画面確認のみ。

作業ログとして以下のみ追加・編集してよい。

- `docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md`

明らかなtypoや軽微な表示崩れがある場合でも、今回は勝手に修正せず、まず報告すること。

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
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

AI Task 010で、見積・修理明細の入力行に補助UIを追加済み。

- 内装 / 外装
- 部品カテゴリ
- 部品名

AI Task 011で、補助UI選択値は当面保存しない方針にした。

- 明細categoryは変更しない
- 保存payloadは変更しない
- 補助UI選択値はまずPartsMaster検索の初期条件に使う

AI Task 012で、補助UI選択値をPartsSearchPanelの初期検索条件として渡す実装を追加済み。

- `initialKeyword`
- `initialPartType`

## 今回の確認対象

主対象：

- `/repairs/new`
- 既存案件詳細画面 `/repairs/[id]`
- `/parts`

確認対象ファイル：

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/lib/part-input-options.ts`

ただし、今回は変更禁止。

---

## 確認項目

### 1. 新規案件画面での表示確認

`/repairs/new` を開く。

確認すること：

- 見積・修理明細の入力行が表示される
- 技術料選択時には、内装 / 外装・カテゴリ・部品名の補助UIが表示されない
- 交換部品選択時には、補助UIが表示される
- UIが大きく崩れていない
- 既存の作業名 / 部品名入力欄が残っている
- 追加ボタンが従来通り表示されている

### 2. 補助UIの選択動作確認

交換部品選択時に確認する。

#### 内装 / 外装

- 初期値が外装部品になっている
- 内装部品に切り替えられる
- 外装部品に戻せる
- 内装 / 外装を切り替えたら、カテゴリ・部品名がクリアされる

#### 部品カテゴリ

- 外装部品選択時、外装カテゴリが出る
  - ケース・風防
  - リューズ・チューブ
  - プッシャー
  - ベゼル
  - 文字盤・針
  - ブレス・バンド
- 内装部品選択時、内装カテゴリが出る
  - 動力・巻上
  - 輪列
  - 脱進機
  - 調速機
  - 針回し
  - カレンダー
  - 自動巻
  - クロノグラフ
  - クォーツ
  - 地板
- カテゴリを切り替えたら、部品名がクリアされる

#### 部品名

- カテゴリ未選択時、部品名selectがdisabledになっている
- カテゴリ選択後、部品名候補が出る
- `文字盤・針` を選ぶと、`秒針・6H` のような `displayJa` 表示が出る
- `脱進機` または `調速機` を選ぶと、耐震系候補が表示できる
- 部品名を選ぶと、既存の作業名 / 部品名入力欄に `displayJa ?? nameJa` が反映される

### 3. 明細追加の確認

交換部品として部品名を選び、明細に追加する。

確認すること：

- 明細行が追加できる
- 追加後の明細名が、選んだ部品名になっている
- 保存payloadやDB変更は今回確認対象外だが、画面上で明細追加が壊れていない
- 追加後に補助UIの部品名選択がクリアされる
- 技術料追加も従来どおりできる

### 4. PartsSearchPanel初期検索確認

交換部品入力時に補助UIで部品名を選び、部品パネルを開く。

確認例：

- 外装部品
- 文字盤・針
- 秒針・6H

確認すること：

- PartsSearchPanelの検索欄に `秒針・6H` が初期表示される
- 内装部品を選んだ場合、可能なら検索条件が内装側になる
- 外装部品を選んだ場合、可能なら検索条件が外装側になる
- パネル内で手入力した検索語が、props変更で勝手に上書きされない

### 5. 既存明細行から部品パネルを開く確認

既存の交換部品明細行がある場合、その行から部品パネルを開く。

確認すること：

- 対象行の部品名が初期検索keywordになる
- 既存の部品候補選択・明細反映の動線が壊れていない
- 技術料行から部品検索パネルが開かない、または部品系ボタンが表示されない

### 6. standalone PartsSearchPanel確認

`/parts` を開く。

確認すること：

- standalone のPartsSearchPanelが表示される
- 検索欄が空の初期状態で表示される
- partType が従来どおり `all` 相当で動く
- 検索が従来どおり動く
- initial props 未指定で壊れていない

### 7. 型チェック・状態確認

以下を実行する。

```bash
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts
git status --short

可能なら以下も実行する。

npx.cmd tsc --noEmit

ただし、既存のPrisma型不一致・依存不足エラーがある場合は、今回変更由来かどうかを報告すること。

不具合があった場合

不具合があっても、今回は勝手に修正しない。

以下の形式で記録する。

不具合:
再現手順:
期待値:
実際:
推定原因:
次Task案:

例：

不具合:
PartsSearchPanelを開いても initialKeyword が入らない

再現手順:
1. /repairs/new を開く
2. 交換部品を選ぶ
3. 文字盤・針 → 秒針・6H を選ぶ
4. 部品パネルを開く

期待値:
検索欄に 秒針・6H が入っている

実際:
検索欄が空

推定原因:
PartsSearchPanel が初回mountされておらず、initialKeywordの初期値が反映されていない可能性

次Task案:
Task 014: PartsSearchPanelを開くタイミングでinitialKeywordを反映する
完了条件
画面確認結果が docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md に記録されている
コード変更をしていない
問題があれば次Task案に分解されている
問題がなければ、Task 010〜012 の画面確認完了として記録されている
git status --short で想定外の変更がない
Codexへの指示

まず以下を確認してください。

docs/ai-tasks/010-add-part-input-helper-ui.md
docs/ai-tasks/011-design-part-helper-selection-persistence.md
docs/ai-tasks/012-pass-helper-selection-to-parts-search-panel.md
src/components/repairs/RepairEntryForm.tsx
src/components/parts/PartsSearchPanel.tsx
src/lib/part-input-options.ts

今回は実装しないでください。
コード変更は禁止です。

可能ならローカルdev serverを起動し、画面で以下を確認してください。

/repairs/new
既存案件詳細画面 /repairs/[id]
/parts

確認結果をこの docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md の末尾に追記してください。

Codexの返答形式

以下の形式で返してください。

実施内容
確認対象画面
新規案件画面の確認結果
補助UIの選択動作確認結果
明細追加の確認結果
PartsSearchPanel初期検索確認結果
既存明細行からの部品パネル確認結果
standalone PartsSearchPanel確認結果
型チェック・git status
見つかった不具合
次Task案
変更ファイル
git status結果
カタリにレビューしてほしい点
Codex確認結果 2026-05-03

未記入。

---

## Codex確認結果 2026-05-06

### 実施内容

- `docs/ai-tasks/docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md` を確認。
- `docs/ai-tasks/010-add-part-input-helper-ui.md`、`011`、`012`、`src/components/repairs/RepairEntryForm.tsx`、`src/components/parts/PartsSearchPanel.tsx`、`src/lib/part-input-options.ts` を確認。
- Next dev server を `http://localhost:3000` で起動し、Playwrightで画面操作確認。
- 実装変更、コード変更、コミット、push は未実施。

### 確認対象画面

- `/repairs/new`
- 既存案件詳細画面 `/repairs/38`
- `/parts`

### 新規案件画面の確認結果

- `/repairs/new` はログイン後に表示できた。
- 初期状態で明細追加種別は `技術料`。
- 技術料選択時は、補助UIの `外装部品 / 内装部品`、`部品カテゴリ`、`部品名` select は表示されなかった。
- `交換部品` に切り替えると補助UIが表示された。
- UI表示は大きく崩れてはいなかった。

### 補助UIの選択動作確認結果

- `交換部品` 選択時、初期の部品種別は `外装部品`。
- 外装カテゴリは `ケース・風防`、`リューズ・チューブ`、`プッシャー`、`ベゼル`、`文字盤・針`、`ブレス・バンド`。
- `文字盤・針` を選択すると部品名候補が表示され、`秒針・6H` を選択できた。
- `秒針・6H` 選択後、既存の `作業名 / 部品名を入力...` 欄に `秒針・6H` が反映された。
- `内装部品` に切り替えるとカテゴリ候補が `動力・巻上`、`輪列`、`脱進機`、`調速機`、`針回し`、`カレンダー`、`自動巻`、`クロノグラフ`、`クォーツ`、`地板` に変わった。
- 内装/外装切替後、カテゴリと部品名はクリアされ、部品名selectはカテゴリ未選択のため disabled になった。

### 明細追加の確認結果

- `/repairs/new` で `交換部品`、`文字盤・針`、`秒針・6H` を選択後、追加ボタンで明細行を画面上に追加できた。
- 追加された明細行は `交換部品` として表示され、行の部品検索ボタンが表示された。
- 追加後、入力欄と補助UIの部品名選択はクリアされた。
- 保存は実行していない。

### PartsSearchPanel初期検索確認結果

- 新規案件画面で追加した `秒針・6H` の明細行から検索ダイアログを開き、`部品パネル` を開いた。
- PartsSearchPanel の部品名検索欄に `秒針・6H` が初期表示された。
- 補助UIで `外装部品` を選んだケースでは、PartsSearchPanel の `外装` タブが選択状態になった。

### 既存明細行からの部品パネル確認結果

- `/repairs/38` は既存明細として `ゼンマイ` の交換部品行がある。
- 初期の閲覧モードでは明細行の検索ボタンは fieldset disabled の影響でクリックできなかった。
- `編集する` を押して編集モードにすると、交換部品行の検索ボタンから検索ダイアログを開けた。
- 検索ダイアログの `部品パネル` から PartsSearchPanel を開くと、検索欄に `ゼンマイ` が初期表示された。
- 既存明細行から開いた場合、PartsSearchPanel の部品種別は `すべて` が選択状態だった。

### standalone PartsSearchPanel確認結果

- `/parts` は表示できた。
- standalone の PartsSearchPanel は表示され、検索欄は空の初期状態だった。
- 初期の部品種別は `すべて`。
- `内装`、`外装` ボタン、検索欄、検索ボタン、一覧表示が確認できた。
- initial props 未指定による破損は確認できなかった。

### 型チェック・git status

- `npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts`: 成功。
- `npx.cmd tsc --noEmit`: 成功。
- `git status --short`: `?? docs/ai-tasks/docs/`

### 見つかった不具合

不具合:
既存案件詳細画面の閲覧モードでは、交換部品行の検索ボタンが表示されているがクリックできない。

再現手順:
1. `/repairs/38` を開く。
2. `編集する` を押さずに、交換部品行の `🔍` をクリックする。

期待値:
閲覧モードで検索ボタンを表示するならクリックできる。クリック不可にする仕様なら、ボタンを非表示または disabled 表示にする。

実際:
ボタンは見えるが、fieldset disabled の影響でクリックできない。

推定原因:
詳細画面の閲覧モードでフォーム全体が disabled になっており、明細行の検索ボタンも同じ fieldset 配下にあるため。

次Task案:
Task 014: 既存案件詳細の閲覧モードで部品検索ボタンを使えるようにするか、表示条件を整理する。

不具合:
既存明細行から PartsSearchPanel を開いた場合、部品種別が `すべて` になる。

再現手順:
1. `/repairs/38` を開く。
2. `編集する` を押す。
3. 交換部品行 `ゼンマイ` の `🔍` から検索ダイアログを開く。
4. `部品パネル` を開く。

期待値:
既存明細行が外装/内装の情報を持つ場合、PartsSearchPanel の初期部品種別にも反映される。

実際:
検索欄には `ゼンマイ` が入るが、部品種別は `すべて`。

推定原因:
`initialPartType` が新規追加欄の `isAddingPartItem` を条件に渡されており、既存行の `category` や `partType` からは導出されていないため。

次Task案:
Task 015: 既存明細行の `category` / `partType` から PartsSearchPanel の initialPartType を導出する。

### 次Task案

- Task 014: 既存案件詳細の閲覧モードにおける部品検索ボタンの表示/操作仕様を整理する。
- Task 015: 既存明細行から PartsSearchPanel を開く場合の initialPartType 導出を追加する。

### 変更ファイル

- `docs/ai-tasks/docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md`

### git status結果

```text
?? docs/ai-tasks/docs/
```

### カタリにレビューしてほしい点

- `docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md` は存在せず、実在するファイルは `docs/ai-tasks/docs/ai-tasks/013-verify-part-helper-ui-and-search-panel.md` だった。このネスト配置を正とするか確認したい。
- 既存詳細の閲覧モードで部品検索を使えるべきか、編集モード限定でよいか確認したい。
- 既存明細行から開いた PartsSearchPanel の部品種別が `すべて` でよいか、明細行の外装/内装に合わせるべきか確認したい。
