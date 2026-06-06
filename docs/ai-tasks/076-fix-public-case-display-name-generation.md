# AI Task 076: PublicCase表示名生成ロジック修正

## 目的

FMP公開候補中間データの生成時点で、B2B/B2C表示名を公開確認に使える形へ整える。

プレビュー画面だけで `○○` や読み仮名を隠すのではなく、`public-case-candidates.json` と dry-run payload に入る表示名自体を補正する。

## 前提

- DB接続・DB更新は行わない
- migration / seed は作成しない
- `prisma/schema.prisma` は変更しない
- CSV / Excel の元データ本体は変更しない
- 既存公開ページには接続しない
- FMP公開候補JSONとdry-run payloadは再生成する

## 問題点

生成済み表示名に、以下のような公開表示に向かない文字列が残っていた。

- `針取付（3H）ハリトリツケ`
- `○○交換技術料コウカンギジュツリョウ`
- `○○交換技術料`
- `ムーブメント交換技術料コウカンギジュツリョウ`

これらは画面側のformatterで隠すのではなく、中間データ生成時点で補正する必要がある。

## 修正した表示名生成ロジック

`scripts/generate-fmp-public-case-candidates.ts` に、WorkItem生成後の表示名補正処理を追加した。

処理の流れは以下。

1. 既存ルールから `normalizedWorkName` / `b2bDisplayName` / `b2cDisplayName` の元になる表示名を取得
2. 読み仮名を削除
3. `○○` がある場合は同slotのPartItemで置換
4. 置換できない場合は `○○` を削除
5. B2B表示名を生成
6. B2C表示名は `技術料` と括弧補足を除去して短い作業名にする
7. 補正内容をWorkItemのメタ情報とwarningに残す

## 読み仮名削除ルール

以下の読み仮名を表示名から削除する。

- `ハリトリツケ`
- `コウカンギジュツリョウ`
- `シュウリ`
- `チョウセイ`
- `トリツケ`

削除した場合は `reading_kana_removed` warningを追加する。

## ○○プレースホルダーの扱い

`○○` は表示名に残さない。

- 同じsourceAreaかつ同じslotのPartItemがある場合、その部品名で `○○` を置換する
- 同slotの部品名がない場合、`○○` を削除して汎用名にする
- 置換した場合は `placeholder_resolved_with_part`
- 削除した場合は `placeholder_removed_without_part`

## PartItemとの関連付け

PartItem置換は同slotのみを対象にする。

例:

- `externalWorkItem sourceSlot = 1`
- `externalPartItem sourceSlot = 1`

この場合だけ、PartItemの `displayName` / `normalizedSourceText` を `○○` の置換に使う。

slotが一致しない部品名は無理に使わない。

## B2B表示名生成

B2Bでは `技術料` 表記を残す。

ただし、以下は残さない。

- `○○`
- 指定した読み仮名

例:

- `針取付（3H）ハリトリツケ` → `針取付（3H）`
- `○○交換技術料コウカンギジュツリョウ` + `ガラス` → `ガラス交換技術料`
- `○○交換技術料` + 部品名なし → `交換技術料`

## B2C表示名生成

B2Cでは一般向けの短い作業名にする。

- `技術料` を削除する
- `（3H）` などの括弧補足は削除する
- `○○` と指定読み仮名は残さない
- 安全なB2C表示名を作れない場合は `b2cDisplayName` を未設定にし、`b2c_display_name_missing` warningを追加する

例:

- `ガラス交換技術料` → `ガラス交換`
- `ゼンマイ交換技術料` → `ゼンマイ交換`
- `針取付（3H）` → `針取付`

## warning方針

追加したwarningは以下。

- `reading_kana_removed`: info
- `placeholder_resolved_with_part`: info
- `placeholder_removed_without_part`: review
- `b2c_display_name_missing`: review

dry-run側の `scripts/dry-run-import-fmp-public-cases.ts` でも同じwarning codeを分類できるようにした。

## 再生成したファイル

- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`
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

表示名補正warningを追加したため、warning総数は472件から1,106件に増えた。

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

- Task 077: 表示名補正warningの代表例レビュー
- Task 078: B2C公開候補に必要なモデル名・写真・作業名の不足一覧作成
- Task 079: FMP PublicCase本投入前の最終dry-runレビュー
