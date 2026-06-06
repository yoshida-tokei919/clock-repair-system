# AI Task 074: PublicCaseギャラリープレビュー表示改善

## 目的

`/dev/public-case-gallery-preview` を、公開事例ページとして実際に使えそうな見た目に近づける。

今回は開発用プレビュー画面のみを調整し、DB接続、DB更新、migration、seed、Supabase接続、API、本番公開ページ接続、`prisma/schema.prisma` 変更、CSV / Excel / JSON本体変更は行わない。

## 前提

- 表示元はTask 069のdry-run sample payload。
- 既存 `/cases/gallery` と `/cases/biz` は直接変更しない。
- B2Cでは価格を絶対に表示しない。
- B2Bでは `showPriceB2b = true` かつ金額が正の明細だけ価格表示する。
- unlinked PartItemは要確認扱いにするが、価格は表示しない。

## 参考にした表示方向

- B2Cは時計修理サイトの修理事例一覧のように、写真枠、ブランド、モデル、作業内容を中心にしたカード型。
- B2Bは業者向け価格事例として、技術料、部品代、合計が分かる価格表型。
- デザインは丸コピーせず、既存自サイト `/cases/gallery` の白背景、薄い境界線、軽い影、ブランドbadgeのトーンに寄せた。

## 修正したB2Cカード表示

表示するもの:

- 写真枠
- 写真がない場合の `時計写真準備中` プレースホルダー
- ブランドbadge
- モデル名
- `Ref.` / `Cal.` の補足
- 1〜2行の作業名
- `詳しく見る` ボタン風表示
- 小さな `要確認` badge

B2Cで作業名として安全に使えない場合は、主表示を `修理内容確認中` にした。

モデル名がない場合は `モデル情報なし` とし、強すぎない色で表示する。

## 修正したB2B価格カード表示

B2Bは価格表風に整理した。

表示するもの:

- ブランド
- モデル
- Ref
- Cal
- 修理内容・費用
- 技術料明細
- 部品代明細
- 合計
- warning / 要確認表示

価格表示対象がない場合は `価格表示対象なし` と表示し、技術料 `¥0`、部品代 `¥0`、合計 `¥0` は表示しない。

合計は `showPriceB2b = true` かつ正の金額を持つ明細だけで計算する。

## 非表示にした内部向け文言

B2C側では以下を出さないようにした。

- `sample内に表示対象なし`
- `表示対象の作業明細なし`
- `作業内容未設定`
- `価格表示対象なし`
- `APPROVED`
- `NEEDS_REVIEW`
- `internal-1`
- `external-1`
- `sourceRepairId`
- warning詳細文
- 技術料、部品代、合計、価格

B2B側でも内部状態文字列をそのまま出さず、必要な情報は `要確認`、`未紐づけ部品` など短い日本語にした。

## 要確認判定

プレビュー用に以下の判定を追加した。

- `containsPlaceholderText`: `○○`、`作業内容未設定`、`表示対象の作業明細なし` などを含む
- `containsReadingKana`: カタカナ読み仮名混入の疑い
- `containsTechnicalFeeForB2C`: B2C表示名に `技術料` を含む
- `noDisplayableWorkItems`: B2C向けに安全な作業名がない
- `noDisplayableParts`: 表示できる部品がない
- `noPhoto`: sampleに写真がない
- `unlinkedPartItem`: WorkItemに紐づかない部品がある

B2Cで以下に該当する作業名は主表示に使わない。

- `技術料` を含む
- `○○` を含む
- `コウカンギジュツリョウ`
- `ハリトリツケ`
- `トリツケ`
- `シュウリ`
- `チョウセイ`
- 空文字
- `作業内容未設定`
- `表示対象の作業明細なし`
- `sample内に表示対象なし`
- 読み仮名混入の疑い

該当する場合は `修理内容確認中` とし、小さく `要確認` badgeを表示する。

## 価格表示ルール

B2C:

- 価格は表示しない。
- `laborPrice`、`price`、`totalAmount` をB2Cカードで描画しない。

B2B:

- WorkItemは `showPriceB2b = true` かつ `laborPrice > 0` の場合だけ表示。
- PartItemは `showPriceB2b = true` かつ `price > 0` の場合だけ表示。
- unlinked PartItemは価格非表示。
- 表示対象がない場合は `価格表示対象なし`。
- `¥0` の技術料、部品代、合計は表示しない。

## 変更しなかったもの

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

## 次タスク案

- Task 075: 外装表示名クリーニング対象の抽出
- Task 076: B2B表示金額とPublicCase.totalAmountの扱い整理
- Task 077: FMP PublicCase import script実装
