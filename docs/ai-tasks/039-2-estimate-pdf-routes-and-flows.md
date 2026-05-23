# 見積PDF route / flow整理

## 絶対方針

- public PDF routeではPDFを生成しない
- public PDF routeは保存済みPDFを返すだけにする
- 共有画面アクセス時にPDFを都度生成しない
- 管理画面で確認したPDFと共有PDFは同じstorageKeyを参照する
- LINE送信時にPDFを生成しない
- LINE送信時にPDFをローカル保存しない
- LINEでPDF添付はしない
- LINEではB2B共有ページURLのみを送る

## 旧PDF生成経路

```txt
管理画面PDF:
GET /documents/estimate/[id]
→ EstimatePDFClient
→ usePDF({ document: <EstimateDocument data={data} /> })
→ src/components/pdf/EstimateDocument.tsx

public PDF:
GET /customer/repairs/[token]/estimate.pdf
→ renderEstimatePdf()
→ createEstimateServerDocumentElement()
→ src/components/pdf/EstimateServerDocument.ts

LINE送信用PDF:
POST /api/documents/estimate/[id]/line
→ createEstimateServerDocumentElement()
→ src/components/pdf/EstimateServerDocument.ts
```

問題:

- 管理画面PDFとpublic PDFでコンポーネントが違う
- 管理画面で確認したPDFと取引先が見るPDFが一致しない可能性がある
- LINE routeのローカル保存はDB追跡されていなかった

## 新PDF生成経路

PDF生成は管理者操作のAPIに寄せる。

```txt
POST /api/documents/estimate/[id]/pdf/generate
→ 管理者ログイン確認
→ EstimateDocumentを取得
→ createEstimateServerDocumentElement()
→ PDF Buffer生成
→ EstimatePdfFile draft作成
→ Supabase Storage documents bucketへupload
→ EstimatePdfFileをcurrent化
→ EstimateDocument.currentPdfFileId更新
```

このrouteだけがPDFを生成する。

## 保存済みPDFレイアウトの再発防止ルール

- `EstimateServerDocument.ts` は保存済み見積PDFの正本
- 表ヘッダーは削除しない
- 列幅はヘッダー行と明細行で共通化する
- ヘッダー表記は `金額(税抜)` に統一する
- `お問合せNo` と `金額(税抜)` は1行表示を維持する

## Route別仕様

### GET /documents/estimate/[id]

現在:

- 管理画面PDFページ
- 保存済みPDFを表示

最終方針:

- 保存済みPDFを表示する画面に寄せる
- `EstimateDocument.currentPdfFileId → EstimatePdfFile.storageKey`を参照する
- PDF未生成時は「PDF未生成」表示と生成ボタンを出す

認証:

- 管理者ログイン必須の管理画面

PDF生成:

- 最終的にはここでは生成しない
- 生成/再生成ボタンから`POST /api/documents/estimate/[id]/pdf/generate`を呼ぶ

### POST /api/documents/estimate/[id]/pdf/generate

現在:

- 実装済み
- 管理者ログイン必須
- PDFを生成しSupabase Storageへ保存する

認証:

- `getServerSession(authOptions)`
- 未ログインは401
- B2B共有tokenでは使えない

PDF生成:

- する

Storage:

- bucket: `documents`
- storageKey: `estimates/{estimateDocumentId}/{pdfFileId}.pdf`

### GET /api/documents/estimate/[id]/pdf

現在:

- 実装済み
- 管理者ログイン必須
- 保存済みPDFを返す

目的:

```txt
EstimateDocument.currentPdfFileId
→ EstimatePdfFile.storageKey
→ Supabase Storage documents bucketからdownload
→ Content-Type: application/pdf で返す
```

認証:

- 管理者ログイン必須

PDF生成:

- しない

### GET /customer/repairs/[token]/estimate.pdf

現在:

- public PDF route
- tokenから`EstimateDocument`または`Repair`を特定
- 保存済みPDFを返す
- `f4b33ec Serve saved estimate PDF from public route` で切替済み

方針:

- URLは維持
- token検証は維持
- PDF生成はしない
- 保存済みPDFを返すだけにする
- public URL / signed URL は返さない

flow:

```txt
token検証
→ EstimateDocument特定
→ EstimateDocument.currentPdfFileId取得
→ EstimatePdfFile.storageKey取得
→ Supabase Storage documents bucketからdownload
→ Content-Type: application/pdf で返す
```

認証:

- ログイン不要
- `EstimateDocument.publicToken`または`Repair.publicToken`で認可

PDF生成:

- しない

PDF未生成時:

