# AI Task 099: B2C PublicCase詳細ページ作成

## 目的

B2C向けPublicCase詳細ページを作成し、`/cases/gallery` の「詳しく見る」から遷移できるようにする。

今回はB2C詳細ページのみを対象とし、トップページ、B2B、検索機能は変更しない。

## 前提

- Task 098で `/cases/gallery` はPublicCase読み込みへ切り替え済み。
- ローカルDBにはFMP由来PublicCase 2,914件をreplace投入済み。
- 現在のローカルDBは検証投入状態で、PublicCaseは `HIDDEN / NEEDS_REVIEW`。
- 本来の公開条件は `PUBLISHED / APPROVED`。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件はFMP専用ルールでPublicCaseへ変換済み。
  - brand-kana-approvedで `brandDisplayName` / `searchText` 反映済み。
  - コピー含有Caseは除外済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、FMP由来でも新アプリ由来でも同じB2C/B2B公開ページ・同じカードUIで扱う。

## 作成・変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/gallery/page.tsx`
- `src/app/cases/gallery/[id]/page.tsx`

## 詳細ページURL方針

既存のB2C一覧が `/cases/gallery` にあるため、詳細ページは同じ階層の以下にした。

```text
/cases/gallery/[id]
```

現時点ではSEO slugを持たないため、PublicCase.idを使う。

将来的なslug例:

```text
/cases/omega-seamaster-196-1114-overhaul
```

## PublicCase取得条件

`src/lib/public-cases.ts` に `getB2CPublicCaseDetail(id: string)` を追加した。

通常条件:

- `b2cPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`
- `showPriceB2c = false`

現在のローカルDBは検証投入状態で公開済みが0件のため、localhost DBの場合だけFMP由来PublicCaseへのfallbackを許可する。

本番remoteではfallbackしない。

## 表示項目

B2C詳細ページでは以下を表示する。

- 写真枠
- brandDisplayName
- モデル名
- Ref
- Cal
- 修理内容
- 交換部品名
- 補足コメント
- ギャラリーへ戻るリンク

価格、技術料、部品価格、合計は表示しない。

## brandDisplayName表示ルール

ブランド表示は以下の優先順。

1. `brandDisplayName`
2. `brandName`
3. 空表示

ブランド名なしCaseでは、`未確認（BRAND）` や `ブランド未確認` は作らない。

## B2C価格非表示ルール

B2C詳細ページでは価格ブロックを描画しない。

交換部品名は表示してよいが、部品価格は表示しない。

確認では以下が表示されないことを確認した。

- `¥`
- `￥`
- `技術料`
- `部品代`
- `価格は表示していません`
- `価格表示対象なし`

## 内部管理文言の非表示

確認では以下が表示されないことを確認した。

- `FMP`
- `sourceType`
- `sourceRepairId`
- `internal-1`
- `external-1`
- `UNLINKED`
- `NEEDS_REVIEW`
- `warning`
- `review`

## コピー除外確認

取得時に表示対象フィールドへ `コピー` が含まれるPublicCaseは返さない。

確認でも詳細ページHTMLに `コピー` が表示されないことを確認した。

## 画像なしケースの扱い

現時点でPublicCaseImageは0件。

画像がない場合は、薄い背景とアイコンだけの写真枠を表示する。強い注意文や管理用badgeは出さない。

## ギャラリー側リンク変更

`/cases/gallery/page.tsx` の「詳しく見る」を以下へ変更した。

```tsx
href={`/cases/gallery/${publicCase.id}`}
```

## notFound 方針

以下の場合は `notFound()` にする。

- idが数値でない
- PublicCaseが存在しない
- B2C公開条件に合わない
- 本番remoteで公開済みではない
- 表示対象に `コピー` を含む

localhost DBでは、現在の検証投入状態に合わせてFMP由来PublicCase fallbackを許可する。

## 確認結果

確認コマンド:

```powershell
npx tsc --noEmit --pretty false --incremental false
```

結果: 成功。

確認URL:

- `http://localhost:3000/cases/gallery`
- `http://localhost:3000/cases/gallery/5824`
- `http://localhost:3000/cases/gallery/5837`
- `http://localhost:3000/cases/gallery/5838`

確認結果:

- `/cases/gallery` に詳細リンク `/cases/gallery/{id}` が出る
- `オメガ（OMEGA）` 表示あり
- `ロレックス（ROLEX）` 表示あり
- `セイコー（SEIKO）` 表示あり
- ギャラリーへ戻るリンク表示あり
- B2C価格表示なし
- 部品価格表示なし
- 内部管理文言表示なし
- コピー表示なし

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

- Task 100: `/cases/biz` をPublicCase読み込みへ接続
- Task 101: トップページ横スクロール事例をPublicCase読み込みへ接続
- Task 102: PublicCase検索導線の最小設計
