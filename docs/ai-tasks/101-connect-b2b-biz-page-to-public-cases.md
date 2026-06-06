# AI Task 101: B2B業者向け価格事例ページをPublicCaseへ接続

## 目的

`/cases/biz` のB2B業者向け価格事例を、既存の `Repair.isPublicB2B = true` 読み込みからPublicCase読み込みへ切り替える。

## 前提

- `/cases/biz` は `b2b_session` cookie による簡易保護ページ。
- 今回はB2B一覧表示のみを対象にする。
- B2B詳細ページ、検索、トップページ、B2Cギャラリー、B2C詳細は触らない。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件はFMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、FMP由来か新アプリ由来かを閲覧者に見分けさせず、同じB2C/B2B公開ページ・同じカードUIで扱う。

## B2B認証の扱い

既存の `b2b_session` cookie 判定を維持した。

管理アプリログインとは切り分けたB2B公開用ページのまま。固定パスワードの簡易認証強化は今回対象外。

## 変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/biz/page.tsx`
- `docs/ai-tasks/101-connect-b2b-biz-page-to-public-cases.md`

## PublicCase取得条件

`getB2BPublicCasesForBizPage()` を追加した。

基本条件:

- `b2bPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`

ローカルDBでは検証投入データが公開状態ではないため、`localhost / 127.0.0.1 / host.docker.internal` のDB接続時のみ、`sourceType = FMP` のfallbackを使う。

コピー含有Caseは取得後に除外する。

## 表示項目

B2Bカードには以下を表示する。

- 写真枠
- ブランド表示名
- モデル名
- Ref / Cal
- 修理内容
- 技術料
- 交換部品
- 合計
- 詳しく見る

## brandDisplayName表示ルール

ブランド表示は以下の優先順。

1. `brandDisplayName`
2. `brandName`
3. 空表示

`未確認（BRAND）` のような表示名は作らない。

## B2B価格表示ルール

価格表示は明細単位で安全側に絞る。

- WorkItem: `showPriceB2b = true` かつ `laborPrice > 0`
- PartItem: `showPriceB2b = true` かつ `price > 0` かつ `relatedWorkItemId` がある
- 合計は表示対象になった技術料・交換部品価格だけで計算
- `showPriceB2c` は使わない
- 0円は表示しない
- 価格対象がない場合は `参考価格なし` を控えめに表示

## 交換部品ラベル

交換部品欄のラベルは `交換部品` にした。

`部品代` は使用しない。

## 内部管理文言の非表示

以下は表示しない。

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
- `showPriceB2b`
- `showPriceB2c`

## コピー除外確認

PublicCase生成時点でコピー含有Caseは除外済み。

B2B取得側でも、念のため表示対象文字列に `コピー` を含むCaseは除外する。

## 画像なしケースの扱い

PublicCaseImageは現時点で0件のため、画像がない場合はB2Cギャラリーと同等の写真枠プレースホルダーを表示する。

強い注意文や管理用badgeは出さない。

## 詳細リンクの扱い

B2B専用詳細ページは今回作成していない。

一覧カードでは `詳しく見る` の見た目だけを残し、実リンクはまだ付けていない。B2B価格詳細は次タスク以降で設計・実装する。

## 件数・並び順

表示件数は30件。

並び順は既存データで安定する `receivedDate desc`、`id asc`。

## 確認結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `http://localhost:3000/cases/biz`: `b2b_session=authenticated` でHTTP 200
- 表示カード数: 30
- `オメガ（OMEGA）` / `ロレックス（ROLEX）` / `セイコー（SEIKO）` 表示確認
- `交換部品` ラベル表示あり
- `部品代` 表示なし
- `コピー` 表示なし
- `sourceRepairId` 表示なし
- `internal-1` / `external-1` 表示なし
- `UNLINKED` / `NEEDS_REVIEW` 表示なし
- `showPriceB2b` / `showPriceB2c` 表示なし

## 変更しなかったもの

- DB更新
- schema変更
- migration作成
- seed作成
- PublicCase再生成
- import script実行
- generated JSON / CSV
- トップページ
- B2Cギャラリー
- B2C詳細
- 検索機能
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 102: B2B PublicCase詳細ページ設計・実装
- Task 103: B2C/B2B PublicCase検索導線設計
- Task 104: トップページ横スクロールの重複DOM改善
