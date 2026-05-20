# 見積PDF保存・共有基盤 変更履歴

## 75950fd Improve B2B shared repair card header layout

目的:

B2B共有ページの案件カード上部がスマホで見切れていたため、カードヘッダーを整理した。

主な変更ファイル:

- `src/app/customer/repairs/[token]/page.tsx`

変更内容:

- ステータスチップを単独行化
- 2行目: エンドユーザー名 / 管理番号 / お問合番号
- 3行目: ブランド / モデル名
- 4行目: Ref / Serial
- 「顧客名」という表現を避け、B2B共有カードでは`Repair.endUserName`をエンドユーザー名として扱う
- `お客様 様` / `氏名未登録` / `管 -` / `貴社管理番号:` / `案件番号:`を出さない方針

なぜ必要だったか:

B2B共有画面は取引先が見る画面であり、案件カード上部が崩れると案件の識別性が落ちるため。特にB2Bでは、共有カードに出る名前は取引先名ではなくエンドユーザー名である必要がある。

触っていないもの:

- PDF生成route
- PDFコンポーネント
- Prisma schema / migration
- LINE送信処理

確認結果:

- B2B共有ページのカードヘッダーが整理された
- 取引先向けカードで曖昧な「顧客名」表現を避ける方針を確認

## ecaee3a Add estimate PDF file schema

目的:

見積PDFを保存済みファイルとしてDB追跡できるようにするためのschema土台を追加した。

主な変更ファイル:

- `prisma/schema.prisma`
- `prisma/migrations/20260520_add_estimate_pdf_files/migration.sql`

変更内容:

- `EstimatePdfFile` modelを追加
- `EstimateDocument.currentPdfFileId`を追加
- `EstimateDocument.pdfFiles`を追加
- `EstimatePdfFile.estimateDocument` relationを追加
- `EstimateDocument.currentPdfFile`と`EstimatePdfFile.currentForDocument` relationを追加
- `@@unique([estimateDocumentId, version])`を追加
- `customerId`はnullable
- `EstimateDocument`削除時、紐づくPDF file recordはCascade
- `Customer`削除時、`EstimatePdfFile.customerId`はSetNull

なぜ必要だったか:

管理画面・B2B共有画面・LINE送信が同じ保存済みPDFを参照するためには、Storage上のPDFと見積書をDBで追跡する必要があるため。

触っていないもの:

- Storage helper
- PDF生成API
- public PDF route
- 管理画面UI
- LINE送信処理

確認結果:

- `npx.cmd prisma validate` 成功
- `npx.cmd tsc --noEmit` 成功

## b20d4b3 Add estimate PDF storage helpers

目的:

見積PDFをSupabase Storage private bucketに保存・取得するserver専用helperを追加した。

主な変更ファイル:

- `src/lib/supabase-admin.ts`
- `src/lib/estimate-pdf-storage.ts`

変更内容:

- `getSupabaseAdminClient`
- `buildEstimatePdfStorageKey`
- `uploadEstimatePdf`
- `downloadEstimatePdf`
- `deleteEstimatePdf`
- `calculatePdfHash`
- bucket名は`documents`
- storageKey形式は`estimates/{estimateDocumentId}/{pdfFileId}.pdf`
- `SUPABASE_SERVICE_ROLE_KEY`を使う
- `NEXT_PUBLIC_`のservice role keyは使わない
- `server-only`を使い、client bundleに混ざらない設計

なぜ必要だったか:

写真用Storage helperはpublic表示前提であり、見積PDFはprivate bucket・server専用・binary download/uploadが必要なため、責務を分ける必要があった。

触っていないもの:

- Prisma schema / migration
- PDF生成API
- public PDF route
- 管理画面UI
- LINE送信処理

確認結果:

- `npx.cmd prisma validate` 成功
- `npx.cmd tsc --noEmit` 成功

## a549524 Add estimate PDF generation storage API

目的:

管理者操作で見積PDFを生成し、Supabase Storageに保存し、DBの`currentPdfFileId`を更新するAPIを追加した。

主な変更ファイル:

- `src/app/api/documents/estimate/[id]/pdf/generate/route.ts`

変更内容:

- `POST /api/documents/estimate/[id]/pdf/generate`を追加
- `getServerSession(authOptions)`による管理者ログイン必須化
- `EstimateDocument`からPDF生成に必要なデータを取得
- `createEstimateServerDocumentElement`を使ってserver側でPDF生成
- `EstimatePdfFile`をまず`draft`で仮作成
- `pdfFile.id`からstorageKeyを生成
- Supabase Storage `documents` bucketへupload
- `hash` / `fileSize` / `storageKey`を保存
- 新PDFを`current`にする
- 古いcurrentを`superseded`にする
- `EstimateDocument.currentPdfFileId`を新PDFへ更新
- upload失敗時は仮recordを`void`
- upload後のDB更新失敗時はStorage削除を試行し、recordを`void`

なぜ必要だったか:

管理画面で確認するPDF、B2B共有画面で返すPDF、LINE送信で案内するPDFを、同じ保存済みファイルに統一する起点として、管理者が明示的にPDFを生成・保存できるAPIが必要だった。

触っていないもの:

- 管理画面UI
- public PDF route
- LINE送信処理
- PDFコンポーネント
- Prisma schema / migration

確認結果:

- `npx.cmd prisma validate` 成功
- `npx.cmd tsc --noEmit` 成功
- ローカルで`EstimateDocument.id = 13`のPDF生成API成功
- `EstimatePdfFile.id = 3`
- `storageKey = estimates/13/3.pdf`
- `fileSize = 78876`
- `status = current`
- `version = 3`
