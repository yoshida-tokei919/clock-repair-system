# AI Task 096: DBプレビューでbrandDisplayNameを使う

## 目的

ローカルDBを参照する `/dev/public-case-db-preview` のB2C/B2Bカードで、PublicCaseの `brandDisplayName` を優先して表示する。

これにより、英字のみの `OMEGA` / `ROLEX` / `SEIKO` ではなく、`オメガ（OMEGA）` / `ロレックス（ROLEX）` / `セイコー（SEIKO）` のようなカナ優先表示を確認できるようにする。

## 前提

- Task 095でFMP PublicCaseはローカルDBへreplace投入済み。
- DB上には `brandDisplayName` / `brandNameKana` / `searchText` が投入済み。
- 今回はDB更新・PublicCase再生成・import再実行は行わない。
- 既存公開ページ `/cases/gallery` / `/cases/biz` は変更しない。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、PublicCase生成前にbrand-kana-approved、コピー除外、FMP専用クリーニングを適用する。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseを生成する。
- PublicCase化後は、FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

今回の修正はPublicCase化後のDBプレビューUIだけに限定した。

## 変更した表示ルール

ブランド表示の優先順を以下に変更した。

1. `brandDisplayName`
2. `brandName`
3. 空表示

実装:

```ts
const brand = text(item.brandDisplayName) || text(item.brandName);
```

`WATCH` や `未確認（BRAND）` のような強いfallbackは出さない。

## B2C表示への影響

B2Cカードでも同じブランド表示ルールを使う。

価格、技術料、交換部品価格、合計、sourceRepairId、内部キー、warning詳細、FMP由来表示は引き続き表示しない。

## B2B表示への影響

B2Bカードでも同じブランド表示ルールを使う。

価格表示ルールは変更していない。

- `showPriceB2b = true` かつ正の金額だけ表示
- B2C価格は表示しない
- ラベルは引き続き `交換部品`
- `部品代` は使わない

## ブランド名なしCaseの扱い

ブランド名自体が空のCaseでは、ブランド欄は空表示になる。

`未確認（BRAND）` や `ブランド未確認` のような表示名は作らない。カード内ではモデル名・Ref・Cal・修理内容が補助的に表示される前提。

## 内部文言の非表示維持

HTML確認で以下が表示されないことを確認した。

- `部品代`
- `未紐づけ部品`
- `価格は表示していません`
- `UNLINKED`
- `NEEDS_REVIEW`
- `sourceRepairId`
- `internal-1`
- `external-1`
- `価格表示対象なし`

## コピー除外確認

HTML確認で `コピー` が表示されないことを確認した。

## 変更しなかったもの

- DB更新なし
- import script実行なし
- PublicCase再生成なし
- generated JSON / CSV本体変更なし
- schema変更なし
- migration作成なし
- seed作成なし
- 検索実装なし
- 既存公開ページ変更なし
- RepairEntryForm / PricingRule / 既存マスタ変更なし

## 次タスク案

- Task 097: DBプレビューでbrandDisplayName反映後のスクリーンショット確認
- Task 098: PublicCase本番反映前のmigration整理方針確認
- Task 099: 公開ページへのPublicCase接続設計
