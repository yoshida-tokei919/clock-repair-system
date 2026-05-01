# AI Task 001: 技術料明細では部品検索サイトボタンを非表示にする

## 目的

見積・修理明細のうち、技術料行には「部品検索サイトを開くボタン」を表示しないようにする。

現在、技術料明細にも部品検索用のボタンが表示されている可能性がある。
このボタンは交換部品行にだけ必要であり、技術料行には不要。

## ブランチ

feature/hide-parts-search-button-on-labor-items

## 触ってよい範囲

- src/components/repairs/RepairEntryForm.tsx

## 触ってはいけない範囲

- prisma/schema.prisma
- src/app/api/repairs/route.ts
- src/app/api/repairs/[id]/route.ts
- src/actions/document-actions.ts
- 検索ロジック本体
- 保存ロジック
- API routes
- DB schema
- UI全体の大改修

## 実装要件

- 見積・修理明細の部品検索サイトボタンは、item.type === 'part' の場合だけ表示する。
- item.type === 'labor' の場合は非表示にする。
- 既存の item.category / partType / その他の表示条件がある場合は、既存条件を壊さずに item.type === 'part' を追加するだけにする。
- 交換部品行には今まで通りボタンを表示する。
- 技術料行には表示しない。
- ボタンのクリック処理、検索ワード生成、保存処理は変更しない。
- 不要なリファクタリングは禁止。

## 想定される修正方針

src/components/repairs/RepairEntryForm.tsx 内で、部品検索サイトを開くボタンを描画している箇所を探す。

既存の表示条件がある場合は、最小差分で item.type === 'part' を追加する。

例：

- 既存条件だけで表示している場合  
  → item.type === 'part' && 既存条件 にする

- 条件なしで常に表示している場合  
  → item.type === 'part' の条件付き表示にする

ボタンの onClick 処理、検索ワード生成処理、保存処理は変更しない。

ただし、広範囲の構造変更はしないこと。

## 完了条件

- 技術料行に「部品検索サイトを開くボタン」が表示されない。
- 交換部品行には従来通り表示される。
- 検索ロジックは変わっていない。
- 保存ロジックは変わっていない。
- unrelated file を変更していない。
- npx tsc --noEmit が通る。

## 確認コマンド

npx tsc --noEmit

可能なら、画面上でも以下を確認する。

- 新規案件画面または既存案件詳細画面を開く
- 技術料明細を追加または表示する
- 技術料行に部品検索ボタンが出ていないことを確認
- 交換部品行には部品検索ボタンが出ていることを確認

## Codexへの指示

まず src/components/repairs/RepairEntryForm.tsx を確認してください。

部品検索サイトを開くボタンの描画箇所を特定し、表示条件に item.type === 'part' を追加してください。

次のことは禁止です。

- 保存処理の変更
- API route の変更
- Prisma schema の変更
- 検索ワード生成ロジックの変更
- UI全体の作り替え
- unrelated file の変更
- ついでのリファクタリング

実装後、変更内容を最小限にまとめて報告してください。

## Codexの返答形式

以下の形式で返してください。

### 実施内容

### 変更ファイル

### 触っていない重要ファイル

### 確認コマンド

### 未対応・注意点

### カタリにレビューしてほしい点

## Codex実装結果 2026-05-01

未記入。