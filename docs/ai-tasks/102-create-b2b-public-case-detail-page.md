# AI Task 102: B2B PublicCase詳細ページ作成

## 目的

B2B向けPublicCase詳細ページを作成し、`/cases/biz` の「詳しく見る」から遷移できるようにする。

## 前提

- `/cases/biz` はTask 101でPublicCase読み込みへ切り替え済み。
- 今回はB2B詳細ページのみを対象にする。
- トップページ、B2Cギャラリー、B2C詳細、検索、PublicCase生成/import処理は触らない。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件はFMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、FMP由来か新アプリ由来かを閲覧者に見分けさせず、同じB2C/B2B公開ページ・同じカードUIで扱う。

## B2B認証の扱い

B2B詳細ページも既存の `b2b_session` cookie で保護した。

未認証時は `/cases/biz/login` へリダイレクトする。管理アプリログインや認証強化は今回対象外。

## 作成・変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/biz/page.tsx`
- `src/app/cases/biz/[id]/page.tsx`
- `docs/ai-tasks/102-create-b2b-public-case-detail-page.md`

## 詳細ページURL方針

URLは `/cases/biz/[id]`。

現時点ではSEO slugを作らず、PublicCaseの `id` を使う。

## PublicCase取得条件

`getB2BPublicCaseDetail(id)` を追加した。

基本条件:

- `b2bPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`

ローカルDBでは検証投入データが公開状態ではないため、`localhost / 127.0.0.1 / host.docker.internal` のDB接続時のみ、`sourceType = FMP` のfallbackを使う。

コピー含有Caseは取得後に除外し、該当時は `notFound()` にする。

## 表示項目

B2B詳細では以下を表示する。

- 写真枠
- ブランド表示名
- モデル名
- Ref / Cal
- 修理内容
- 技術料
- 交換部品
- 合計
- 業者様向け価格事例一覧へ戻るリンク

## brandDisplayName表示ルール

ブランド表示は以下の優先順。

1. `brandDisplayName`
2. `brandName`
3. 空表示

`未確認（BRAND）` や `ブランド未確認` は表示しない。

## B2B価格表示ルール

価格表示は明細単位で安全側に絞る。

- WorkItem: `showPriceB2b = true` かつ `laborPrice > 0`
- PartItem: `showPriceB2b = true` かつ `price > 0` かつ `relatedWorkItemId` がある
- `showPriceB2c` は使わない
- 0円、未紐づけPartItem価格、内部価格は表示しない

## 技術料欄の表示

表示対象のWorkItemだけを技術料欄へ出す。

修理内容と技術料名が同じで1件だけの場合は、技術料欄では名前を省略して価格だけを表示できるようにした。

## 交換部品ラベル

交換部品欄のラベルは `交換部品`。

`部品代` は使わない。

## 合計計算

合計は、表示対象になったWorkItemの `laborPrice` と、表示対象になったPartItemの `price` だけで計算する。

非表示価格、0円、未紐づけPartItem価格は含めない。

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

B2B詳細取得側でも、表示対象文字列に `コピー` を含むCaseは除外する。

## 画像なしケースの扱い

PublicCaseImageは現時点で0件のため、画像がない場合は写真枠プレースホルダーを表示する。

強い注意文や管理用badgeは出さない。

## 一覧側リンク変更

`/cases/biz/page.tsx` の「詳しく見る」を `/cases/biz/[id]` へのリンクに変更した。

## notFound / 未認証時の扱い

- 対象PublicCaseが存在しない場合: `notFound()`
- B2B公開条件に合わず、ローカルfallback対象でもない場合: `notFound()`
- コピー含有Case: `notFound()`
- `b2b_session` がない場合: `/cases/biz/login` へリダイレクト

## 確認結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `/cases/biz`: `b2b_session=authenticated` でHTTP 200
- 一覧の詳細リンク数: 30
- `/cases/biz/3496`: HTTP 200
- `/cases/biz/5824`: `オメガ（OMEGA）` 表示確認
- `/cases/biz/5837`: `ロレックス（ROLEX）` 表示確認
- `/cases/biz/5838`: `セイコー（SEIKO）` 表示確認
- `交換部品` ラベル表示確認
- `部品代` 表示なし
- `コピー` 表示なし
- `sourceRepairId` 表示なし
- `internal-1` / `external-1` 表示なし
- `UNLINKED` / `NEEDS_REVIEW` 表示なし
- `showPriceB2b` / `showPriceB2c` 表示なし
- 未認証時は `/cases/biz/login` へ307リダイレクト

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

- Task 103: B2C/B2B PublicCase検索導線設計
- Task 104: トップページ横スクロールの重複DOM改善
- Task 105: PublicCase画像追加フロー設計
