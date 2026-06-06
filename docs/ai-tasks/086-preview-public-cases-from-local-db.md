# AI Task 086: ローカルDB PublicCaseプレビュー

## 目的

ローカルDBに投入済みのPublicCase系テーブルを読み込み、PublicCase化後のB2C/B2B共通カードUIで表示確認する。

既存のJSONベース `/dev/public-case-gallery-preview` は残し、DB読み込み用の開発プレビューを別URLで作成する。

## 前提

- Supabase本番DBへ接続しない
- `.env.local` のlocalhost DBを使う
- DB更新は行わない
- migration / seed / API追加は行わない
- CSV / Excel / JSON本体は変更しない
- 既存公開ページ `/cases/gallery` / `/cases/biz` は変更しない

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP専用ルールでPublicCaseに変換し、import scriptでPublicCase系テーブルへ投入済み
- 新アプリ通常Repair案件: 将来、構造化データ・マスタからPublicCaseに変換する
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUIで扱う

今回のページは、PublicCase化後のDBデータを共通カードUIで確認するための開発用プレビュー。

## 参照したDBモデル

- `PublicCase`
- `PublicCaseWorkItem`
- `PublicCasePartItem`
- `PublicCaseWarning`
- `PublicCaseImage`

画像は現時点で0件のため、写真枠はプレースホルダー表示。

## DB接続安全方針

ページ内で `DATABASE_URL` を確認し、以下のいずれかを含まない場合はDB読み込みを停止する。

- `localhost`
- `127.0.0.1`
- `host.docker.internal`

remote DBに見える場合はエラー表示にする。

## 件数サマリー

ページ上部に以下を表示する。

- PublicCase総数
- WorkItem
- PartItem
- Warning
- Image
- B2C公開候補
- B2C要確認
- B2B価格事例

HTTP確認時に以下を確認した。

- `2924` が表示される
- `1353` が表示される

## B2C表示ルール

B2Cでは価格を表示しない。

表示するもの:

- 写真枠
- ブランド
- モデル
- Ref / Cal
- 修理内容
- 詳しく見る

## B2B表示ルール

B2BもB2Cと同じカード型で表示する。

追加表示:

- 技術料
- 交換部品
- 合計

価格表示は以下の安全ルールを維持する。

- `showPriceB2b = true` かつ正の金額だけ表示
- `showPriceB2b = false` は価格非表示
- 0円は表示しない
- 未紐づけPartItemの価格は表示しない
- 合計は表示対象価格だけで計算

## 内部文言の非表示

HTTP確認時に以下が表示されていないことを確認した。

- `未紐づけ部品`
- `価格は表示していません`
- `UNLINKED`
- `NEEDS_REVIEW`
- `sourceRepairId`
- `internal-1`
- `external-1`
- `価格表示対象なし`
- `部品代`

また、`交換部品` ラベルが表示されることを確認した。

## 変更しなかったもの

- DB更新
- migration
- schema
- seed
- API
- 既存公開ページ
- CSV / Excel / JSON本体
- `scripts/generate-fmp-public-case-candidates.ts`
- `scripts/dry-run-import-fmp-public-cases.ts`
- `scripts/import-fmp-public-cases.ts`
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 087: DB版PublicCaseプレビューの表示内容レビュー
- Task 088: PublicCase公開候補一覧UI設計
- Task 089: PublicCase本番公開ページ接続設計