- `PDF not generated`
- 取引先アクセス時に自動生成しない

### POST /api/documents/estimate/[id]/line

現在:

- LINE送信route
- 保存済みPDFの存在を確認したうえで共有URLのみ送る
- `8e75b2d Require saved estimate PDF before LINE sharing` で切替済み

方針:

- LINE送信時に毎回PDFを生成しない
- LINE送信時にPDFをローカル保存しない
- LINE送信時に別PDFを作らない
- LINEでPDF添付はしない
- 今後もLINEでPDF添付はしない
- `currentPdfFileId` と `storageKey` が存在することを前提にする
- 未生成なら送信停止
- 共有URL内のPDFボタンが保存済みPDFを返す
- `savedFilePath` はレスポンスから削除済み
- `EstimateServerDocument`, `renderToStream`, `fs`, Google Drive保存パスなどはLINE routeから削除済み

認証:

- 管理者操作から呼ぶroute

PDF生成:

- しない

LINE送信内容:

```txt
お見積りを共有いたします。

下記URLより、対象案件・お見積内容をご確認ください。
{sharedUrl}

ご確認後、画面上の「承認」または「差戻し」よりご回答ください。
```

PDF未生成時:

- `currentPdfFileId` または `storageKey` が無い場合は送信停止
- `PDF not generated`

## 請求書共有の方向性

請求書は、見積書と同じく「LINEでURLだけ送る」方式を基本にする。

ただし、見積書のような承認・差戻し機能は不要。

請求書共有ページでは、以下の導線を重視する。

- 請求書番号
- 対象月
- 取引先名
- PDFを開く/ダウンロードする導線

請求書PDF:

- 月次請求として生成する
- Supabase Storageに保存する方向
- URL先で請求書PDFを確認・ダウンロードできるようにする
- LINEでPDF添付はしない
- メール必須にはしない

請求書LINE送信内容:

```txt
いつもお世話になり有難うございます。
〇月分の請求書を発行いたしました。

下記URLより請求書PDFをご確認ください。
{請求書共有URL}

よろしくお願いいたします。
```

補足ルール:

- `{請求書共有URL}` は `https://` から始まる完全URLにする
- LINE上で自動的にクリック可能なURLにする
- 請求金額はLINE本文には記載しない
- 支払期限も現時点では本文に必須ではない
- PDF添付はしない

## 生成するroute / 生成しないroute

PDFを生成する:

- `POST /api/documents/estimate/[id]/pdf/generate`

PDFを生成しない:

- `GET /documents/estimate/[id]`
- `GET /api/documents/estimate/[id]/pdf`
- `GET /customer/repairs/[token]/estimate.pdf`
- `POST /api/documents/estimate/[id]/line`

## 2026-05-24 現在の完成状態

見積書PDFは保存済みPDFを正本とする。

管理画面PDF、B2B共有画面PDF、LINE共有後に取引先が見るPDFは、同じ保存済みPDFを参照する。

実装済みroute:

- `POST /api/documents/estimate/[id]/pdf/generate`
- `GET /api/documents/estimate/[id]/pdf`
- `GET /customer/repairs/[token]/estimate.pdf`
- `POST /api/documents/estimate/[id]/line`

管理画面UI:

- `/documents/estimate/[id]` に見積書PDF操作ボタンを復旧済み。
- 保存済みPDFなし: `PDFを生成`
- 保存済みPDFあり: `PDFを開く` / `PDFを生成` / `LINEで送信`

LINE送信方針:

- LINEではB2B共有ページURLのみ送る。
- PDF添付はしない。
- PDF route URLを直接送らない。
- signed URL / public storage URL は送らない。
- LINE送信時にPDF生成・保存は行わない。
- 保存済みPDFが無い場合はLINE送信を停止する。

認証:

- `POST /api/documents/estimate/[id]/line` は `getServerSession(authOptions)` による管理者認証を追加済み。
- 未ログイン時は `401 Unauthorized`。

## 管理画面操作フロー

見積書・請求書共通の管理画面操作フロー:

1. 帳票作成後、帳票詳細ページでPDFを生成する。
2. PDFを開いて確認する。
3. 問題なければLINEで送信する。
4. LINEで送るのは共有ページURLのみ。

共通UI:

- 保存済みPDFなし: `PDFを生成`
- 保存済みPDFあり: `PDFを開く` / `PDFを生成` / `LINEで送信`

`PDFを生成` は、保存済みPDFが既にある場合でも現在の内容で新しいPDFを生成し、`current` を更新する。旧PDFは `superseded` 扱いになる。
