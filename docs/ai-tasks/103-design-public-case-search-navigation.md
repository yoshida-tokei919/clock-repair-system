# AI Task 103: PublicCase検索導線設計

## 目的

B2C/B2Bの公開事例ページで、PublicCaseを対象にした検索導線を設計する。

今回は設計のみで、検索UI、検索API、DB/schema変更、PublicCase生成/import処理は行わない。

## 前提

- B2C導線は、トップページ横スクロール、`/cases/gallery`、`/cases/gallery/[id]` がPublicCaseへ接続済み。
- B2B導線は、`/cases/biz`、`/cases/biz/[id]` がPublicCaseへ接続済み。
- `PublicCase.searchText` は追加済みで、FMP由来PublicCaseにはブランド英字、ブランドカナ、brandDisplayName、モデル、Ref、Cal、公開作業名、交換部品名が入っている。
- コピー含有Caseは生成時点で公開候補から除外済み。
- トップページ横スクロールは、無限スクロール風UIのため同じ最新10件をHTML上で2セット描画している。これは後でSEO/検索/アクセシビリティ観点で改善する未完了タスクとして残し、Task 103では触らない。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repairは、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、同じB2C/B2B公開ページ、同じカードUI、同じ検索思想で扱う。
- 検索画面では、FMP由来かWEB_APP由来かを閲覧者に見分けさせない。

## 現在の公開事例導線

B2C:

- トップページ横スクロール
- `/cases/gallery`
- `/cases/gallery/[id]`

B2B:

- `/cases/biz`
- `/cases/biz/[id]`

B2Bは既存の `b2b_session` cookieで保護されている。

## B2C検索導線

B2Cは一般のお客様向けのため、専門用語を知らなくても事例へ到達できる導線を優先する。

検索入口は、まず `/cases/gallery` 上部に置く案を推奨する。別URLの `/cases/search` は、検索UIが大きくなった段階で検討する。

B2C検索軸:

- ブランドから探す
- 症状から探す
- 修理内容から探す
- キーワードで探す

ブランドから探す例:

- オメガ（OMEGA）
- ロレックス（ROLEX）
- セイコー（SEIKO）
- シチズン（CITIZEN）
- タグ・ホイヤー（TAG HEUER）

症状から探す例:

- 止まる・動かない
- 遅れる・進む
- リューズが取れた
- ガラスが割れた
- 水が入った
- 針が外れた
- ベルト・ブレスの不具合
- 電池交換したい

修理内容から探す例:

- オーバーホール
- 電池交換
- ガラス交換
- リューズ交換
- ゼンマイ交換
- 針取付
- 外装仕上げ
- 部品製作・加工

B2Cでは価格検索は不要。

## B2B検索導線

B2Bは業者向けのため、実務で使うRef、Cal、交換部品、作業内容に素早く到達できる導線を優先する。

検索入口は `/cases/biz` の認証後ページ内に置く。

B2B検索軸:

- ブランド
- モデル
- Ref
- Cal
- 作業内容
- 交換部品
- 価格帯
- キーワード

B2B向けフリーワード例:

- 3135
- 2892
- スピードマスター
- シーマスター
- リューズ
- ゼンマイ
- ガラス
- オーバーホール
- 外装仕上げ

価格帯検索は有用だが、初期実装では後回しにする。価格表示ルールが明細単位で安全側に絞られているため、まずは検索対象と表示の安定を優先する。

## カテゴリ選択・ドリルダウン設計

B2C向け:

ブランドから探す:

1. ブランド
2. モデル
3. Ref / Cal
4. 修理内容
5. 事例一覧

症状から探す:

1. 症状カテゴリ
2. 症状詳細
3. 修理内容
4. 事例一覧

修理内容から探す:

1. 内装 / 外装
2. 作業カテゴリ
3. 作業名
4. 事例一覧

B2B向け:

1. ブランド
2. モデル
3. Ref / Cal
4. 作業内容 / 交換部品
5. 価格事例一覧

B2Bでは、Ref / Calへ早く到達できるUIを優先する。

## フリーワード検索設計

初期実装では、`PublicCase.searchText` に対する部分一致検索から始める。

Prismaでは、まず `contains` と `mode: "insensitive"` 相当を検討する。ただし日本語の大文字小文字には効果が限定的なので、入力正規化と `searchText` の作り方を重視する。

検索文字列は以下の正規化を行う。

- 前後空白trim
- 連続空白の整理
- 全角/半角スペースの整理
- 英字の大文字/小文字揺れ吸収
- 空文字の場合は通常一覧表示へ戻す

将来は以下を検討する。

- PostgreSQL full text search
- trigram index
- ブランドalias強化
- かな/カナ/英字正規化
- 複数キーワードAND検索

## searchText の使い方

初期実装:

- B2C: `b2cPublishStatus = PUBLISHED`, `reviewStatus = APPROVED`, `showPriceB2c = false` を前提に `searchText contains q`
- B2B: `b2bPublishStatus = PUBLISHED`, `reviewStatus = APPROVED` を前提に `searchText contains q`
- ローカルDB検証時のみ、既存と同じFMP fallbackを許容する

