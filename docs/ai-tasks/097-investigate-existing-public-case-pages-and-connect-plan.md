# AI Task 097: 既存公開事例ページの調査とPublicCase接続設計

## 目的

既存の公開導線であるトップページ、B2C修理事例ギャラリー、B2B業者向け価格事例を調査し、PublicCase系テーブルへどのように接続するかを設計する。

今回は調査・設計のみで、公開ページ本体、検索、DB、schema、生成物は変更しない。

## 前提

- FMP PublicCaseはローカルDBへreplace投入済み。
- DBプレビューでは `brandDisplayName` を使った表示確認済み。
- 現在のPublicCaseは公開ページ接続前の検証段階。
- 現在のimportでは `b2bPublishStatus` / `b2cPublishStatus` は `HIDDEN` のため、本番公開前には公開状態を上げるレビュー手順が必要。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseへ変換済み。
  - brand-kana-approvedを使って `brandDisplayName` / `searchText` を付与。
  - コピー含有Caseは除外済み。
  - 読み仮名suffix削除やプレースホルダー補正などはFMP専用の救済処理。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
  - FMP専用クリーニングには依存しない。
- PublicCase化後は、FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

## 現在の公開導線

調査したファイル:

- `src/app/page.tsx`
- `src/app/cases/layout.tsx`
- `src/app/cases/gallery/page.tsx`
- `src/app/cases/biz/page.tsx`
- `src/app/cases/biz/layout.tsx`
- `src/app/cases/biz/login/page.tsx`
- `src/actions/auth-actions.ts`
- `src/actions/repair-actions.ts`
- `src/app/(app)/dev/public-case-db-preview/page.tsx`
- `src/app/(app)/dev/public-case-gallery-preview/page.tsx`
- `prisma/schema.prisma`

公開導線は、トップページから `/cases/gallery` と `/cases/biz` へリンクしている。`/cases/layout.tsx` でも同じ2導線をナビゲーションとして出している。

## トップページ事例セクションの調査

`src/app/page.tsx` に `recentRepairCases` という静的配列があり、トップページの横スクロール修理事例カードを描画している。

現在の表示項目:

- brand
- model
- repair
- image
- alt
- href

接続方針:

- 次の実装では、トップページをServer ComponentとしてPublicCaseを数件取得するか、事例セクションを別Server Componentへ切り出す。
- 表示対象は `b2cPublishStatus = PUBLISHED` を基本にする。
- 初期は `receivedDate desc` または `updatedAt desc` の直近数件でよい。
- 将来的には `publicTags` や手動おすすめフラグを追加しておすすめ順を検討する。
- B2Cトップでは価格を絶対に出さない。

## /cases/gallery の調査

`src/app/cases/gallery/page.tsx` は、現在 `repairCases` 静的配列をカード表示している。

現在の表示項目:

- brand
- model
- repair
- symptom
- image
- note

DBやPublicCaseはまだ読んでいない。

接続方針:

- `prisma.publicCase.findMany` でB2C公開対象を取得する。
- 条件は `b2cPublishStatus = PUBLISHED`、`reviewStatus = APPROVED` を基本にする。
- `showPriceB2c` は常にfalseで扱い、価格関連の表示は実装しない。
- `brandDisplayName -> brandName -> 空` の表示ルールを使う。
- 作業内容は `workItems.b2cDisplayName` を優先し、なければ公開カード用fallbackを使う。
- 写真は `images` が0件でも成立するよう、既存DBプレビューと同じ写真枠・プレースホルダーを使う。

## /cases/biz の調査

`src/app/cases/biz/page.tsx` は、現在 `b2b_session` cookieを確認し、認証済みなら `prisma.repair.findMany` で `Repair.isPublicB2B = true` の通常Repairを表示している。

現在の表示はテーブル形式で、主な項目は以下。

- Repair.watch.brand
- Repair.watch.model
- Repair.watch.reference
- Repair.publicTitle / workSummary
- Estimate technicalFee + partsTotal
- delivery日数

PublicCaseはまだ読んでいない。

接続方針:

- B2B価格事例もRepair直読みではなくPublicCase読み込みへ寄せる。
- 条件は `b2bPublishStatus = PUBLISHED`、`reviewStatus = APPROVED` を基本にする。
- `showPriceB2b = true` かつ正の金額のWorkItem / PartItemだけ価格表示する。
- PartItemのラベルは `交換部品` を使い、`部品代` は使わない。
- 未紐づけPartItemやreview/warning等の内部管理文言は公開カードには表示しない。
- 表示形式はDBプレビューで確認済みのB2C共通カードUIに寄せる。B2Bだけ管理画面風のテーブルへ戻さない。

## B2B認証・セッションの調査

既存のB2B認証:

- `src/app/cases/biz/page.tsx`
  - `cookies().get("b2b_session")`
  - valueが `authenticated` でなければ `/cases/biz/login` へredirect
- `src/app/cases/biz/login/page.tsx`
  - password入力フォーム
  - `setB2BSession` を呼ぶ
- `src/actions/auth-actions.ts`
  - passwordが `"2024"` の場合、`b2b_session=authenticated` cookieを30日で発行

設計判断:

- 管理アプリログインとは別のB2B公開用セッションとして既に分離されている。
- ただし現状は固定パスワードの簡易認証なので、本番前には取引先用認証・パスワード管理・期限・監査を別途検討する。
- Task 097では認証実装は変更しない。

