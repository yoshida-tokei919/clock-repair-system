# AI Task 082: PublicCaseカード内の重複表示整理

## 目的

`/dev/public-case-gallery-preview` のB2C/B2Bカード内で、同じ作業名や同じ情報が何度も表示されないようにする。

今回はPublicCase化後のカード表示UIだけを調整し、FMP変換ロジックや生成済みJSON本体は変更しない。

## 前提

- 対象は開発用プレビュー画面のみ
- DB接続・DB更新は行わない
- CSV / Excel / JSON本体は変更しない
- `scripts/generate-fmp-public-case-candidates.ts` は変更しない
- `scripts/dry-run-import-fmp-public-cases.ts` は変更しない
- B2Cでは価格を表示しない

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

ただし、PublicCase化後のB2C/B2B公開表示は同じページ・同じカードUIで扱う。

今回の修正はPublicCase化後のカード表示UIの調整であり、FMP専用の原文クリーニング、読み仮名削除、`○○` 補正、未紐づけPartItem救済には触れていない。

## 重複していた表示

B2Bカードで以下のように同じ作業名が繰り返されていた。

- カードタイトル: `ガラス交換技術料`
- 修理内容: `ガラス交換技術料`
- 技術料: `ガラス交換技術料 ¥1,500`

公開カードとしては情報が重く見えるため、表示用に省略する。

## 修理内容と技術料明細の重複省略ルール

技術料が1件だけで、修理内容と技術料明細名が同じ場合は、技術料欄では明細名を省略して金額だけ表示する。

例:

- 修理内容: `オーバーホール`
- 技術料: `¥12,000`

複数の技術料がある場合は、名前がないと分かりにくいため明細名を残す。

## B2B表示名の簡略化

B2Bカード表示用に、作業名から `技術料` を除いた短い名称を使う。

例:

- `ガラス交換技術料` → `ガラス交換`
- `オーバーホール技術料` → `オーバーホール`

これは画面表示だけの整理で、生成済みJSONやFMP変換ロジックは変更しない。

## 交換部品ラベル

B2Bカードでは引き続き `交換部品` ラベルを使う。

`部品代` というラベルは使わない。

## B2C表示への影響

B2Cカードでも、タイトルに作業名を使っている場合は、本文の作業内容欄で同じ作業名を繰り返さないようにした。

B2C価格非表示の方針は変更していない。

## 変更しなかったもの

- DB接続・DB更新
- migration / seed
- Supabase接続
- `prisma/schema.prisma`
- CSV / Excel / JSON本体
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/dry-run-import-fmp-public-cases.ts`
- 既存公開ページ
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 083: B2B/B2Cカードのスクリーンショット確認
- Task 084: PublicCase公開候補一覧UI設計
- Task 085: PublicCase本番公開ページ接続設計
