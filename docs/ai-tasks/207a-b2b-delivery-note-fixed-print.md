# Task207A — B2B納品書の固定プリンタ印刷

Production: complete

## Scope

- B2B納品書画面に `NEC MultiWriter 5750C で印刷` を表示する。
- 既存のブラウザ生成PDFを、Windows PCのローカルhelperへ明示操作で送る。
- helperは `127.0.0.1:5750` のみにbindし、プリンタ名 `NEC MultiWriter 5750C` を常に指定する。
- 納品書/PDF生成ロジック、B2C、Brother QL-800、LINE/Gmail/請求書、schema/migration/RLS/GRANTは変更しない。

## 起動と操作

Windows PCで `npm ci` 済みのcanonical repoを使い、ユーザー環境変数 `DELIVERY_PRINT_ALLOWED_ORIGIN` に利用するアプリの正確なorigin（例: `https://example.com`、末尾の `/` なし）を設定する。PowerShellで `scripts/start-delivery-note-print-helper.ps1` を起動したまま、B2B納品書画面の印刷ボタンを押す。常駐サービスやスケジュールタスクは追加しない。

## Safety

- helperはloopbackのみで待ち受け、設定したブラウザorigin以外を拒否する。CORS preflightにも同じ制限をかける。
- `application/pdf`、PDF header、20 MiB上限を確認してから印刷する。受信PDFは一時ファイルに置き、処理後に削除する。
- プリンタはUIやリクエストから受け取らず、helper内の固定名だけを `pdf-to-printer` に渡す。既定プリンタへフォールバックしない。
- 成功表示は印刷ジョブ投入を意味する。紙の排出完了は保証しない。失敗時は画面にエラーを表示する。

## Validation

- helperのorigin拒否、preflight、PDF検証、サイズ上限、固定プリンタ指定をmock印刷でテスト: 5件PASS。
- TypeScript `tsc --noEmit`: PASS。`git diff --check`: PASS。
- `next build`: compile、lint/type確認、静的ページ59/59を含めPASS。
- 標準の `npm run build` は、既存 `node_modules/.prisma/client/query_engine-windows.dll.node` のunlinkがWindowsで `EPERM` となり、Prisma Client再生成時点で停止。schema変更なし。実行中プロセスによるロックの可能性があるため、環境が空いた時に再確認する。
- Windows実機の `NEC MultiWriter 5750C` への印刷と紙の出力: **未確認**。実印刷テストは別途現地で行う。
- Production deploy: **complete**。Task207B/207Cと同一rolloutで本番反映済み。`DELIVERY_PRINT_ALLOWED_ORIGIN=https://yoshidawatchrepair.com` をWindowsユーザー環境変数へ設定済み。紙の実出力確認のみ未実施。

## Production rollout — 2026-10-13

- Application commit: `0802bd1` (`feat: add fixed delivery note printing`).
- Combined runtime commit: `cf991c0`（Task207A-Cを含む）。
- Railway deployment: `db417b3b-2220-4a03-80b2-bf41d413cd54` — SUCCESS, region `sin`。
- Railway build: Prisma Client generate PASS、Next.js 15.5.27 compile / lint / type validation PASS、static generation 59/59 PASS、build traces / image push PASS。
- Production smoke: `/`=200、`/login`=200、未認証 `/invoices`=307。
- Windows user env: `DELIVERY_PRINT_ALLOWED_ORIGIN=https://yoshidawatchrepair.com` 設定済み。
- 実機 `NEC MultiWriter 5750C` の紙排出は、実B2B納品書ができた時に確認する。