## PublicCase接続方針

PublicCase取得は、公開ページがServer Component中心であるため、まずはServer ComponentでPrismaを直接読む方針が自然。

初期実装候補:

- `src/lib/public-cases.ts` を作り、B2C/B2B共通の取得・表示整形関数を置く。
- `src/components/public-cases/PublicCaseCard.tsx` を作り、B2C/B2B共通カードを集約する。
- `/cases/gallery` と `/cases/biz` は、それぞれ取得条件と価格表示モードだけを分ける。
- トップページは軽量な `getRecentPublicCasesForHome()` のような取得関数で数件だけ表示する。

初期の公開条件:

- B2C: `b2cPublishStatus = PUBLISHED`
- B2B: `b2bPublishStatus = PUBLISHED`
- 共通: `reviewStatus = APPROVED`
- `excludeReasons` に除外理由があるものは原則表示しない。
- `コピー` は生成時に除外済みだが、公開取得時にも念のため `searchText` / 表示名に含まない前提を維持する。

## B2C表示方針

B2Cはログイン不要。

表示するもの:

- 写真枠
- `brandDisplayName`
- modelName
- Ref / Cal
- B2C向け作業名
- 詳しく見る

表示しないもの:

- 価格
- 技術料
- 交換部品価格
- 合計
- sourceRepairId
- internal/external slot key
- warning / review詳細
- FMP由来であること
- コピー含有Case

## B2B表示方針

B2Bは管理アプリログインではなく、B2B公開用ログイン / `b2b_session` で保護する。

表示するもの:

- 写真枠
- `brandDisplayName`
- modelName
- Ref / Cal
- B2B向け作業名
- 技術料
- 交換部品
- 合計
- 詳しく見る

価格表示:

- `PublicCase.showPriceB2b` がtrueであることを前提に、明細単位では `showPriceB2b = true` かつ正の金額だけ表示する。
- `showPriceB2c` は使わない。
- 未紐づけPartItemの価格は表示しない。
- `部品代` ではなく `交換部品` ラベルを使う。

表示しないもの:

- 未紐づけ部品
- 価格は表示していません
- UNLINKED
- NEEDS_REVIEW
- warning / review
- sourceRepairId
- internal-1 / external-1
- 価格表示対象なし
- FMP由来であること

## 共通カードコンポーネント方針

共通カードコンポーネントは作るべき。

理由:

- B2C/B2Bでブランド、モデル、Ref/Cal、写真枠、修理内容の階層は共通。
- B2Bだけ価格ブロックを追加する形にすると、FMP由来とWEB_APP由来を同じUIで扱いやすい。
- DBプレビューで積み上げた重複表示省略、`交換部品` ラベル、内部文言非表示のルールを一箇所に集約できる。

候補:

- `src/components/public-cases/PublicCaseCard.tsx`
- `src/lib/public-case-display.ts`
- `src/lib/public-cases.ts`

ただし、初回実装では大規模リファクタリングを避け、DBプレビューの表示関数を参考に最小の共通部品から始める。

## 検索導線の初期設計

検索実装は今回しないが、導線としては以下を想定する。

B2C:

- ブランドから探す
- 症状から探す
- 修理内容から探す
- キーワード検索

B2B:

- ブランド
- Ref
- Cal
- 作業内容
- 交換部品
- 価格帯
- キーワード検索

検索対象:

- brandDisplayName
- brandName
- brandNameKana
- modelName
- ref
- caliber
- workItems.b2cDisplayName / b2bDisplayName
- partItems.displayName
- searchText

初期実装では `searchText` の部分一致を使い、PostgreSQL全文検索やtrigram indexは検索要件が固まってから検討する。

## 変更予定ファイル

次タスク以降の候補:

- `src/lib/public-cases.ts`
  - PublicCase取得関数
- `src/lib/public-case-display.ts`
  - 表示名、作業名、価格表示、内部文言除外の整形
- `src/components/public-cases/PublicCaseCard.tsx`
  - B2C/B2B共通カード
- `src/app/cases/gallery/page.tsx`
  - B2C一覧をPublicCase読み込みへ変更
- `src/app/cases/biz/page.tsx`
  - B2B価格事例をPublicCase読み込みへ変更
- `src/app/page.tsx`
  - トップページ横スクロール事例をPublicCase読み込みへ変更

安全な実装順:

1. `/cases/gallery` をPublicCase読み込みへ切り替える。
2. `/cases/biz` をPublicCase読み込みへ切り替える。
3. トップページの横スクロール事例をPublicCase読み込みへ切り替える。
4. 検索UI / 検索APIを追加する。

トップページは現在大きなHTML文字列を持っているため、最初に触るより、独立した `/cases/gallery` から始めるのが安全。

## 今回変更しなかったもの

- DB更新なし
- Supabase本番DB接続なし
- schema変更なし
- migration作成なし
- seed作成なし
- import script実行なし
- PublicCase再生成なし
- generated JSON / CSV本体変更なし
- `/cases/gallery` / `/cases/biz` / トップページ実装変更なし
- 検索実装なし
- RepairEntryForm / PricingRule / 既存マスタ変更なし

## 次タスク案

- Task 098: PublicCase共通表示helper / card component設計
- Task 099: `/cases/gallery` をPublicCase読み込みへ最小接続
- Task 100: `/cases/biz` をPublicCase読み込みへ最小接続
- Task 101: トップページ横スクロール事例をPublicCase読み込みへ接続
