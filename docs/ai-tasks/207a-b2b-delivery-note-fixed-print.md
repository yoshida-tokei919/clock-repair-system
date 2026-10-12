# Task207A — B2B納品書の固定プリンタ印刷

Production: pending

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
- Production deploy: **pending**。Task207B/207Cとまとめて行う計画のため、本Taskではpush/deployしない。
