# AI Task 073: 既存ギャラリー風PublicCase sampleプレビュー

## 目的

既存公開サイトにある修理事例ギャラリー、修理事例を探す導線、業者様向け価格事例を調査し、FMP PublicCase sample JSONを既存ギャラリーに近い見た目で確認できる開発用プレビュー画面を作成する。

今回はDB接続、DB更新、migration、seed、Supabase接続、API実装、本番公開ページ接続は行わない。

## 前提

- 既存公開ページの本番表示は変更しない。
- `prisma/schema.prisma` は変更しない。
- CSV / Excel / JSON本体は変更しない。
- 既存Repair画面、RepairEntryForm、PricingRuleには触らない。
- 表示元はTask 069のdry-run sample payload。
- B2Cでは価格を表示しない。
- B2Bでは `showPriceB2b = true` の明細だけ価格表示する。

## 調査した既存ページ / コンポーネント

### 修理事例ギャラリー

- `src/app/cases/gallery/page.tsx`
- URL: `/cases/gallery`

特徴:

- 静的な `repairCases` 配列をページ内に持つ。
- 専用カードコンポーネントはなく、ページ内で直接カードを描画している。
- カードは `rounded-xl`、白背景、border、shadow、hoverで少し浮く見た目。
- 画像は `aspect-[4/3]` の上部に表示。
- ブランドbadge、症状badge、モデル名、修理内容、説明文を表示。

### 修理事例を探す導線

- `src/app/page.tsx`

確認した導線:

- トップページに `修理事例を探す` セクションがある。
- `recentRepairCases` 配列を使った横スクロールカードがある。
- CTAは `/cases/gallery` への `修理事例を検索する`。
- Hero内にも `/cases/gallery` への `修理事例を検索する` リンクがある。

### 業者様向け価格事例

- `src/app/cases/biz/page.tsx`
- URL: `/cases/biz`

特徴:

- `cookies().get("b2b_session")` を確認し、未認証なら `/cases/biz/login` へredirect。
- `prisma.repair.findMany` で既存Repairから `isPublicB2B = true` の事例を取得している。
- 表示はテーブル形式。
- ブランド、モデル/Ref、作業内容、修理金額、納期目安、詳細リンクを表示。
- DB接続があるため、今回の開発用プレビューでは再利用しない。

### 公開サイト共通layout

- `src/app/cases/layout.tsx`

特徴:

- 公開用ヘッダーに `/cases/gallery` と `/cases/biz` への導線がある。
- Footerにも修理事例と業者様向け情報への導線がある。

## 既存カードとFMP sampleの対応関係

| 既存ギャラリー項目 | FMP PublicCase sample |
| --- | --- |
| brand | `PublicCasePayload.brandName` |
| model | `modelName` / `ref` / `caliber` |
| repair | `WorkItemPayload.b2cDisplayName` または `b2bDisplayName` |
| symptom badge | warning有無、または要確認表示 |
| image | sampleに画像なし。プレースホルダー |
| note | WorkItem / PartItemの概要 |

| 既存B2B価格事例項目 | FMP PublicCase sample |
| --- | --- |
| ブランド | `brandName` |
| モデル / Ref | `modelName` / `ref` |
| 作業内容 | `WorkItemPayload.b2bDisplayName` |
| 修理金額 | `showPriceB2b = true` の技術料 + 部品代 |
| 納期目安 | sampleに無いため表示しない |
| 詳細リンク | 開発用のボタン風表示のみ |

## 作成した画面

- `src/app/(app)/dev/public-case-gallery-preview/page.tsx`

URL:

```txt
http://localhost:3000/dev/public-case-gallery-preview
```

既存公開ページには接続せず、`(app)/dev` 配下の開発用ページとして追加した。

## 実装内容

- `fs.readFileSync` でdry-run sample JSONを読み込む。
- Prisma Clientはimportしない。
- Supabase clientはimportしない。
- API routeは作らない。
- `tempPublicCaseKey` でCase / WorkItem / PartItem / Warningを結合する。
- 既存B2Cギャラリーに近いカードグリッドを表示する。
- 既存B2B価格事例に近い価格カードを表示する。

読み込むsample:

- `public-case-payload.sample.json`
- `work-item-payload.sample.json`
- `part-item-payload.sample.json`
- `warning-payload.sample.json`

## B2C表示

B2Cカードの表示:

- ブランド
- モデル名 / REF / Cal
- 作業名
- 交換部品
- 写真なしプレースホルダー
- 「詳しく見る」ボタン風表示

価格表示:

- `laborPrice` を表示しない。
- `price` を表示しない。
- `totalAmount` を表示しない。
- B2Cカード内に金額フォーマット処理を置かない。

## B2B表示

B2Bカードの表示:

- ブランド
- モデル名 / REF / Cal
- 作業名
- 技術料
- 部品代
- 合計
- warning
- 要確認の未紐づけ部品

価格表示:

- WorkItemは `showPriceB2b = true` の明細だけ技術料を表示。
- PartItemは `showPriceB2b = true` の明細だけ部品代を表示。
- `showPriceB2b = false` の明細は価格表示対象から外す。
- B2B合計は表示許可された技術料・部品代だけで計算する。

## unlinked PartItemの扱い

unlinked PartItemは以下のように扱う。

- B2Bカードに `要確認の未紐づけ部品` 件数を表示。
- 価格は表示しない。
- 合計にも含めない。

これにより、Task 064 / 070で確認した `part_without_publishable_work` の誤表示を避ける。

## 既存ギャラリーに寄せた点

- 公開ページ風のヘッダーをページ内に再現。
- `REPAIR CASES` のeyebrowと中央寄せ見出しを採用。
- 既存ギャラリーと同じ `rounded-xl`、border、white card、shadow、hover浮きのカード雰囲気。
- 画像領域は `aspect-[4/3]` にして、写真なしプレースホルダーを配置。
- ブランドbadgeと要確認badgeを表示。
- B2Bは既存 `/cases/biz` の価格事例に近く、ブランド・モデル・作業・価格を確認できる構成にした。

## 変更していないもの

- `src/app/cases/gallery/page.tsx`
- `src/app/cases/biz/page.tsx`
- `src/app/cases/layout.tsx`
- `src/app/page.tsx`
- `prisma/schema.prisma`
- CSV / Excel / JSON本体
- 既存Repair画面
- RepairEntryForm
- PricingRule

## 確認結果

```powershell
npx tsc --noEmit --pretty false --incremental false
```

結果:

- 成功

dev server:

- `http://localhost:3000/dev/public-case-gallery-preview` がHTTP 200を返すことを確認。

## 注意点

- 既存B2BページはDB接続を含むため、今回のpreviewでは再利用していない。
- sample JSONには実データ断片が含まれるため、外部公開時は注意が必要。
- 既存ギャラリーの文言や画像を完全再利用するのではなく、見た目の方向性だけを寄せた。
- 本番公開ページにはまだ接続していない。

## 次タスク案

- Task 074: 外装表示名クリーニング対象の抽出
- Task 075: B2B表示金額とPublicCase.totalAmountの扱い整理
- Task 076: FMP PublicCase import script実装
