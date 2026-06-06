# AI Task 098: B2C修理事例ギャラリーをPublicCaseへ接続

## 目的

`/cases/gallery` のB2C修理事例一覧を、静的 `repairCases` 配列からPublicCase読み込みへ切り替える。

今回はB2C一覧のみを対象とし、トップページ、`/cases/biz`、検索機能、詳細ページは変更しない。

## 前提

- FMP PublicCaseはローカルDBへreplace投入済み。
- DBプレビューで `brandDisplayName` 表示、B2C価格非表示、内部管理文言非表示を確認済み。
- 現在のローカルDBではPublicCaseは `HIDDEN / NEEDS_REVIEW` の検証状態で投入されている。
- 本来の公開条件は `PUBLISHED / APPROVED` を使う。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseに変換済み。
  - brand-kana-approvedで `brandDisplayName` / `searchText` 反映済み。
  - コピー含有Caseは除外済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseに変換する。
- PublicCase化後は、FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

## 変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/gallery/page.tsx`

## PublicCase取得条件

`src/lib/public-cases.ts` に `getB2CPublicCasesForGallery()` を追加した。

通常の取得条件:

- `b2cPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`
- `showPriceB2c = false`

ただし、現在のローカルDBは検証投入状態で全件 `HIDDEN / NEEDS_REVIEW` のため、localhost DBかつ公開済みが0件の場合のみ、開発確認用fallbackとしてFMP由来PublicCaseを取得する。

このfallbackは `DATABASE_URL` が `localhost` / `127.0.0.1` / `host.docker.internal` の場合だけ有効。

コピー含有Caseは生成時点で除外済みだが、取得後にも公開表示に使うフィールドを確認し、`コピー` を含むものは除外する。

## 表示項目

B2Cカードには以下を表示する。

- 写真枠
- ブランド表示名
- モデル名
- Ref / Cal
- 修理内容
- 詳しく見る

価格、技術料、交換部品価格、合計は表示しない。

## brandDisplayName表示ルール

ブランド表示は以下の優先順。

1. `brandDisplayName`
2. `brandName`
3. 空表示

`未確認（BRAND）` や `ブランド未確認` のようなfallbackは作らない。

## B2C価格非表示ルール

B2Cカードでは価格ブロックを描画しない。

HTML確認でも以下が表示されないことを確認した。

- `¥`
- `￥`
- `技術料`
- `showPriceB2b`
- `showPriceB2c`

## 内部管理文言の非表示

HTML確認で以下が表示されないことを確認した。

- `FMP`
- `sourceType`
- `sourceRepairId`
- `internal-1`
- `external-1`
- `UNLINKED`
- `NEEDS_REVIEW`
- `warning`
- `review`
- `未紐づけ部品`
- `価格は表示していません`
- `価格表示対象なし`
- `部品代`

## 画像なしケースの扱い

現時点でPublicCaseImageは0件。

画像がない場合は、写真枠を維持し、薄い背景とアイコンだけを表示する。強い注意文や管理用badgeは表示しない。

## 詳細リンクの扱い

PublicCase詳細ページはまだ未実装。

今回はカードの「詳しく見る」見た目を維持し、リンク先は一時的に `#` にした。詳細ページ実装は次タスク以降に回す。

## 件数・並び順

初期表示件数:

- 30件

並び順:

- `receivedDate desc`
- `id asc`

公開ページ初回接続として重くなりすぎないよう、まずは30件に制限した。

## 確認結果

確認URL:

```text
http://localhost:3000/cases/gallery
```

確認結果:

- HTTP 200 OK
- `オメガ（OMEGA）` 表示あり
- `ロレックス（ROLEX）` 表示あり
- `セイコー（SEIKO）` 表示あり
- `コピー` 表示なし
- `部品代` 表示なし
- `技術料` 表示なし
- `¥` / `￥` 表示なし
- 内部管理文言表示なし

`npx tsc --noEmit --pretty false --incremental false` は成功。

## 変更しなかったもの

- DB更新なし
- Supabase本番DB接続なし
- schema変更なし
- migration作成なし
- seed作成なし
- import script実行なし
- PublicCase再生成なし
- generated JSON / CSV本体変更なし
- トップページ `src/app/page.tsx` 変更なし
- `/cases/biz` 変更なし
- B2B認証変更なし
- 検索実装なし
- RepairEntryForm / PricingRule / 既存マスタ変更なし

## 次タスク案

- Task 099: PublicCase詳細ページの設計
- Task 100: `/cases/biz` をPublicCase読み込みへ接続
- Task 101: トップページ横スクロール事例をPublicCase読み込みへ接続
