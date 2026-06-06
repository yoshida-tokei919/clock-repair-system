# AI Task 104: B2Cギャラリーにキーワード検索を追加

## 目的

`/cases/gallery` にB2C向けのキーワード検索を追加する。

今回はB2Cギャラリーの `q` 検索のみを対象にし、B2B、トップページ、詳細ページ、カテゴリドリルダウン、検索API新設、DB/schema変更は行わない。

## 前提

- `/cases/gallery` はPublicCase読み込み済み。
- `/cases/gallery/[id]` はB2C詳細ページとして作成済み。
- PublicCaseには `searchText` があり、FMP由来PublicCaseにはブランド英字、ブランドカナ、brandDisplayName、モデル、Ref、Cal、公開作業名、交換部品名が入っている。
- コピー含有Caseは生成時点で除外済み。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、同じB2C/B2B公開ページ、同じカードUI、同じ検索思想で扱う。
- 検索画面では、FMP由来かWEB_APP由来かを閲覧者に見分けさせない。

## 変更したファイル

- `src/lib/public-cases.ts`
- `src/app/cases/gallery/page.tsx`
- `docs/ai-tasks/104-add-b2c-gallery-keyword-search.md`

## 検索UI

`/cases/gallery` 上部にGETフォームを追加した。

- `input name="q"`
- placeholder: `ブランド・モデル・Ref・Cal・修理内容で検索`
- 検索ボタン
- q入力中のクリアリンク
- q入力中は検索語と件数を表示

## URL / query parameter 方針

初期実装は `q` のみ。

例:

- `/cases/gallery?q=オメガ`
- `/cases/gallery?q=ロレックス`
- `/cases/gallery?q=3135`
- `/cases/gallery?q=ゼンマイ`

検索状態はURLに残る。

## PublicCase取得条件

通常条件:

- `b2cPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`
- `showPriceB2c = false`

ローカルDB検証時のみ、公開済み0件の場合に既存方針と同じFMP fallbackを使う。

- `sourceType = FMP`
- `showPriceB2c = false`

本番remoteではfallbackしない。

## q検索対象

初期実装では `searchText` を主対象にしつつ、保険として以下もOR対象にした。

- `searchText`
- `brandDisplayName`
- `brandName`
- `brandNameKana`
- `modelName`
- `ref`
- `caliber`

Prismaの `contains` と `mode: "insensitive"` を使用する。

## 検索語の正規化

最低限の正規化として以下を実装した。

- `null / undefined` 安全処理
- 全角スペースを半角スペースへ寄せる
- 連続空白を1つへ整理
- trim
- 最大80文字に切り詰め
- 空文字なら検索なし扱い

かな/カナ変換、全角半角英数字変換、alias展開は今回は未実装。

## 0件時表示

検索結果0件時は以下を表示する。

```text
該当する修理事例はまだ掲載されていません。
LINEで写真を送ってご相談ください。
```

検索なしで0件の場合は、通常の「掲載中の修理事例はありません」表示にする。

## 表示ルール維持

検索結果カードでも既存のB2C表示ルールを維持した。

- `brandDisplayName -> brandName -> 空表示`
- B2C価格は表示しない
- 内部管理文言は表示しない
- 画像なしは写真枠プレースホルダー
- 「詳しく見る」は `/cases/gallery/[id]`

## コピー除外確認

PublicCase生成時点でコピー含有Caseは除外済み。

B2C取得側でも `containsCopyKeyword` による除外を維持している。

## 確認結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功

画面確認:

- `/cases/gallery?q=オメガ`: HTTP 200、30件、`オメガ（OMEGA）` 表示
- `/cases/gallery?q=ロレックス`: HTTP 200、30件、`ロレックス（ROLEX）` 表示
- `/cases/gallery?q=セイコー`: HTTP 200、30件、`セイコー（SEIKO）` 表示
- `/cases/gallery?q=3135`: HTTP 200、30件、`ロレックス（ROLEX）` 表示
- `/cases/gallery?q=notfound-task104-check`: HTTP 200、0件、0件時メッセージ表示

共通確認:

- qがinputに保持される
- `/cases/gallery/[id]` への詳細リンクあり
- `¥` / `￥` 表示なし
- `部品代` 表示なし
- `コピー` 表示なし
- `sourceRepairId` 表示なし
- `internal-1` / `external-1` 表示なし
- `UNLINKED` / `NEEDS_REVIEW` 表示なし
- `showPriceB2b` / `showPriceB2c` 表示なし

## 変更しなかったもの

- DB更新
- Supabase本番DB接続
- schema変更
- migration作成
- seed作成
- import script実行
- PublicCase再生成
- generated JSON / CSV
- トップページ
- `/cases/gallery/[id]`
- `/cases/biz`
- `/cases/biz/[id]`
- B2B認証
- 検索API新設
- カテゴリドリルダウン
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 105: B2Cブランド絞り込みの最小実装
- Task 106: B2B `/cases/biz?q=` キーワード検索の最小実装
- Task 107: トップページ横スクロールの重複DOM改善
