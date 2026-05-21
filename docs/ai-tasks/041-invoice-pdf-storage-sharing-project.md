# Task 041: 請求書PDF保存・共有基盤プロジェクト設計

## 目的

既存の請求書生成・表示・月次請求フロー調査結果をもとに、請求書PDFをSupabase Storageに保存し、LINEでは共有URLのみ送るための設計方針を整理する。

今回は設計md作成のみとし、実装コード・DB・API・UI・環境変数・外部サービスには触れない。

## 前提方針

- 請求書は `/invoices` の月次請求画面を正式導線にする
- 請求書PDFはSupabase Storageに保存する
- LINEでは請求書共有URLのみ送る
- PDF添付はしない
- メール必須にしない
- LINE本文に請求金額は書かない
- 見積書のような承認・差戻し機能は不要

## 請求書LINE文面

```text
いつもお世話になり有難うございます。
〇月分の請求書を発行いたしました。

下記URLより請求書PDFをご確認ください。
{請求書共有URL}

よろしくお願いいたします。
```

## 1. 現在のInvoice model

### fields

- `id`
- `invoiceNumber`
- `issuedDate`
- `customerId`
- `totalAmount`
- `taxAmount`
- `status`
- `paymentDueDate`

### relation

- `Customer`
- `Repair[]`

### 現状

- `publicToken` なし
- PDF保存fieldなし
- `currentPdfFileId` なし
- 対象月fieldなし
- `sentAt` なし
- `status` は `issued` / `paid` 想定

## 2. 現在の請求書生成導線

### `/invoices`

- 発行済み一覧
- 月次請求書を新規作成

### `/api/invoices/preview`

- `customerId` と `month=YYYY-MM` を受ける
- `invoiceId: null`
- `deliveryDateActual` が対象月内
- 上記条件に一致する `Repair` を返す

### `/api/invoices`

- `POST` で `customerId`, `repairIds`, `paymentDueDate` から `Invoice` を作成する
- `Repair` を接続する
- `Customer.seqInvoice` を更新する

### 生成後

- UI側で `invoice.id` を受け取る
- `/documents/invoice/[id]` へ遷移する

## 3. `generateBulkDocument(..., "invoice")` の扱い

- `document-actions.ts` には `invoice` 分岐がある
- ただし `RepairsTableClient` では一括ボタンは `estimate` / `delivery` のみ
- 修理一覧に請求書一括生成ボタンは出ていない
- 正式導線は `/invoices` の月次請求画面とみなす
- `generateBulkDocument(..., "invoice")` は残存/未使用寄り
- 今後は月次請求画面へ一本化する方が安全

## 4. 現在の請求書PDF表示

### `/documents/invoice/[id]`

- `prisma.invoice.findUnique` で以下を取得する
- `customer`
- `repairs`
- `watch`
- `estimate items`
- `deliveryNote`
- 取得結果を `pdfData` に変換する
- `InvoicePDFClient` へ渡す

### `InvoiceDocument.tsx`

- `@react-pdf/renderer` のPDF帳票本体
- 請求書番号、発行日、支払期限、明細、合計、振込先を描画する

### `InvoicePDFClient`

- `usePDF` でclient側生成する
- `iframe` 表示とdownload linkを出す

### 現状

- PDF保存処理なし
- DB追跡なし
- Supabase Storage保存なし

## 5. 請求書保存・共有に必要な設計候補

### DB設計候補

- `InvoicePdfFile` model
- `Invoice.currentPdfFileId`
- `Invoice.publicToken`
- `Invoice.publicTokenCreatedAt`
- `Invoice.billingMonth`
- `Invoice.sentAt`

### PDF保存route候補

- `POST /api/invoices/[id]/pdf/generate`
- `GET /api/invoices/[id]/pdf`

### public共有route候補

- `/customer/invoices/[token]`
- `/customer/invoices/[token]/invoice.pdf`

### LINE送信route候補

- `POST /api/invoices/[id]/line`

## 6. `billingMonth` 方針

現状 `Invoice` には対象月fieldがない。

請求書共有ページやLINE本文で「〇月分」を表示するには、`Invoice` に対象月を保持した方が安全。

- 候補は `billingMonth String?`
- 値は `YYYY-MM` 形式
- 表示時に `YYYY年M月分` に変換する

`billingMonth` は今回の共有基盤で特に重要なfield。請求書PDF保存後やLINE送信後に、対象月を修理の納品日から都度推測すると、後続の修正・再発行・対象修理の変更に弱くなる。月次請求を正式導線にするなら、請求書作成時点の対象月を `Invoice` に保存する設計を優先する。

## 7. 見積書PDF保存基盤との共通点・違い

### 共通点

- PDFをSupabase Storage private bucket `documents` に保存する
- `currentPdfFileId` から `storageKey` で参照する
- 管理画面も共有画面も同じ保存済みPDFを見る
- public URL / signed URLは返さない
- LINEではURLのみ送る

### 違い

- 請求書には承認/差戻し不要
- 請求書は月次請求
- 請求書には対象月が必要
- 請求書は `/invoices` を正式導線にする

## 8. 推奨実装順

### Step 1

`Invoice` に `billingMonth` / `publicToken` / `currentPdfFileId` などのDB設計を追加する。

### Step 2

`InvoicePdfFile` modelを追加する。

### Step 3

請求書PDF server-side生成/保存APIを追加する。

### Step 4

管理画面 `/documents/invoice/[id]` を保存済みPDF表示へ変更する。

### Step 5

請求書共有ページ `/customer/invoices/[token]` を追加する。

### Step 6

public PDF route `/customer/invoices/[token]/invoice.pdf` を追加する。

### Step 7

LINE共有URL送信APIを追加する。

## 未確定事項

- `InvoicePdfFile` の詳細field構成
- `storageKey` の命名規則
- 請求書PDFの再生成時に旧PDFを保持するかどうか
- `publicToken` を既存請求書へどのタイミングで付与するか
- `billingMonth` を既存請求書へバックフィルするかどうか
- LINE送信済み判定を `sentAt` のみで足りるとするか、送信履歴modelを別途持つか

## 絶対にやらないこと

- 実装コード変更禁止
- API追加禁止
- route変更禁止
- Prisma schema変更禁止
- migration作成禁止
- UI変更禁止
- LINE送信処理変更禁止
- PDFコンポーネント変更禁止
- `.env` / `.env.local` を触らない
- `.next-dev.err.log` を触らない
- 本番DB / Supabase / Railway DB を触らない
- `git add .` 禁止
- commit禁止
