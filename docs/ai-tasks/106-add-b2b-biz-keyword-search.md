# AI Task 106: B2B価格事例にキーワード検索を追加

## 目的

/cases/biz のB2B業者向け価格事例一覧に、PublicCase.searchText を中心にしたキーワード検索を追加する。

## 前提

- B2B価格事例は PublicCase 化後の共通公開表示を使う
- 既存の b2b_session 認証は維持する
- 今回はB2B一覧の q 検索のみを追加する
- B2C、トップページ、詳細ページ、カテゴリ検索、検索API、DB/schemaは変更しない

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件はFMP専用ルールでPublicCaseへ変換済み。
新アプリ通常Repair案件は、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。

PublicCase化後は、FMP由来か新アプリ由来かを表示上は区別せず、同じB2C/B2B公開ページとカードUIで扱う。

## B2B認証の扱い

/cases/biz の既存 b2b_session cookie 認証を維持した。
検索フォームと検索結果は認証後のページ内でのみ表示される。

## 変更したファイル

- src/lib/public-cases.ts
- src/app/cases/biz/page.tsx
- docs/ai-tasks/106-add-b2b-biz-keyword-search.md

## 検索UI

/cases/biz 上部に検索フォームを追加した。

- input name="q"
- placeholder: ブランド・Ref・Cal・作業内容・交換部品で検索
- 検索ボタン
- q 入力時のクリアリンク
- 検索語を input に保持

## URL / query parameter 方針

初期実装は q のみ。

例:

- /cases/biz?q=3135
- /cases/biz?q=ゼンマイ
- /cases/biz?q=オーバーホール

## PublicCase取得条件

既存B2B条件を維持する。

- b2bPublishStatus = PUBLISHED
- reviewStatus = APPROVED

ローカルDBで公開済み0件の場合のみ、既存方針どおり sourceType = FMP のfallback表示を使う。
本番remoteではfallbackしない。

## q検索対象

主対象:

- searchText

補助対象:

- brandDisplayName
- brandName
- brandNameKana
- modelName
- ref
- caliber
- PublicCaseWorkItem.b2bDisplayName
- PublicCaseWorkItem.b2cDisplayName
- PublicCaseWorkItem.normalizedWorkName
- PublicCasePartItem.displayName
- PublicCasePartItem.normalizedSourceText

## 検索語の正規化

既存の normalizePublicCaseSearchQuery を使用。

- trim
- 全角スペースを半角スペースへ整理
- 連続空白を1つに整理
- 最大80文字
- 空文字は検索なし扱い

## B2B価格表示ルール維持

検索追加後も価格表示条件は変更していない。

- WorkItem: showPriceB2b = true かつ laborPrice > 0 のみ表示
- PartItem: showPriceB2b = true かつ price > 0 かつ relatedWorkItemId ありのみ表示
- 合計は表示対象価格のみで計算
- showPriceB2c は使わない
- 未紐づけPartItem価格、0円、内部価格は表示しない

## 0件時表示

q 検索結果が0件の場合は、B2B向けに以下を表示する。

該当する価格事例はまだ掲載されていません。
個別見積りをご相談ください。

## 内部管理文言の非表示

以下は引き続き表示しない。

- FMP
- sourceType
- sourceRepairId
- internal-1
- external-1
- UNLINKED
- NEEDS_REVIEW
- warning
- review
- 未紐づけ部品
- 価格は表示していません
- 価格表示対象なし
- 部品代
- showPriceB2b
- showPriceB2c

## コピー除外確認

コピー含有Caseは生成時点で除外済み。
B2B検索でも、containsCopyKeyword のフィルタにより表示対象から除外する方針を維持した。

## 確認結果

npx tsc --noEmit --pretty false --incremental false は成功。

既存dev serverに b2b_session=authenticated cookie を付けて以下を確認した。

- /cases/biz?q=3135: HTTP 200、検索語保持、詳細リンクあり
- /cases/biz?q=ゼンマイ: HTTP 200、検索語保持、詳細リンクあり
- /cases/biz?q=リューズ: HTTP 200、検索語保持、詳細リンクあり
- /cases/biz?q=オーバーホール: HTTP 200、検索語保持、詳細リンクあり

共通確認:

- 交換部品 ラベル表示あり
- 部品代 ラベルなし
- 内部管理文言なし
- コピー表示なし
- 詳しく見る は /cases/biz/[id] のまま

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed作成なし
- generated JSON / CSV 変更なし
- import script 実行なし
- トップページ変更なし
- B2Cページ変更なし
- B2B詳細ページ変更なし
- 検索API新設なし
- カテゴリドリルダウン実装なし

## 次タスク案

- Task 107: B2B価格事例にブランド絞り込みを追加
- Task 108: B2B Ref / Cal / 交換部品の詳細検索設計
- Task 109: トップページ横スクロールの重複DOM改善
