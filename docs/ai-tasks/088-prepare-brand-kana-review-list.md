# AI Task 088: ブランドカナレビュー用一覧作成

## 目的

087で作成したブランドカナ候補一覧を、人間が確認・修正しやすいレビュー用一覧へ整形する。

`unknown` が256件あり、そのまま全件確認するには多いため、頻出ブランド・有名ブランドについては可能な範囲で `suggestedKana` を補完し、`confirmedKana` を初期入力した。

今回はレビュー用ファイルの作成のみを行い、DB schema変更、BrandMaster更新、PublicCase再生成、FMP import再実行は行わない。

## 前提

- 入力は087で作成済みのブランドカナ候補一覧。
- PublicCase化後の表示では、B2C/B2B共通でブランドカナを使う想定。
- 今回作るファイルはヨシダ確認用であり、正規マスタへの反映は次タスク以降で行う。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP由来PublicCase生成時にブランドカナを付与する。
- 新アプリ通常Repair案件: ブランドマスタのカナ名からPublicCaseへスナップショットする。
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUI、同じブランド表示ルールで扱う。

ブランドカナはFMP専用の一時処理ではなく、将来的には共通ブランドマスタに持たせる情報として整理する。

## ブランドカナを持たせる場所の方針

将来的な持ち方は以下。

- `Brand` / `BrandMaster`: 正規の `kanaName` 相当
- `PublicCase`: 公開時点のスナップショットとして `brandName` / `brandNameKana`
- FMP PublicCase生成: FMPブランド名からカナを付与
- 新アプリ通常Repair事例化: ブランドマスタからカナをスナップショット
- 検索: `brandNameKana` を `searchText` へ含める

## 入力ファイル

- `docs/data/fmp/generated/brand-kana-candidates.csv`
- `docs/data/fmp/generated/brand-kana-candidates.json`

実処理ではJSONを読み取り元にした。CSVはレビュー用として開く用途が主であり、JSONの方が型付きで安全に処理できるため。

## 作成したレビュー用ファイル

- `scripts/prepare-brand-kana-review-list.ts`
- `docs/data/fmp/generated/brand-kana-review.csv`
- `docs/data/fmp/generated/brand-kana-review.json`
- `docs/ai-tasks/088-prepare-brand-kana-review-list.md`

## CSV列定義

- `brandName`: 元のブランド名
- `currentKanaCandidate`: 087時点の候補
- `suggestedKana`: 088で追加補完した候補
- `confirmedKana`: ヨシダ確認・修正用の最終入力列
- `displayNameCandidate`: カナ優先 + 英字併記の表示候補
- `sourceCount`: PublicCase候補内の出現件数
- `confidence`: 087時点の信頼度
- `needsReview`: 確認が必要か
- `reviewPriority`: `high` / `medium` / `low`
- `reviewStatus`: 初期値は `pending`
- `note`: 読み方要確認、表記ゆれ疑い、補完理由など

## カナ候補補完ルール

087で `currentKanaCandidate` が空だったブランドのうち、一般的な日本語表記が比較的明確なものだけ `suggestedKana` を補完した。

補完例:

- `BULOVA` -> `ブローバ`
- `BREGUET` -> `ブレゲ`
- `ORIENT` -> `オリエント`
- `PIAGET` -> `ピアジェ`
- `G-SHOCK` / `GーSHOCK` -> `ジーショック`
- `ZENITH` -> `ゼニス`
- `GIRARD PERREGAUX` -> `ジラール・ペルゴ`
- `MAURICE LACROIX` -> `モーリス・ラクロア`
- `VAN CLEEF＆ARPELS` -> `ヴァン クリーフ＆アーペル`

推測が怪しいもの、ブランド名ではなく時計種別やメモが混ざっていそうなものは、無理に補完せず空欄または確認推奨にした。

## 並び順

レビューしやすいように以下の順で並べた。

1. `needsReview=true`
2. `reviewPriority=high`
3. `sourceCount desc`
4. `brandName asc`
5. `needsReview=false` は下部

`reviewPriority` の判断基準:

- `high`: `needsReview=true` かつ `sourceCount >= 10`
- `medium`: `needsReview=true` かつ `sourceCount >= 3`
- `low`: 上記以外、または `needsReview=false`

## 集計結果

- 総ブランド数: 305
- `confirmedKana` 初期値あり: 119
- `confirmedKana` 空欄: 186
- `needsReview=true`: 277
- `reviewPriority=high`: 9
- `reviewPriority=medium`: 54
- `reviewPriority=low`: 242
- 表記ゆれ疑い件数: 24

## sourceCount上位20ブランド

| brandName | sourceCount | confirmedKana | needsReview | reviewPriority |
| --- | ---: | --- | --- | --- |
| ROLEX | 435 | ロレックス | true | high |
| OMEGA | 418 | オメガ | false | low |
| SEIKO | 328 | セイコー | true | high |
| GAGAMILANO | 176 | ガガミラノ | false | low |
| Tag Heuer | 119 | タグ・ホイヤー | true | high |
| CARTIER | 116 | カルティエ | false | low |
| GUCCI | 74 | グッチ | false | low |
| BVLGARI | 70 | ブルガリ | false | low |
| LONGINES | 69 | ロンジン | false | low |
| CITIZEN | 68 | シチズン | true | high |
| HERMES | 68 | エルメス | false | low |
| CHANEL | 46 | シャネル | true | high |
| BREITLING | 40 | ブライトリング | true | high |
| TUDOR | 37 | チューダー | false | low |
| IWC | 35 | アイ・ダブリュー・シー | false | low |
| chopard | 25 | ショパール | false | low |
| CASIO | 24 | カシオ | false | low |
| FRANCK MULLER | 24 | フランク・ミュラー | false | low |
| HAMILTON | 23 | ハミルトン | false | low |
| AUDEMARS PIGUET | 20 | オーデマ・ピゲ | false | low |

## 表記ゆれ疑い

表記ゆれ疑いは24件。

主な例:

- `ROLEX` / `ROLEX(コピー）`
- `SEIKO` / `SEIKO 懐中時計` / `SEIKO 掛時計`
- `Tag Heuer` / `tag Heuer`
- `CITIZEN` / `CITIZEN 置時計`
- `CHANEL` / `CHANEL(コピー）`
- `BREITLING` / `BREITLING(コピー）`
- `HUBLOT` / `HUBLOTタイプ`
- `G-SHOCK` / `GーSHOCK`
- `PATEK  PHILIPPE`
- `JAEGER  LECOULTRE`

今回は統合作業は行わず、`note` に残してレビュー対象にした。

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

- Task 089: ブランドカナレビュー結果の確定フォーマット設計
- Task 090: BrandMaster kanaName schema設計
- Task 091: PublicCase brandNameKana / searchText設計
