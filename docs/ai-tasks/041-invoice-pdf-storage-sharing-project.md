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

## 8. 請求書共有ページUI方針

請求書共有ページは、既存のB2B見積書共有ページのデザイン方針に統一する。

### 共通方針

- 白背景
- 青アクセント
- 角丸カード
- スマホ前提
- B2B業務アプリらしい清潔感
- ログイン不要のtoken route
- PDF確認ボタンを中心にする
- LINEで共有URLを開いた取引先が迷わずPDF確認できる構成にする

### 見積書共有ページと共通にするもの

- ヨシダ時計修理工房としての見た目
- 余白、カード、ボタン、色味
- PDFボタンの導線
- 共有URLからログインなしで開けること

### 請求書共有ページで不要なもの

- 承認ボタン
- 差戻しボタン
- コメント欄
- 見積承認ワークフロー

### 請求書共有ページに表示する内容

請求書共有ページでは以下を表示する。

概要:

- 請求書番号
- 対象月
- 取引先名
- 発行日
- 支払期限

主導線:

- 請求書PDFを開く
- PDFをダウンロード

明細:

- 1明細 = 1納品書
- 納品書番号
- 納品日
- 納品点数
- 金額

下部:

- ご不明点がございましたら、ヨシダ時計修理工房までお問い合わせください。

### 見積書共有ページとの違い

見積書共有:

- 目的: 内容確認・承認/差戻し
- 承認/差戻し/コメント欄あり

請求書共有:

- 目的: 請求書PDF確認・保存
- 承認/差戻し/コメント欄なし
- PDF確認と請求概要確認に特化する

### デザイン統一ルール

請求書共有ページは、見積書共有ページと別サービスのように見えないようにする。

取引先から見て、同じヨシダ時計修理工房の業務ページとして自然に見えるUIにする。

## 9. 推奨実装順

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

## 2026-05-24 現在の完成状態

請求書PDFは保存済みPDFを正本とする。

管理画面PDF、請求書共有ページPDF、LINE共有後に取引先が見るPDFは、同じ保存済みPDFを参照する。

実装済みDB:

- `Invoice.billingMonth`
- `Invoice.publicToken`
- `Invoice.publicTokenCreatedAt`
- `Invoice.currentPdfFileId`
- `Invoice.sentAt`
- `InvoicePdfFile`

実装済みroute:

- `POST /api/invoices/[id]/pdf/generate`
- `GET /api/invoices/[id]/pdf`
- `GET /customer/invoices/[token]`
- `GET /customer/invoices/[token]/invoice.pdf`
- `POST /api/invoices/[id]/line`

管理画面UI:

- `/documents/invoice/[id]` に請求書PDF操作ボタンを追加済み。
- 保存済みPDFなし: `PDFを生成`
- 保存済みPDFあり: `PDFを開く` / `PDFを生成` / `LINEで送信`

`PDFを生成` は、保存済みPDFが既にある場合でも現在の内容で新しいPDFを生成し、`current` を更新する。旧PDFは `superseded` 扱いになる。

## 請求書共有ページ

`/customer/invoices/[token]` を追加済み。

- `Invoice.publicToken` で検証する。
- 見積書共有ページと同じ白背景、青アクセント、角丸カード、スマホ前提のUI方針。
- 承認、差戻し、コメント欄は不要。
- PDF確認と請求概要確認に特化する。

public PDF route:

- `/customer/invoices/[token]/invoice.pdf` は保存済みPDFのみ返す。
- PDFを都度生成しない。
- public URL / signed URL は返さない。

## LINE送信方針

- LINEでは請求書共有ページURLのみ送る。
- PDF添付はしない。
- PDF route URLを直接送らない。
- signed URL / public storage URL は送らない。
- 請求金額はLINE本文に書かない。
- LINE送信時にPDF生成・保存は行わない。
- 保存済みPDFが無い場合はLINE送信を停止する。

LINE本文:

```text
いつもお世話になり有難うございます。
〇月分の請求書を発行いたしました。

下記URLより請求書PDFをご確認ください。
{請求書共有URL}

よろしくお願いいたします。
```

## 請求書PDF表示仕様

請求書明細は `1明細 = 1納品書` とする。

明細列:

- 納品書番号
- 納品日
- 納品点数
- 金額

納品点数の単位は `点`。

修正済み表示内容:

- 自社住所: `〒651-1213 神戸市北区広陵町1-162-1-401`
- 振込先: `三井住友銀行　店番411`
- 振込先: `普通 3602468`
- 振込先: `ヨシダ シュウヘイ`

請求書PDFの文字化けは修正済み。

## 管理画面操作フロー

見積書・請求書共通の管理画面操作フロー:

1. 帳票作成後、帳票詳細ページでPDFを生成する。
2. PDFを開いて確認する。
3. 問題なければLINEで送信する。
4. LINEで送るのは共有ページURLのみ。

共通UI:

- 保存済みPDFなし: `PDFを生成`
- 保存済みPDFあり: `PDFを開く` / `PDFを生成` / `LINEで送信`
