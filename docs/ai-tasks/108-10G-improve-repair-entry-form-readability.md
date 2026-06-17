# AI Task 108-10G: RepairEntryForm の視認性改善・共有コメント欄の整理

## 目的

実画面確認で見えた範囲に限定し、RepairEntryForm の作業明細・構造化作業入力欄を読みやすくする。

今回の対象は以下のみ。

- 共有ページコメント欄を横幅いっぱいで常時大きく表示しない
- 見積・修理明細エリアの文字と入力欄を見やすくする
- 構造化作業入力欄を見やすくする
- 余白を少し整理する

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/108-10G-improve-repair-entry-form-readability.md`

## 実画面で見えた課題

- 全体的に文字が小さく、明細行の内容や金額が読みづらい。
- 見積・修理明細の入力欄が小さく、クリック・入力しづらい。
- 構造化作業入力欄の select / input が小さく、4列固定で窮屈。
- 共有ページコメント欄が常時大きく表示され、明細エリアを下に押し下げていた。

## 共有コメント欄の整理内容

共有ページコメント欄は、初期状態では1行要約として表示する形に変更した。

表示例:

```txt
共有ページコメント 0件 [開く]
```

未読コメントがある場合は、未読件数も表示する。

コメント一覧、返信入力欄、返信ボタン、文字数表示は削除せず、開いた時に従来通り使える状態を維持した。

## 作業明細エリアの視認性改善内容

見積・修理明細エリアでは、主に Tailwind class の調整のみ行った。

- 見出しを `text-xs` から `text-sm` 相当に拡大
- 合計表示を少し大きくし、余白を確保
- 明細ヘッダーを `text-xs` に拡大
- 明細行を `text-sm` に拡大
- 技術料 / 交換部品バッジを押しやすく調整
- 仕入値、上代、数量の入力欄を `h-8` / `text-sm` 相当に拡大
- 入力行の select / input / button を `h-9` / `text-sm` 相当に拡大

通常Repair明細の意味は変更していない。

```txt
技術料    オーバーホール
交換部品  ゼンマイ
```

の分離は維持し、`ゼンマイ交換` のような集約表示にはしていない。

## 構造化作業入力欄の視認性改善内容

技術料行だけに表示される構造化作業入力欄を、以下の形へ整理した。

PC幅:

```txt
作業カテゴリ / 対象部品 / 処置
detail
```

スマホ幅:

```txt
作業カテゴリ
対象部品
処置
detail
```

変更内容:

- 4列固定をやめ、`md:grid-cols-3` に変更
- `detail` は `md:col-span-3` で横幅いっぱいに変更
- 各項目に小さいラベルを表示
- select / input を `h-9` / `text-sm` 相当に拡大
- placeholderだけに依存しない見た目に変更

## ステータスバーを変更していないこと

ステータスバーは現状維持。

削除、折りたたみ、コンパクト化、表示順変更は行っていない。

## PartsMaster / getPartsMatched / PartsSearchPanel を変更していないこと

以下は変更していない。

- PartsMaster検索ロジック
- `getPartsMatched`
- `PartsSearchPanel`
- 部品候補表示仕様
- partsMasterId の扱い
- 部品パネルの検索仕様

交換部品行は従来通り PartsMaster / partsMasterId 系の導線を使う。

## partsMasterId と targetPartNameId を混同していないこと

今回の変更では、以下の区別を維持している。

```txt
targetPartNameId
→ 技術料行の「作業対象部品」
→ PartNameMaster由来

partsMasterId
→ 交換部品行の「実際に使う部品」
→ PartsMaster由来
→ 部品検索・在庫・発注と関係する
```

構造化作業入力欄は技術料行だけに表示される。交換部品行では表示しない。

## 変更していないもの

- schema
- migration
- seed
- DB
- API route
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- EstimateItem schema
- PricingRule検索ロジック
- PricingRule.suggestedWorkName
- RepairLineItem保存仕様
- relatedWorkLineItemId
- PartsMaster検索ロジック
- getPartsMatched
- PartsSearchPanel
- partsMasterId の扱い
- targetPartNameId の保存仕様
- ステータスバー

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

`npx prisma generate` は初回、既存の `npm run dev` / `next dev` プロセスが Prisma Client をロックしていたため `EPERM` になった。該当するローカルdev serverプロセスのみ停止後、再実行して成功した。

dev serverは以下で起動した。

```powershell
npm run dev -- -p 3011
```

確認結果:

- `Test-NetConnection localhost -Port 3011`: `TcpTestSucceeded: True`
- `http://localhost:3011/repairs/new`: HTTP 307（ログインリダイレクト）

ログイン後の実画面目視確認は未実施。

## 未確認点

- ログイン後の実ブラウザ上での最終的な高さ・折り返し
- 既存案件詳細で、コメント件数ありの場合の見え方
- モバイル幅での明細入力欄の横スクロール/折り返し

## 次Task案

- Task 108-10H: 構造化作業入力欄のUX確認と、カテゴリ選択による対象部品絞り込み設計
- Task 108-10I: RepairLineItem保存payloadへ構造化作業フィールドを安全に通す確認
