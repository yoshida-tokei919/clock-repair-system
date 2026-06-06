# Task 107-23: ローカル環境の見積書・請求書PDF Storage接続問題を調査

## 1. 概要

ローカル環境で見積書・請求書PDFが以下のエラーで表示できない問題を調査した。

```txt
{"ok":false,"error":"PDF download failed"}
{"ok":false,"error":"Invoice PDF download failed"}
```

Task 107-19で切り分けた通り、RepairLineItem（案件明細）変更ではなく、Supabase Storage download時の接続問題である。

このTaskではRepairLineItem関連コード、schema、DB、Storageファイルは変更していない。

## 2. git状態

調査開始時:

```txt
git status --short
# 空
```

## 3. .env.local / .env のSUPABASE関連変数確認結果

値そのものは秘匿し、設定有無とホスト名のみ確認した。

`.env.local`:

```txt
SUPABASE_URL: set
SUPABASE_URL host: vpyjonjfpkpbvvjufbiu.supabase.co
SUPABASE_SERVICE_ROLE_KEY: set
```

`.env`:

```txt
NEXT_PUBLIC_SUPABASE_URL: set
NEXT_PUBLIC_SUPABASE_URL host: vpyjonjfpkpbvvjufbiu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY: set
```

確認結果:

```txt
.env.local の SUPABASE_URL と .env の NEXT_PUBLIC_SUPABASE_URL は同じproject refを向いている。
サーバー側で必要な SUPABASE_SERVICE_ROLE_KEY は .env.local に設定されている。
```

## 4. SUPABASE_URLのDNS確認結果

対象ホスト:

```txt
vpyjonjfpkpbvvjufbiu.supabase.co
```

実行:

```powershell
nslookup vpyjonjfpkpbvvjufbiu.supabase.co
```

結果:

```txt
can't find vpyjonjfpkpbvvjufbiu.supabase.co: Non-existent domain
```

比較確認:

```powershell
nslookup supabase.co
nslookup google.com
```

結果:

```txt
supabase.co は解決できる
google.com は解決できる
```

つまり、ローカルDNS全体の障害ではなく、設定されているSupabase project hostがDNS上で解決できない状態。

## 5. 443疎通確認結果

対象:

```txt
vpyjonjfpkpbvvjufbiu.supabase.co:443
```

実行:

```powershell
Test-NetConnection vpyjonjfpkpbvvjufbiu.supabase.co -Port 443
```

結果:

```txt
Name resolution of vpyjonjfpkpbvvjufbiu.supabase.co failed
PingSucceeded: False
```

比較:

```powershell
Test-NetConnection supabase.co -Port 443
```

結果:

```txt
TcpTestSucceeded: True
```

## 6. Invoke-WebRequest確認結果

実行:

```powershell
Invoke-WebRequest "https://vpyjonjfpkpbvvjufbiu.supabase.co" -Method Head
```

結果:

```txt
The remote name could not be resolved: 'vpyjonjfpkpbvvjufbiu.supabase.co'
```

## 7. 見積書download route確認結果

対象:

```txt
src/app/api/documents/estimate/[id]/pdf/route.ts
src/lib/estimate-pdf-storage.ts
```

処理:

```txt
EstimateDocument.currentPdfFileId を参照
EstimatePdfFile.storageKey を取得
downloadEstimatePdf(storageKey) を呼ぶ
Supabase Storage の documents bucket から download する
```

対象PDF:

```txt
estimateNumber: YE-010
storageKey: estimates/14/12.pdf
fileName: estimate_YE-010.pdf
```

環境変数参照:

```txt
getSupabaseAdminClient()
  SUPABASE_URL
  fallback: NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
```

確認結果:

```txt
route / storageKey / bucket名の明らかな不整合は見つからない。
失敗箇所はStorage download時の接続先到達前段。
```

## 8. 請求書download route確認結果

対象:

```txt
src/app/api/invoices/[id]/pdf/route.ts
src/lib/invoice-pdf-storage.ts
```

処理:

