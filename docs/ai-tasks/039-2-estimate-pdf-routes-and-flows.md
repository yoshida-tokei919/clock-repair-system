# 見積PDF route / flow整理

## 絶対方針

- public PDF routeではPDFを生成しない
- public PDF routeは保存済みPDFを返すだけにする
- 共有画面アクセス時にPDFを都度生成しない
- 管理画面で確認したPDFと共有PDFは同じstorageKeyを参照する

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

## Route別仕様

### GET /documents/estimate/[id]

現在:

- 管理画面PDFページ
- `EstimatePDFClient`で動的PDF previewを生成

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

- 未実装

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
- server側PDFを都度生成して返す

最終方針:

- URLは維持
- token検証は維持
- PDF生成はしない
- 保存済みPDFを返すだけにする

想定flow:

```txt
token検証
→ EstimateDocument特定
→ currentPdfFile取得
→ storageKey取得
→ Supabase Storage documents bucketからdownload
→ Content-Type: application/pdf で返す
```

認証:

- ログイン不要
- `EstimateDocument.publicToken`または`Repair.publicToken`で認可

PDF生成:

- しない

PDF未生成時:

- 404またはPDF未生成エラー
- 取引先アクセス時に自動生成しない

### POST /api/documents/estimate/[id]/line

現在:

- LINE送信route
- `EstimateServerDocument.ts`でPDF生成しローカル保存している
- LINEには共有URLを送る

最終方針:

- LINE送信時に毎回PDFを生成しない
- `currentPdfFile`が存在することを前提にする
- 未生成なら送信停止
- 共有URL内のPDFボタンが保存済みPDFを返す

認証:

- 管理者操作から呼ぶroute

PDF生成:

- しない

## 生成するroute / 生成しないroute

PDFを生成する:

- `POST /api/documents/estimate/[id]/pdf/generate`

PDFを生成しない:

- `GET /documents/estimate/[id]`
- `GET /api/documents/estimate/[id]/pdf`
- `GET /customer/repairs/[token]/estimate.pdf`
- `POST /api/documents/estimate/[id]/line`