FMP由来PublicCaseの `searchText` には以下が入っている。

- ブランド英字
- ブランドカナ
- brandDisplayName
- モデル
- Ref
- Cal
- 公開作業名
- 交換部品名

B2Bの価格帯検索を実装する場合は、`searchText` ではなく表示対象明細の価格から別条件で絞る。

## 検索対象にするもの

- `brandDisplayName`
- `brandName`
- `brandNameKana`
- `modelName`
- `ref`
- `caliber`
- `workItems.b2cDisplayName`
- `workItems.b2bDisplayName`
- `partItems.displayName`
- `searchText`
- 公開タグ
- 症状タグ

初期実装では、まず `searchText` を主対象にし、必要に応じて `brandName` / `brandNameKana` / `ref` / `caliber` などの個別条件を追加する。

## 検索対象にしないもの

- 顧客情報
- 取引先情報
- 内部メモ
- 原価
- 利益
- warning詳細
- `sourceRepairId`
- 未公開コメント
- `sourceType`
- FMP由来であること
- コピー除外対象

## コピー除外方針

コピーを含むPublicCaseは生成時点で除外済み。

検索でも以下を守る。

- コピーを含む事例は検索対象にしない
- コピーを含む語は `searchText` に入れない
- 検索結果にコピー表記を出さない
- 取得関数側でも念のため `containsCopyKeyword` 相当で除外する

## 0件時の表示方針

B2C:

`該当する修理事例はまだ掲載されていません。LINEで写真を送ってご相談ください。`

B2B:

`該当する価格事例はまだ掲載されていません。個別見積りをご相談ください。`

文言は本実装時にサイトトーンに合わせて調整する。

## URL / query parameter 方針

検索状態はURLに残す方針を推奨する。

初期実装:

- B2C: `/cases/gallery?q=オメガ`
- B2B: `/cases/biz?q=3135`

次段階:

- B2C: `/cases/gallery?brand=OMEGA`
- B2C: `/cases/gallery?work=overhaul`
- B2B: `/cases/biz?brand=ROLEX&cal=3135`
- B2B: `/cases/biz?part=ゼンマイ`

初期実装は `q` だけに絞るのが安全。カテゴリ/ドリルダウンUIが固まったら、個別query parameterを追加する。

## B2C/B2B共通化方針

共通化するもの:

- query文字列の正規化
- `searchText` 部分一致検索
- `brandDisplayName -> brandName -> 空表示`
- Ref / Cal表示
- コピー除外
- カードの基本見た目
- 0件時の基本レイアウト

共通化候補:

- `src/lib/public-cases.ts` の検索取得関数
- `src/lib/public-case-search.ts` の検索条件生成
- `src/lib/public-case-display.ts` の表示名整形

ただし、初期実装では大規模共通化を避け、B2Cの `q` 検索を先に作ってから共通化する。

## B2C/B2Bで分ける方針

分けるもの:

- B2C価格非表示
- B2B価格表示
- B2B認証
- B2B価格帯検索
- B2BのRef / Cal / 交換部品優先UI
- B2Cの症状・修理内容を中心にした導線

B2Bでは `showPriceB2b=true` かつ正の金額だけ表示するルールを維持する。B2Cでは価格関連の条件・表示を一切出さない。

## 実装優先順位

Phase 1:

- `/cases/gallery?q=...` のB2Cキーワード検索
- `searchText contains q` から始める
- 0件時メッセージを追加

Phase 2:

- B2Cブランド絞り込み
- `brandDisplayName` / `brandName` / `brandNameKana` の候補一覧をページ上部に表示

Phase 3:

- `/cases/biz?q=...` のB2Bキーワード検索
- `b2b_session` 認証内で実装
- Ref / Cal / 交換部品で探しやすい入力UIにする

Phase 4:

- B2B Ref / Cal / 交換部品 / 価格帯検索
- 価格帯は表示対象価格だけを使って絞る

Phase 5:

- カテゴリ選択・ドリルダウンUI
- B2Cの症状導線、修理内容導線を追加

Phase 6:

- PostgreSQL full text search / trigram / alias強化
- BrandMaster aliasとPublicCase `searchText` の再生成方針を整理

補足:

- トップページ横スクロールの重複DOM改善は、検索実装とは別のTaskとして残す。

## 変更しなかったもの

- DB更新
- Supabase本番DB接続
- schema変更
- migration作成
- seed作成
- import script実行
- PublicCase再生成
- generated JSON / CSV
- トップページ実装
- `/cases/gallery` 実装
- `/cases/gallery/[id]` 実装
- `/cases/biz` 実装
- `/cases/biz/[id]` 実装
- B2B認証
- 検索UI実装
- 検索API実装
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 104: B2C `/cases/gallery?q=` キーワード検索の最小実装
- Task 105: B2B `/cases/biz?q=` キーワード検索の最小実装
- Task 106: トップページ横スクロールの重複DOM改善
- Task 107: PublicCase画像追加フロー設計
