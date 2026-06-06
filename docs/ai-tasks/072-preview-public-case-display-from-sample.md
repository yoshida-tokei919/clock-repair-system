# AI Task 072: sample JSONによるPublicCase表示プレビュー

## 目的

DB投入前に、生成済みsample JSONを使ってPublicCaseのB2C/B2B表示イメージを確認できる開発用プレビュー画面を作成する。

今回はDB接続、DB更新、migration、seed、API、UI本実装、`prisma/schema.prisma` 変更、CSV / Excel / JSON本体変更は行わない。

## 前提

- 表示元はTask 069で生成したdry-run sample payload。
- DB、Prisma Client、Supabase、API routeは使わない。
- 既存Repair画面、RepairEntryForm、PricingRuleには触らない。
- B2Cでは価格を絶対に表示しない。
- B2Bでは `showPriceB2b = true` の明細だけ価格表示する。
- unlinked PartItemは要確認として表示するが価格は表示しない。
- 写真はsampleにないため、写真なしプレースホルダーを表示する。

## 参照ファイル

- `docs/ai-tasks/069-dry-run-import-fmp-public-cases.md`
- `docs/ai-tasks/070-review-fmp-public-case-dry-run-payload.md`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`

## 作成した画面

- `src/app/(app)/dev/public-case-preview/page.tsx`

URL:

```txt
http://localhost:3000/dev/public-case-preview
```

既存の `(app)` route group 配下に、開発用の独立ページとして追加した。

## 実装方針

- server componentで `fs.readFileSync` によりsample JSONを読む。
- Prisma Clientはimportしない。
- Supabase clientはimportしない。
- API routeは作らない。
- sample payloadの `tempPublicCaseKey` でCase / WorkItem / PartItem / Warningを結合する。
- 実DB IDの代わりに `relatedWorkItemTempKey` を表示判定に使う。

## 表示内容

### 一覧

- ブランド
- モデル
- REF
- Cal
- B2C表示プレビュー
- B2B表示プレビュー
- warning有無
- reviewStatus
- sourceRepairId

warningがあるCaseは一覧行を薄い警告色で表示する。

### 詳細カード

同じCaseについて、B2C / B2Bを並べて表示する。

B2C:

- ブランド
- モデル
- REF
- Cal
- 作業内容
- 交換部品
- 写真なし表示
- 価格は表示しない

B2B:

- ブランド
- モデル
- REF
- Cal
- 作業内容
- 技術料
- 部品代
- 合計
- warning
- review対象表示

## B2C価格非表示確認

B2Cカードでは価格フィールドを参照・描画していない。

- 作業内容は `b2cDisplayName` を優先
- 交換部品は `displayName` のみ表示
- `laborPrice` / `price` / `totalAmount` はB2Cカードで表示しない

これにより、sample payload内に価格値が存在してもB2C表示には出ない。

## B2B価格表示確認

B2Bカードでは以下の条件だけ価格を表示する。

```txt
WorkItem: showPriceB2b = true の場合だけ laborPrice を表示
PartItem: showPriceB2b = true の場合だけ price を表示
```

`showPriceB2b = false` の明細は `非表示` と表示する。

B2B合計は、表示許可されたWorkItem / PartItemだけを合算する。

## unlinked PartItemの扱い

unlinked PartItemは以下のように表示する。

- `relationStatus = UNLINKED`
- `reviewStatus = NEEDS_REVIEW`
- `要確認`
- 価格は `非表示`

未紐づけ部品の価格がB2B合計に混ざらないよう、`showPriceB2b = true` のPartItemだけを合算している。

## warning表示

Warning payloadを `tempPublicCaseKey` でCaseに紐づけて表示する。

- 一覧ではwarning件数を表示
- 詳細B2Bカードでは `severity` / `code` / `target` を表示
- warningがあるCaseは目立つ背景色にする

## 確認結果

```powershell
npx tsc --noEmit --pretty false --incremental false
```

結果:

- 成功

dev server:

- `npm run dev -- -p 3000` を起動
- `http://localhost:3000/dev/public-case-preview` がHTTP 200を返すことを確認

補足:

- Playwrightによるヘッドレスブラウザ確認は、サンドボックス内で `spawn EPERM` となったため実施できなかった。
- HTTP 200とTypeScriptチェックでページ生成は確認済み。

## 変更していないもの

- DB接続なし
- DB更新なし
- migration作成なし
- seed作成なし
- API実装なし
- Supabase接続なし
- `prisma/schema.prisma` 変更なし
- CSV / Excel / JSON本体変更なし
- 既存Repair画面変更なし
- RepairEntryForm変更なし
- PricingRule変更なし

## 次タスク案

- Task 073: B2B表示金額とPublicCase.totalAmountの扱い整理
- Task 074: 外装表示名クリーニング対象の抽出
- Task 075: FMP PublicCase import script実装
