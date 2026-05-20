# 見積PDF DB / Storage設計

## 基本方針

```txt
EstimateDocument.currentPdfFileId
→ EstimatePdfFile.storageKey
→ Supabase Storage documents bucket
```

管理画面・B2B共有画面・LINE送信は、最終的にこの参照経路へ寄せる。

## EstimatePdfFile model

目的:

見積PDFを保存済みファイルとして追跡する。

主なfield:

- `id`
- `estimateDocumentId`
- `customerId`
- `storageKey`
- `fileName`
- `contentType`
- `fileSize`
- `hash`
- `version`
- `status`
- `generatedAt`
- `generatedBy`
- `sentAt`
- `approvedAt`
- `supersededAt`

制約:

- `@@unique([estimateDocumentId, version])`
- `@@index([estimateDocumentId])`
- `@@index([customerId])`
- `@@index([status])`

## EstimateDocument.currentPdfFileId

`EstimateDocument.currentPdfFileId` は現在提示中のPDFを指すnullable field。

nullableである理由:

- 既存見積書はPDF未生成でも成立する
- PDF生成前の状態を許容する
- 生成失敗時にcurrentなし状態を許容する

## relation設計

`EstimateDocument`から見たrelation:

- `pdfFiles`: その見積書に紐づく全PDF版
- `currentPdfFile`: 現在提示中PDF

`EstimatePdfFile`から見たrelation:

- `estimateDocument`: 所属する見積書
- `currentForDocument`: currentとして参照されている場合の逆relation
- `customer`: nullableな顧客参照

削除方針:

- `EstimateDocument`削除時、紐づく`EstimatePdfFile`はCascade
- `Customer`削除時、`EstimatePdfFile.customerId`はSetNull

## status設計

現在はStringで管理する。

想定値:

- `draft`: 生成処理中の仮record
- `current`: 現在提示中
- `sent`: 送信済み
- `approved`: 承認済み
- `superseded`: 差し替え済み
- `void`: 生成失敗・無効

現時点の実装:

- 生成APIは仮recordを`draft`で作成
- upload成功後に`current`
- 古い`current`は`superseded`
- upload失敗やDB更新失敗時は`void`

## version採番

見積書単位で採番する。

```txt
max(version) + 1
```

`@@unique([estimateDocumentId, version])` により、同一見積書内のversion重複を防ぐ。

注意:

- 失敗した`void` recordもversionを消費する
- ローカル確認では`id = 1`, `id = 2`が失敗テスト分で`void`
- 成功版は`version = 3`

## storageKey規則

bucket:

```txt
documents
```

storageKey:

```txt
estimates/{estimateDocumentId}/{pdfFileId}.pdf
```

例:

```txt
estimates/13/3.pdf
```

理由:

- `EstimateDocument`単位でまとまる
- `EstimatePdfFile.id`と対応しやすい
- version名ではなくDB idを使うため衝突しにくい
- URL推測困難性に頼らず、route側の認証/token検証で守る

## Supabase bucket方針

- bucket名: `documents`
- private bucket
- public URLは返さない
- route側で認証/token検証してからdownloadして返す

## service role key扱い

- `SUPABASE_SERVICE_ROLE_KEY`はserver専用
- `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`は絶対禁止
- `src/lib/supabase-admin.ts`でserver専用clientを作る
- `server-only`を使い、client bundleへの混入を防ぐ

## ローカル動作確認記録

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
