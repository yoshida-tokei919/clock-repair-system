# AI Task 089: 確認済みブランドカナマッピング作成

## 目的

ヨシダ確認済みのブランドカナレビュー結果から、後続のBrandMaster反映・PublicCase再生成で使える確定版ブランドカナマッピングを作成する。

今回は確定版CSV/JSONの作成のみを行い、DB schema変更、BrandMaster更新、PublicCase再生成、FMP import再実行は行わない。

## 前提

- 087でブランドカナ候補一覧を作成済み。
- 088でレビュー用一覧 `brand-kana-review.csv/json` を作成済み。
- ヨシダ確認済みの `brand-kana-review.xlsx` が存在するため、今回はExcel版を優先して入力に使った。
- `confirmedKana` が空欄の行は、カナなしでOKとして扱う。
- `confirmedBrandName` 列が存在し、値がある場合は正規ブランド名として使う。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP由来PublicCase生成時にブランドカナを付与する。
- 新アプリ通常Repair案件: ブランドマスタのカナ名からPublicCaseへスナップショットする。
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUI、同じブランド表示ルールで扱う。

ブランドカナはFMP専用の一時処理ではなく、将来的には共通ブランドマスタに持たせる情報として扱う。

## コピー表記を含む事例の扱い

ブランド名、モデル名、Ref、Cal、修理内容、交換部品名、公開表示名、検索用テキスト等に `コピー` を含む事例は、公開事例に掲載しない方針。

Task 089ではPublicCase再生成や除外処理は実装しない。ただし、`sourceBrandName` に `コピー` を含む行は、確定版マッピングの `note` に `掲載対象外: コピー表記` を追記した。

該当件数は3件。

## ブランドカナを持たせる場所の方針

将来的な持ち方は以下。

- `Brand` / `BrandMaster`: 正規の `kanaName` 相当
- `PublicCase`: 公開時点のスナップショットとして `brandName` / `brandNameKana`
- FMP PublicCase生成: `brand-kana-approved` を参照してブランドカナを付与
- 新アプリ通常Repair事例化: ブランドマスタからカナをスナップショット
- 検索: `sourceBrandName`、`approvedBrandName`、`approvedBrandNameKana`、表記ゆれaliasを検索対象に含める

## 入力ファイル

入力に使ったファイル:

- `docs/data/fmp/generated/brand-kana-review.xlsx`

Excel版とCSV版の両方が存在したため、ルールどおりExcel版を優先した。

## 作成したファイル

- `scripts/finalize-brand-kana-approved-list.ts`
- `docs/data/fmp/generated/brand-kana-approved.csv`
- `docs/data/fmp/generated/brand-kana-approved.json`
- `docs/ai-tasks/089-finalize-brand-kana-approved-list.md`

## 出力列定義

- `sourceBrandName`: 入力の `brandName`。元データ照合用のため修正しない。
- `approvedBrandName`: `confirmedBrandName` があればそれを使い、なければ `brandName` を使う。
- `approvedBrandNameKana`: `confirmedKana`。空欄はエラーではない。
- `approvedDisplayName`: 公開表示用ブランド名。
- `hasKana`: `approvedBrandNameKana` があれば `true`、なければ `false`。
- `sourceCount`: 入力の `sourceCount`。
- `reviewStatus`: 入力の `reviewStatus`。空欄の場合は `pending`。
- `note`: 入力の `note` を引き継ぎ、必要な補足を追記。

## confirmedKana 空欄の扱い

`confirmedKana` が空欄の行は、カナなしでOKとして扱った。

- エラー扱いしない。
- 無理に補完しない。
- `未確認（BRAND）` のような表示名を作らない。
- `approvedDisplayName` は `approvedBrandName` のみ。

## confirmedBrandName の扱い

`confirmedBrandName` 列が存在し、かつ値がある場合は `approvedBrandName` として使う。

今回の入力では、`confirmedBrandName` 使用件数は0件だった。

値がある場合は、`note` に `confirmedBrandName使用` を追記する実装にした。

