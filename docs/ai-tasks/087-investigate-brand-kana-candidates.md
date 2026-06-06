# AI Task 087: ブランドカナ候補一覧作成

## 目的

PublicCaseのB2C/B2B公開表示とフリーワード検索で、ブランド名を「カナ優先 + 英字併記」で扱えるようにするため、既存のFMP PublicCase候補データからブランド名ユニーク一覧を抽出し、レビュー用のカナ候補一覧を作成する。

今回は候補一覧の作成のみを行い、DB schema変更、DB反映、PublicCase再生成、FMP import再実行は行わない。

## 前提

- PublicCase系テーブルへのFMP過去案件投入はローカルDBで確認済み。
- ただし今回はDB読み込みではなく、生成済みの `public-case-candidates.json` を読み取り元にする。
- `public-case-candidates.json` は、FMP過去案件をPublicCase化する前段階の中間データであり、今回のブランドカナ候補作成に必要な `brandName` を含んでいる。
- CSV / Excel 元データ本体、生成済みPublicCase候補JSON本体は手編集しない。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP専用ルールでPublicCaseへ変換する。
- 新アプリ通常Repair案件: 構造化データ・マスタからPublicCaseへ変換する。
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUIで扱い、閲覧者には由来を見せない。

ブランドカナはFMP専用の一時処理ではなく、PublicCase化後の表示・検索で共通利用する情報として扱う。

## PublicCase化後の表示共通方針

公開事例カードでは、英字ブランドだけでなくカナ優先の表示を想定する。

例:

- `オメガ（OMEGA）`
- `ロレックス（ROLEX）`
- `セイコー（SEIKO）`
- `ガガミラノ（GAGAMILANO）`

検索でも `オメガ`、`ロレックス`、`セイコー` などのカナ入力に対応できるようにする。

## ブランドカナを持たせるべき場所

将来的には以下へ持たせる想定。

- `Brand` / `BrandMaster`: 正規の `brandNameKana` 相当
- `PublicCase`: 公開時点スナップショットとして `brandName` / `brandNameKana`
- `PublicCase.searchText`: ブランド英字、ブランドカナ、モデル、Ref、Cal、作業名を検索用にまとめる候補

今回はschema変更を行わず、レビュー用候補だけを作成した。

## 抽出元データ

抽出元は以下。

- `docs/data/fmp/generated/public-case-candidates.json`

理由:

- 最終的にPublicCaseへ反映する候補データと同じ粒度でブランド名を確認できる。
- ローカルDB接続を使わず、読み取り専用で処理できる。
- FMP元CSV / Excel本体を触らずに済む。

## 作成したファイル

- `scripts/generate-brand-kana-candidates.ts`
- `docs/data/fmp/generated/brand-kana-candidates.csv`
- `docs/data/fmp/generated/brand-kana-candidates.json`
- `docs/ai-tasks/087-investigate-brand-kana-candidates.md`

## CSV列定義

- `brandName`: 元のブランド名
- `brandNameKanaCandidate`: カナ候補
- `displayNameCandidate`: 公開表示候補。カナがある場合は `カナ（英字）`
- `confidence`: `high` / `medium` / `low` / `unknown`
- `sourceCount`: PublicCase候補内の出現件数
- `needsReview`: ヨシダ確認が必要か
- `note`: 一般表記、読み方要確認、表記ゆれ疑いなどの補足

## カナ候補作成ルール

有名ブランドで一般的な日本語表記が明確なものは `high` としてカナ候補を入れた。

例:

- `OMEGA` -> `オメガ`
- `ROLEX` -> `ロレックス`
- `SEIKO` -> `セイコー`
- `CITIZEN` -> `シチズン`
- `CASIO` -> `カシオ`
- `TAG HEUER` -> `タグ・ホイヤー`
- `BREITLING` -> `ブライトリング`
- `IWC` -> `アイ・ダブリュー・シー`
- `GAGAMILANO` -> `ガガミラノ`

読み方、スペル、ブランド名かどうかが怪しいものは無理に確定せず、カナ候補を空にして `unknown` / `needsReview=true` とした。

## 表示名ルール

カナ候補がある場合:

- `オメガ（OMEGA）`
- `ロレックス（ROLEX）`

カナ候補が未確定の場合:

- `未確認（BRAND）`

これにより、レビュー時にカナ未設定のブランドを見つけやすくした。

## ユニークブランド数

305件。

## confidence集計

- `high`: 45件
- `medium`: 1件
- `low`: 3件
- `unknown`: 256件

## needsReview集計

- `needsReview=true`: 277件

`high` のブランドでも、同一ブランドの表記ゆれ疑いがある場合は `needsReview=true` とした。

## sourceCount上位ブランド

| brandName | sourceCount | kana | confidence |
| --- | ---: | --- | --- |
| ROLEX | 435 | ロレックス | high |
| OMEGA | 418 | オメガ | high |
| SEIKO | 328 | セイコー | high |
| GAGAMILANO | 176 | ガガミラノ | high |
| Tag Heuer | 119 | タグ・ホイヤー | high |
| CARTIER | 116 | カルティエ | high |
| GUCCI | 74 | グッチ | high |
| BVLGARI | 70 | ブルガリ | high |
| LONGINES | 69 | ロンジン | high |
| CITIZEN | 68 | シチズン | high |

## 表記ゆれ疑い

検出した主な表記ゆれ疑い:

- `ROLEX` / `ROLEX(コピー）`
- `SEIKO` / `SEIKO 懐中時計` / `SEIKO 掛時計`
- `Tag Heuer` / `tag Heuer`
- `CITIZEN` / `CITIZEN 置時計`
- `CHANEL` / `CHANEL(コピー）`
- `BREITLING` / `BREITLING(コピー）`
- `HUBLOT` / `HUBLOTタイプ`
- `G-SHOCK` / `GーSHOCK`
- `alain silberstein` / `ALAIN SILBERSTEIN`
- `agnis b` / `agnis b 懐中時計`

また、以下はスペース違い疑いとして `needsReview=true` にした。

- `PATEK  PHILIPPE`
- `JAEGER  LECOULTRE`
- `kate  spade`

## 変更しなかったもの

- DB schemaは変更していない。
- migrationは作成していない。
- seedは作成していない。
- Supabase本番DBには接続していない。
- DB更新はしていない。
- FMP元CSV / Excel本体は変更していない。
- `public-case-candidates.json` など既存生成済みPublicCase候補本体は手編集していない。
- PublicCase再生成、FMP import再実行はしていない。
- `RepairEntryForm.tsx`、`PricingRule`、既存マスタは変更していない。

## 次タスク案

- Task 088: ブランドカナ候補レビュー結果の反映方針設計
- Task 089: Brand / PublicCaseのブランドカナschema設計
- Task 090: PublicCase検索テキスト設計
