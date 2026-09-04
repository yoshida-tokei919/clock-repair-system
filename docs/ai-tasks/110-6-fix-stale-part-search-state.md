# 110-6 部品Web検索の対象明細変更時 stale state 修正

## 目的

部品Web検索で別明細へ切り替えた時に、前明細の検索候補や keyword が残る不具合を最小差分で修正する。

## 原因

`PartsSearchPanel` は `keyword` / `calNumber` / `refKeyword` / 標準部品フィルタを初回 props から `useState` で初期化していたが、対象明細が変わっても同期していなかった。

また、`RepairEntryForm` からパネルへ渡す `initialKeyword` / `initialPartNameEn` が、既存明細を開いている場合でも追加フォーム側の `selectedPartNameOption` を参照できる状態だったため、直前に選んだ部品名・英語名が新しい明細の検索 context に混ざる可能性があった。

## 修正内容

- 既存明細を対象にした部品パネルでは、対象 `LineItem` の `name` を `initialKeyword` として優先する。
- `initialPartNameEn` も対象 `LineItem` 由来の値を優先し、追加フォーム側の選択値を既存明細へ流用しない。
- 部品追加時・PartsMaster選択時に、検索用の任意 snapshot として `partNameEn` を `LineItem` に保持する。
- `PartsSearchPanel` に `targetKey` を追加し、対象明細キーが変わった時だけ以下を初期値へ同期する。
  - `partType`
  - `keyword`
  - `calNumber`
  - `refKeyword`
  - 標準カテゴリ / 標準部品名フィルタ
  - グレード / 仕入先フィルタ
  - 検索結果候補
- 対象明細変更前に走っていた検索レスポンスが後から戻っても、古い候補を再表示しないよう検索リクエストを世代管理する。

## 変更しないこと

- 検索語生成ルール
- alias / fallback
- site profile
- localStorage schema
- partRef保存API
- Prisma schema / migration
- PROVISIONAL / VERIFIED
- PublicCase / PricingRule / QR / スケジュール

## 確認観点

- internal ゼンマイから exterior リューズへ切り替えると、`keyword` と Web検索 context がリューズ明細へ同期する。
- exterior リューズから internal ゼンマイへ切り替えると、`keyword` と Web検索 context がゼンマイ明細へ同期する。
- 同じ明細内での manual keyword 編集は、対象キーが変わらない限り不要にリセットされない。
- `PartsWebSearchPanel` は `PartsSearchPanel` から渡る新しい `partName` / `partNameEn` / `partType` / `partRef` を受けて既存の同期処理で追従する。