## displayName生成ルール

`approvedBrandNameKana` がある場合:

- `approvedBrandNameKana（approvedBrandName）`
- 例: `オメガ（OMEGA）`

`approvedBrandNameKana` がない場合:

- `approvedBrandName`
- 例: `OHARA`

`未確認（BRAND）` は作成していない。

## バリデーション結果

スクリプト内で以下を確認し、すべて成功した。

- 総行数が入力ブランド数と一致する。
- `sourceBrandName` が空の行がない。
- `approvedBrandName` が空の行がない。
- `approvedBrandNameKana` 空欄はエラー扱いしない。
- `hasKana=true` の行は `approvedBrandNameKana` が入っている。
- `hasKana=false` の行は `approvedDisplayName = approvedBrandName`。
- `hasKana=true` の行は `approvedDisplayName = approvedBrandNameKana（approvedBrandName）`。
- `未確認（BRAND）` のような表示名を作っていない。

## 集計結果

- 総ブランド数: 305
- `hasKana=true`: 248
- `hasKana=false`: 57
- `confirmedBrandName` 使用件数: 0
- コピー表記を含むブランド件数: 3

## sourceCount上位20ブランド

| sourceBrandName | approvedBrandName | approvedBrandNameKana | sourceCount |
| --- | --- | --- | ---: |
| ROLEX | ROLEX | ロレックス | 435 |
| OMEGA | OMEGA | オメガ | 418 |
| SEIKO | SEIKO | セイコー | 328 |
| GAGAMILANO | GAGAMILANO | ガガミラノ | 176 |
| Tag Heuer | Tag Heuer | タグ・ホイヤー | 119 |
| CARTIER | CARTIER | カルティエ | 116 |
| GUCCI | GUCCI | グッチ | 74 |
| BVLGARI | BVLGARI | ブルガリ | 70 |
| LONGINES | LONGINES | ロンジン | 69 |
| CITIZEN | CITIZEN | シチズン | 68 |
| HERMES | HERMES | エルメス | 68 |
| CHANEL | CHANEL | シャネル | 46 |
| BREITLING | BREITLING | ブライトリング | 40 |
| TUDOR | TUDOR | チューダー | 37 |
| IWC | IWC | アイ・ダブリュー・シー | 35 |
| chopard | chopard | ショパール | 25 |
| CASIO | CASIO | カシオ | 24 |
| FRANCK MULLER | FRANCK MULLER | フランク・ミュラー | 24 |
| HAMILTON | HAMILTON | ハミルトン | 23 |
| AUDEMARS PIGUET | AUDEMARS PIGUET | オーデマ・ピゲ | 20 |

## カナなしのsourceCount上位20ブランド

| sourceBrandName | sourceCount |
| --- | ---: |
| OHARA | 2 |
| Vendome Aoyama | 2 |
| 掛時計 | 2 |
| AICHI | 1 |
| AIKOSHA | 1 |
| Bando | 1 |
| Blue Blue TOKYO | 1 |
| BMW | 1 |
| CERTUS | 1 |
| CITRON | 1 |
| DC | 1 |
| DOLCE GEAR | 1 |
| FREE MEN | 1 |
| Future Club | 1 |
| H&Co | 1 |
| HIS MASTERS VOICE | 1 |
| HUBLOTタイプ | 1 |
| J-AXIS | 1 |
| JEMIS | 1 |
| JENNIFER LOPEZ | 1 |

## 変更しなかったもの

- DB schemaは変更していない。
- migrationは作成していない。
- seedは作成していない。
- Supabase本番DBには接続していない。
- DB更新はしていない。
- FMP元CSV / Excel本体は変更していない。
- PublicCase再生成はしていない。
- FMP import再実行はしていない。
- `RepairEntryForm.tsx`、`PricingRule`、既存マスタは変更していない。

## 次タスク案

- Task 090: BrandMaster kanaName schema設計
- Task 091: PublicCase brandNameKana / searchText schema設計
- Task 092: FMP PublicCase再生成時のブランドカナ適用設計
