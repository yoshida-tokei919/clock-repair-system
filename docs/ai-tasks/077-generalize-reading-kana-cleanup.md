# AI Task 077: 読み仮名混入クリーニングの一般化

## 目的

FMP由来の表示名に混入している読み仮名を、個別語の列挙だけに依存せず、末尾のカタカナsuffixとして検出・監査できるようにする。

## 問題点

Task 076の実装では、`ハリトリツケ`、`コウカンギジュツリョウ` など、明示した語だけを削除していた。

このままだと新しい読み仮名が見つかるたびにリストへ追加する必要があり、約3000件を個別確認する運用になってしまう。

## 修正したロジック

`scripts/generate-fmp-public-case-candidates.ts` の表示名生成処理に、読み仮名っぽい末尾カタカナsuffix検出を追加した。

検出条件は以下。

- 表示名の末尾に3文字以上の連続カタカナがある
- その前に漢字・ひらがな・英数字・括弧付き表記などがある
- 既知読み仮名、または読み仮名らしいsuffix patternに一致する場合は自動削除
- 未知suffixは削除せず `katakana_suffix_review` warningにする
- 保護対象の自然なカタカナ語は削除しない

## 既知読み仮名削除

既知語リストは残しつつ、一般化suffix検出の補助として扱う。

自動削除した読み仮名は `reading_kana_removed` warningとして残す。

## 未知カタカナsuffix検出

未知suffixは自動削除せず、`katakana_suffix_review` warningにする。

これにより、削りすぎによる表示名破壊を避けながら、次回レビュー対象として集計できる。

## 消してはいけないカタカナ語

以下は部品名・作業名として自然なカタカナ語として保護する。

- ガラス
- リューズ
- パッキン
- ブレス
- ケース
- ベゼル
- インデックス
- コイル
- ローター
- クロノグラフ
- カレンダー
- ムーブメント

## 自動削除した読み仮名一覧

監査結果では、自動削除は402件だった。

ユニーク一覧:

- コウカンギジュツリョウ: 277
- ハリトリツケ: 44
- シュウリ: 31
- トリツケ: 24
- ブヒンメイギジュツリョウ: 13
- ハリチッコウトソウ: 7
- ビョウシンセイサクギジュツリョウ: 2
- カコウギジュツリョウ: 1
- チクコウトソウ: 1
- チョウシンセイサクギジュツリョウ: 1
- ヨウセツギジュツリョウ: 1

## review扱いにした候補

未知カタカナsuffix候補は14種類、review扱いは235件だった。

候補一覧:

- ボウスイケンサ: 66
- レイトツ: 45
- オコマキシンジョキョ: 38
- モジバンセッチャク: 20
- ベルトゼンスウ: 17
- シュウセイ: 14
- フウボウケンマ: 11
- セイサク: 10
- カシメ: 6
- ケンマ: 2
- メッキ: 2
- リダン: 2
- イチバン: 1
- オーバーホール: 1

## 再生成したファイル

- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`
- `docs/data/fmp/generated/public-case-display-name-cleanup-audit.json`
- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`

## 件数確認

再生成後の主要件数は以下。

- 公開候補Case件数: 2,924
- 内装候補明細: 2,624
- 外装候補明細: 711
- 内装のみ: 2,245
- 外装のみ: 477
- 内外装両方: 202
- dry-run importBlocked: false
- critical warning: 0
- errors: 0
- warning総数: 1,348

warning総数は、読み仮名suffixの自動削除・review候補を追加したため増加した。

## プレビュー確認

`/dev/public-case-gallery-preview` はHTTP 200で応答した。

プレビューHTML上で以下が残っていないことを確認した。

- `ハリトリツケ`
- `ハリチッコウトソウ`
- `コウカンギジュツリョウ`
- `○○`

B2C表示名については、生成JSON上で `技術料`、`○○`、指定読み仮名が残っていないことを確認した。

## 変更しなかったもの

- DB接続・DB更新
- migration / seed
- Supabase接続
- `prisma/schema.prisma`
- CSV / Excel元データ本体
- 既存公開ページ
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 078: `katakana_suffix_review` 候補の公開表示方針レビュー
- Task 079: B2C公開候補に必要なモデル名・写真・作業名の不足一覧作成
- Task 080: FMP PublicCase本投入前の最終dry-runレビュー
