# 見積PDF保存・共有基盤 Roadmap

## ローカル動作確認の現在地

```txt
.env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定済み
Supabase Storage private bucket documents を作成済み
EstimateDocument.id = 13 でPDF生成API成功済み
Storage: documents/estimates/13/3.pdf
fileSize: 78876 bytes
EstimateDocument.currentPdfFileId = 3
EstimatePdfFile.id = 3
status = current
version = 3
id = 1, id = 2 は失敗テスト分で status = void
```

## Step 1: 管理者用保存済みPDF取得routeを追加

追加route:

```txt
GET /api/documents/estimate/[id]/pdf
```

目的:

管理者が保存済みPDFを取得できるrouteを追加する。

想定flow:

```txt
管理者ログイン確認
→ EstimateDocument.currentPdfFileId取得
→ EstimatePdfFile.storageKey取得
→ Supabase Storage documents bucketからdownload
→ Content-Type: application/pdf で返す
```

触る予定ファイル:

- `src/app/api/documents/estimate/[id]/pdf/route.ts`

やらないこと:

- 管理画面UI変更
- public PDF route変更
- LINE送信変更
- PDFコンポーネント変更
- Prisma schema / migration変更

リスク:

- PDF未生成時のstatus code設計
- 管理者認証漏れ
- private bucket download失敗時のエラー処理

完了条件:

- 管理者ログイン済みでPDFが返る
- 未ログインで401
- PDF未生成で404または明確なエラー
- `Content-Type: application/pdf`

## Step 2: 管理画面で保存済みPDFを表示

目的:

管理画面PDFページを、動的生成ではなく保存済みPDF表示へ寄せる。

触る予定ファイル:

- `src/app/documents/estimate/[id]/page.tsx`
- 必要なら管理画面用client component

やらないこと:

- public PDF route変更
- LINE送信変更
- DB schema変更

リスク:

- 既存のPDFダウンロード導線を壊す
- LINE送信ボタンやコメントUIとの干渉

完了条件:

- `currentPdfFileId`がある場合、保存済みPDFをiframeまたはlinkで表示
- PDF未生成時は未生成表示
- 管理画面で見ているPDFがStorage上の保存済みPDFになる

## Step 3: 管理画面にPDF生成/再生成ボタンを追加

目的:

管理者が明示的にPDFを生成・再生成できるようにする。

触る予定ファイル:

- `src/app/documents/estimate/[id]/page.tsx`
- 必要なら管理画面用client component
- 既存API: `POST /api/documents/estimate/[id]/pdf/generate`

やらないこと:

- public PDF route変更
- LINE送信変更
- DB schema変更

リスク:

- 連打による複数version作成
- 生成中UIがないと操作結果が分かりにくい

完了条件:

- PDF未生成時に「PDF生成」
- PDF生成済み時に「PDF再生成」
- 成功後に保存済みPDF表示へ反映

## Step 4: public PDF routeを保存済みPDF返却へ変更

対象route:

```txt
/customer/repairs/[token]/estimate.pdf
```

目的:

B2B共有画面のPDFボタンから、保存済みPDFを返す。

触る予定ファイル:

- `src/app/customer/repairs/[token]/estimate.pdf/route.ts`

やらないこと:

- PDF生成
- 管理画面UI変更
- LINE送信変更
- PDFコンポーネント変更

リスク:

- token検証の取り違え
- PDF未生成時に取引先がPDFを見られない
- 既存URL互換を壊す

完了条件:

- URLは維持
- token検証を維持
- route内でPDFを生成しない
- `currentPdfFileId → storageKey`からPDFを返す
- PDF未生成時は404または明確なエラー

## Step 5: LINE送信をcurrentPdfFile前提に変更

目的:

LINE送信時に毎回PDFを生成せず、保存済みPDFが存在することを前提にする。

触る予定ファイル:

- `src/app/api/documents/estimate/[id]/line/route.ts`

やらないこと:

- LINE送信時のPDF再生成
- public PDF route内でのPDF生成
- DB schema変更

リスク:

- PDF未生成のまま送信できてしまう
- 既存のローカル保存処理をどう扱うか

完了条件:

- `currentPdfFileId`がない場合は送信停止
- 共有URL内のPDFボタンが保存済みPDFを返す
- LINE送信routeではPDFを生成しない

## Step 6: PDF未生成/古いPDF/再生成のUI整備

目的:

管理者がPDF状態を把握し、安全に再生成できるようにする。

触る予定ファイル:

- 管理画面PDFページ
- 必要なら修理/見積更新処理

やらないこと:

- 大規模なワークフロー変更
- 不要なschema拡張

リスク:

- 現状、`Estimate` / `EstimateItem`の更新日時が十分でない
- 「古いPDF」判定を厳密にするには追加設計が必要

完了条件:

- PDF未生成状態が分かる
- PDF生成済み状態が分かる
- 再生成操作が分かる
- 古いPDF判定の方針が明確

## Step 7: 必要なら版管理UI追加

目的:

過去版、送信済み、承認済み、差し替え済みPDFを管理できるようにする。

触る予定ファイル:

- 管理画面PDFページ
- 必要ならPDF履歴表示component

やらないこと:

- 送信済み/承認済みPDFの上書き
- 取引先が見るPDFの自動差し替え

リスク:

- 業務上どのPDFを「現在提示中」とするかの判断
- 承認後のPDF固定ルール

完了条件:

- `current` / `sent` / `approved` / `superseded` / `void` が見分けられる
- どのPDFが現在提示中か分かる
- 再見積時の扱いが明確
