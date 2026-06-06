# AI Task 105: B2Cギャラリーにブランド絞り込みを追加

## 目的

`/cases/gallery` にB2C向けブランド絞り込みを追加する。

今回はB2Cギャラリーの `brand` 絞り込みのみを対象にし、B2B、トップページ、詳細ページ、カテゴリドリルダウン、検索API新設、DB/schema変更は行わない。

## 前提

- `/cases/gallery` はPublicCase読み込み済み。
- Task 104で `/cases/gallery?q=...` のキーワード検索を追加済み。
- PublicCaseには `brandName` / `brandDisplayName` / `brandNameKana` / `searchText` が入っている。
- コピー含有Caseは生成時点で除外済み。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、同じB2C/B2B公開ページ、同じカードUI、同じ検索思想で扱う。
- ブランド絞り込みでも、FMP由来かWEB_APP由来かを閲覧者に見分けさせない。

## 変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/gallery/page.tsx`
- `docs/ai-tasks/105-add-b2c-gallery-brand-filter.md`

## ブランド絞り込みUI

`/cases/gallery` の検索フォーム内に `select name="brand"` を追加した。

表示内容:

- `すべてのブランド`
- PublicCaseから取得したブランド候補

ブランド候補のラベルは `brandDisplayName -> brandName` の優先順。

## URL / query parameter 方針

初期実装は以下の2つ。

- `q`
- `brand`

例:

- `/cases/gallery?brand=OMEGA`
- `/cases/gallery?brand=ROLEX`
- `/cases/gallery?brand=SEIKO`
- `/cases/gallery?q=オーバーホール&brand=OMEGA`

フォーム送信時に、qとbrandの両方がURLに残る。

クリア導線は全クリアとして `/cases/gallery` へ戻す。

## PublicCase取得条件

通常条件:

- `b2cPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`
- `showPriceB2c = false`

ローカルDB検証時のみ、公開済み0件の場合に既存方針と同じFMP fallbackを使う。

- `sourceType = FMP`
- `showPriceB2c = false`

本番remoteではfallbackしない。

## brand絞り込み条件

`brand` パラメータはPublicCase上の `brandName` と完全一致で絞り込む。

例:

- `brand=OMEGA` -> `brandName = OMEGA`
- `brand=ROLEX` -> `brandName = ROLEX`
- `brand=SEIKO` -> `brandName = SEIKO`

brandNameが空のCaseはブランド候補から除外する。

## qとの併用

qとbrandが両方ある場合はAND条件。

例:

`/cases/gallery?q=オーバーホール&brand=OMEGA`

意味:

- B2C公開対象
- かつ `brandName = OMEGA`
- かつ `searchText` 等に `オーバーホール` を含む

## ブランド候補の取得方法

B2C公開対象PublicCaseからブランド候補を取得し、ローカルDBでは既存と同じFMP fallbackを使う。

候補生成:

- value: `brandName`
- label: `brandDisplayName -> brandName`
- `brandName` 空欄は除外
- コピー含有Caseは除外
- 同一 `brandName` は集約

並び順:

1. caseCount desc
2. label asc

候補数集計のため、最大5000件を取得してブランド候補へ集約する。

## 0件時表示

Task 104の0件表示を流用した。

```text
該当する修理事例はまだ掲載されていません。
LINEで写真を送ってご相談ください。
```

## 表示ルール維持

ブランド絞り込み結果でも既存のB2C表示ルールを維持した。

- `brandDisplayName -> brandName -> 空表示`
- B2C価格は表示しない
- 内部管理文言は表示しない
- 画像なしは写真枠プレースホルダー
- 「詳しく見る」は `/cases/gallery/[id]`

## コピー除外確認

PublicCase生成時点でコピー含有Caseは除外済み。

B2C取得側でも `containsCopyKeyword` による除外を維持している。

## 確認結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功

画面確認:

- `/cases/gallery?brand=OMEGA`: HTTP 200、カード30件、カード内ブランドは `オメガ（OMEGA）` のみ
- `/cases/gallery?brand=ROLEX`: HTTP 200、カード30件、カード内ブランドは `ロレックス（ROLEX）` のみ
- `/cases/gallery?brand=SEIKO`: HTTP 200、カード30件、カード内ブランドは `セイコー（SEIKO）` のみ
- `/cases/gallery?q=オーバーホール&brand=OMEGA`: HTTP 200、カード30件、カード内ブランドは `オメガ（OMEGA）` のみ

UI確認:

- ブランドselect表示あり
- ブランド候補に `オメガ（OMEGA）` / `ロレックス（ROLEX）` / `セイコー（SEIKO）` あり
- 選択中ブランドがselectに保持される
- qがinputに保持される
- `/cases/gallery/[id]` への詳細リンクあり

非表示確認:

- `¥` / `￥` 表示なし
- `部品代` 表示なし
- `コピー` 表示なし
- `sourceRepairId` 表示なし
- `internal-1` / `external-1` 表示なし
- `UNLINKED` / `NEEDS_REVIEW` 表示なし
- `showPriceB2b` / `showPriceB2c` 表示なし

## 変更しなかったもの

- DB更新
- Supabase本番DB接続
- schema変更
- migration作成
- seed作成
- import script実行
- PublicCase再生成
- generated JSON / CSV
- トップページ
- `/cases/gallery/[id]`
- `/cases/biz`
- `/cases/biz/[id]`
- B2B認証
- 検索API新設
- カテゴリドリルダウン
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 106: B2B `/cases/biz?q=` キーワード検索の最小実装
- Task 107: B2Cカテゴリドリルダウン設計
- Task 108: トップページ横スクロールの重複DOM改善