```txt
Invoice.currentPdfFileId を参照
InvoicePdfFile.storageKey を取得
downloadInvoicePdf(storageKey) を呼ぶ
Supabase Storage の documents bucket から download する
```

対象PDF:

```txt
invoiceNumber: YI-003
storageKey: invoices/6/6.pdf
fileName: invoice_YI-003.pdf
```

確認結果:

```txt
route / storageKey / bucket名の明らかな不整合は見つからない。
見積書と同じく、失敗箇所はStorage download時の接続先到達前段。
```

## 9. 納品書が正常な理由

納品書は保存済みPDFをSupabase Storageからdownloadする方式ではない。

対象:

```txt
src/app/documents/delivery/[id]/page.tsx
```

処理:

```txt
DeliveryNote
Repair
EstimateItem
```

をDBから読み、`DeliveryPDFClient` へ渡して画面側で表示している。

そのため、Supabase Storage download失敗の影響を受けない。

## 10. 原因

原因:

```txt
.env.local / .env に設定されている Supabase project host がDNS解決できない。
```

具体的には以下。

```txt
vpyjonjfpkpbvvjufbiu.supabase.co
```

が `Non-existent domain` になっている。

可能性:

```txt
Supabase project refが古い
Supabase projectが削除済みまたは無効
.env.local / .env のURLが誤っている
現在の正しいproject URLへ更新されていない
```

ローカルDNS全体の障害ではない根拠:

```txt
supabase.co はDNS解決できる
supabase.co:443 は接続できる
google.com もDNS解決できる
```

## 11. 修正した場合は変更内容

このTaskでは修正していない。

理由:

```txt
正しいSupabase project URL / project refをこの環境から確認できなかった。
Supabase connectorは認証トークン期限切れでプロジェクト一覧を取得できなかった。
project URLを推測で .env.local に書き込むのは危険。
```

Supabase connector確認結果:

```txt
Provided authentication token is expired. Please try signing in again.
```

## 12. 修正しなかった場合は理由

`.env.local` の `SUPABASE_URL` を正しい値へ直す必要がある可能性が高い。

ただし、正しいproject refが未確認のため、Codex側で勝手に値を変更しなかった。

必要な次アクション:

```txt
Supabase Dashboardで現在有効なProject URLを確認する
またはSupabase connectorへ再ログインしてproject一覧を取得する
.env.local の SUPABASE_URL を現在有効なURLへ更新する
必要なら .env の NEXT_PUBLIC_SUPABASE_URL も同じprojectへ揃える
Next dev serverを再起動する
```

## 13. RepairLineItem関連コードに触れていないこと

このTaskではRepairLineItem関連コードを変更していない。

触っていないもの:

```txt
src/lib/repair-line-items.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
prisma/schema.prisma
```

## 14. 確認コマンド結果

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success
```

## 15. 次Task案

```txt
Task 107-24:
Supabase project URLを正しい値へ更新し、見積書・請求書PDF downloadを再確認する。
```

実施内容候補:

```txt
Supabase connectorへ再ログインする
現在のSupabase project URLを確認する
.env.local の SUPABASE_URL を更新する
.env の NEXT_PUBLIC_SUPABASE_URL を必要に応じて更新する
Next dev serverを再起動する
YE-010 / YI-003 のPDF表示を再確認する
```

別案:

```txt
Task 107-24:
ローカル検証用に、見積書・請求書PDFのStorage依存を避けるfallback表示方針を設計する。
```

ただし、保存済みPDFを正とする現行方針を崩す場合は、帳票の過去表示固定方針との整合を先に検討する。

## 16. 最終追記: 復旧結果

追加確認により、最終原因は Supabase project が paused 状態だったことと判明した。

対応:

```txt
Supabase Dashboard で対象 project を resume した
npm run dev を再起動した
```

結果:

```txt
見積書PDFが表示できるようになった
請求書PDFが表示できるようになった
```

結論:

```txt
見積書・請求書PDF download failed の原因は Supabase project paused による Storage 接続不可。
RepairLineItem 関連コードとは無関係。
```

この追記で変更していないもの:

```txt
schema
code
API
UI
DB
Storageファイル
RepairLineItem関連コード
```
