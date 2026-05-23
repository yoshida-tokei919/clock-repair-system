# Task 042: 見積書・請求書PDF共有フロー 本番反映前チェックリスト

## 1. 目的

見積書・請求書PDF共有フローを本番環境へ反映する前に、DB、Storage、環境変数、LINE送信、公開URL、管理画面操作を確認するためのチェックリスト。

## 2. 対象範囲

- 見積書PDF保存・共有
- 請求書PDF保存・共有
- 管理画面PDF操作ボタン
- B2B共有ページ
- 請求書共有ページ
- public PDF route
- LINE共有URL送信
- Supabase Storage documents bucket
- Railway環境変数
- 本番DB migration

## 3. 本番反映前の現在状態

### 見積書

管理画面:

- `/documents/estimate/[id]`
- PDFを生成
- PDFを開く
- LINEで送信

API / route:

- `POST /api/documents/estimate/[id]/pdf/generate`
- `GET /api/documents/estimate/[id]/pdf`
- `GET /customer/repairs/[token]/estimate.pdf`
- `POST /api/documents/estimate/[id]/line`

方針:

- 保存済みPDFを正本とする
- LINEではB2B共有ページURLのみ送る
- PDF添付なし
- PDF未生成時はLINE送信停止

### 請求書

管理画面:

- `/documents/invoice/[id]`
- PDFを生成
- PDFを開く
- LINEで送信

API / route:

- `POST /api/invoices/[id]/pdf/generate`
- `GET /api/invoices/[id]/pdf`
- `GET /customer/invoices/[token]`
- `GET /customer/invoices/[token]/invoice.pdf`
- `POST /api/invoices/[id]/line`

方針:

- 保存済みPDFを正本とする
- LINEでは請求書共有ページURLのみ送る
- PDF添付なし
- 請求金額はLINE本文に書かない
- PDF未生成時はLINE送信停止

## 4. 本番DB migration確認

- [ ] 本番DBへ適用するmigration一覧を確認する
- [ ] `prisma/migrations/20260522_add_invoice_pdf_files/migration.sql` が含まれることを確認する
- [ ] `Invoice` に `billingMonth` / `publicToken` / `publicTokenCreatedAt` / `currentPdfFileId` / `sentAt` が追加されることを確認する
- [ ] `InvoicePdfFile` table が作成されることを確認する
- [ ] `Customer.invoicePdfFiles` relation に対応するDB構造を確認する
- [ ] 本番DB適用前にバックアップ方針を確認する
- [ ] 本番DBへ `migrate deploy` を使うか、Railway deploy時にどう適用するか決める
- [ ] Supabase直接DBとPrisma接続先の `DATABASE_URL` / `DIRECT_URL` を確認する

注意:

- ローカルでは `db push` を使ったが、本番反映では不用意に `db push` しない。
- 本番は migration 適用方針を決めてから実施する。

## 5. Supabase Storage確認

- [ ] `documents` bucket が存在する
- [ ] `documents` bucket はprivate運用である
- [ ] service role key経由でupload/downloadできる
- [ ] public bucket / public URL を使っていない
- [ ] signed URL を返していない
- [ ] storageKey方針を確認する
  - `estimates/...`
  - `invoices/{invoiceId}/{pdfFileId}.pdf`

## 6. Railway / env確認

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `NEXTAUTH_SECRET`
- [ ] `NEXTAUTH_URL`
- [ ] `NEXT_PUBLIC_APP_URL` または共有URL生成に使うbase URL
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `LINE_CHANNEL_ACCESS_TOKEN`

注意:

- `SUPABASE_SERVICE_ROLE_KEY` は server-only で使う。
- `NEXT_PUBLIC_` に service role key を入れない。
- 共有URLが `localhost` ではなく本番ドメインになることを確認する。

## 7. 見積書 本番確認手順

- [ ] 本番でテスト用B2B取引先を用意する
- [ ] テスト用lineIdを入れる
- [ ] 修理一覧で複数案件を選択する
- [ ] 見積書を作成する
- [ ] `/documents/estimate/[id]` を開く
- [ ] PDFを生成する
- [ ] PDFを開く
- [ ] 文字化けがない
- [ ] 金額・明細・見出しが正しい
- [ ] LINEで送信を押す
- [ ] 確認ダイアログが出る
- [ ] LINEに共有ページURLだけ届く
- [ ] PDF添付されていない
- [ ] `/customer/repairs/[token]` が本番ドメインで開く
- [ ] PDFボタンから保存済みPDFが開く

## 8. 請求書 本番確認手順

- [ ] 本番でテスト用B2B取引先を用意する
- [ ] テスト用lineIdを入れる
- [ ] 5月など対象月の納品書を用意する
- [ ] `/invoices` で対象月・取引先を選択する
- [ ] 納品済み未請求案件が表示される
- [ ] 請求書を作成する
- [ ] `/documents/invoice/[id]` を開く
- [ ] PDFを生成する
- [ ] PDFを開く
- [ ] 1明細=1納品書になっている
- [ ] 納品点数が「点」表示になっている
- [ ] 住所が正しい
- [ ] 振込先に三井住友銀行 店番411 がある
- [ ] 文字化けがない
- [ ] LINEで送信を押す
- [ ] 確認ダイアログが出る
- [ ] LINEに請求書共有ページURLだけ届く
- [ ] PDF添付されていない
- [ ] 請求金額がLINE本文に書かれていない
- [ ] `/customer/invoices/[token]` が本番ドメインで開く
- [ ] `/customer/invoices/[token]/invoice.pdf` が保存済みPDFを返す

## 9. URL確認

- [ ] LINE本文内URLが `localhost` ではない
- [ ] `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` が本番URLになっている
- [ ] `/customer/repairs/[token]` がログインなしで開く
- [ ] `/customer/invoices/[token]` がログインなしで開く
- [ ] PDF route がログインなしで開くべきものだけ開く
- [ ] 管理者用PDF APIはログイン必須

## 10. セキュリティ確認

- [ ] 管理画面のPDF生成・LINE送信はログイン必須
- [ ] 見積書LINE送信APIは認証済み
- [ ] 請求書LINE送信APIは認証済み
- [ ] public共有ページはtoken検証あり
- [ ] public PDF routeはtoken検証あり
- [ ] Supabase public URL / signed URL を返していない
- [ ] LINE送信時にPDF生成しない
- [ ] LINE送信時にPDF添付しない

## 11. リリース判断

### Go条件

- 本番DB migration成功
- Storage upload/download成功
- 見積書PDF生成・共有・LINE送信成功
- 請求書PDF生成・共有・LINE送信成功
- URLが本番ドメイン
- PDF添付なし

### No-Go条件

- migration未適用
- PDF生成失敗
- Storage保存失敗
- LINE URLがlocalhost
- PDF添付される
- public routeがtokenなしで開く
- 管理者APIが未ログインで動く

## 12. リリース後にやること

- [ ] 実取引先1社で小さく試す
- [ ] LINE本文の見え方確認
- [ ] スマホで共有ページ表示確認
- [ ] PDFダウンロード確認
- [ ] 問題なければ他取引先へ拡大
- [ ] 修理スケジュール / 作業キューに着手
- [ ] 部品検索ワード生成・複数サイト検索の詰め

## 今回やらないこと

- コード変更禁止
- API変更禁止
- Prisma schema / migration変更禁止
- UI変更禁止
- `.env` / `.env.local` を触らない
- `.next-dev.err.log` を触らない
- 本番DB / Supabase / Railway DB を触らない
- `git add .` 禁止
- commit禁止
