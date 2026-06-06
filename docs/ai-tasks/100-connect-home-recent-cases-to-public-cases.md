# AI Task 100: トップページ横スクロール修理事例をPublicCaseへ接続

## 目的

トップページの横スクロール修理事例を、静的サンプル配列ではなく、B2C公開対象のPublicCase最新10件から表示する。

## 前提

- FMP PublicCaseはローカルDBへreplace投入済み。
- `/cases/gallery` と `/cases/gallery/[id]` はPublicCase読み込みへ接続済み。
- 今回はトップページ横スクロールのみを対象にし、B2B、検索、PublicCase生成/import処理は触らない。

## FMP過去案件と新アプリ通常案件の切り分け

- FMP過去案件は、FMP専用ルールでPublicCaseへ変換済み。
- 新アプリ通常Repair案件は、将来Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseへ変換する。
- PublicCase化後は、FMP由来か新アプリ由来かを表示UIで分けず、同じB2C/B2B公開ページ・同じカードUIで扱う。

## トップページ横スクロールの確定仕様

- B2C公開対象PublicCaseの最新10件を表示する。
- 新しいB2C公開事例が追加されると、取得結果が最新10件に入れ替わる。
- 価格は表示しない。
- 静的サンプル事例は本番表示に残さない。
- B2C公開事例が0件の場合は、カード0件表示でも許容する。

## 変更したファイル

- `src/lib/public-cases.ts`
- `src/app/page.tsx`
- `docs/ai-tasks/100-connect-home-recent-cases-to-public-cases.md`

## PublicCase取得条件

トップページ用に `getLatestB2CPublicCasesForHome(limit = 10)` を追加した。

基本条件:

- `b2cPublishStatus = PUBLISHED`
- `reviewStatus = APPROVED`
- `showPriceB2c = false`

ローカルDBでは検証投入データが公開状態ではないため、`localhost / 127.0.0.1 / host.docker.internal` のDB接続時のみ、`sourceType = FMP` かつ `showPriceB2c = false` のfallbackを使う。

## 表示件数

取得件数は最大10件。

既存の横スクロールは無限ループ風に見せるため、取得した10件をHTML上では2セット描画する構造を維持した。

## 並び順

既存データで安定して扱えるよう、`receivedDate desc`、`id asc` の順で取得する。

## 0件時の扱い

サンプル事例にはfallbackしない。

現時点では、0件の場合もセクション構造は残り、カードが0件になる。

## サンプル事例の扱い

トップページ内の静的な `recentRepairCases` 配列は廃止し、PublicCase取得結果からカード表示用データを生成するようにした。

## 表示項目

トップページカードでは以下のみを表示する。

- 写真枠
- `brandDisplayName`
- モデル名
- Ref / Cal
- 修理内容
- 詳しく見る

## B2C価格非表示ルール

トップページの横スクロールでは価格、技術料、交換部品価格、合計を描画しない。

## 内部管理文言の非表示

以下は表示しない。

- `sourceType`
- `sourceRepairId`
- `warning`
- `review`
- `FMP`
- `internal-1`
- `external-1`
- `UNLINKED`
- `NEEDS_REVIEW`

## 写真なしケースの扱い

現時点でPublicCaseImageは0件のため、画像がない場合は淡いグレーの写真枠プレースホルダーを表示する。

## 詳細リンク

「詳しく見る」は、Task 099で作成したB2C詳細ページへリンクする。

`/cases/gallery/[id]`

## 確認結果

- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `http://localhost:3000/`: HTTP 200
- PublicCase由来のブランド表示を確認
  - `セイコー（SEIKO）`
  - `ロレックス（ROLEX）`
  - 最新10件には `オメガ（OMEGA）` は含まれなかった
- `/cases/gallery/[id]` へのリンクを確認
- `¥` / `￥` は表示なし
- `技術料` は表示なし
- `部品代` は表示なし
- `コピー` は表示なし
- `sourceRepairId` は表示なし
- `UNLINKED` / `NEEDS_REVIEW` は表示なし

## 変更しなかったもの

- DB更新
- schema変更
- migration作成
- seed作成
- PublicCase再生成
- import script実行
- generated JSON / CSV
- `/cases/biz`
- B2B認証
- 検索機能
- `RepairEntryForm.tsx`
- `PricingRule`

## 次タスク案

- Task 101: `/cases/biz` をPublicCase B2B価格事例へ接続
- Task 102: B2C PublicCase検索UI設計
- Task 103: PublicCase画像追加フロー設計
