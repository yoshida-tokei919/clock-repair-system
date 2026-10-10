# Task201F — ゆうプリクラウド送り状発行 worker と追跡番号 writeback

Status: production E2E blocked by Cloud SSO session handoff; live Edge session corrective patch local / production pending

## 根拠と境界

- Task201C の17列、UTF-8 BOM、CRLF、管理番号 `SHP-{Shipment.id}` の CSV adapter を再利用する。ゆうプリR V3 fallback は維持する。
- Task201D の公開デモでは DOM 操作と静的 PDF download まで確認済み。Task201F は Task201E の実サービス DOM 観測を優先する。
- Task201E の実サービス PoC で、`/invoices/` と `/invoices/upload`、発行後・発行前 tab、`#shippingDataFilterId` の `時計修理アプリ17列` option（第2列表示は `あり`）、`#dragger-button`、export/download button、新規 page の署名付き S3 PDF、同一行の `SHP-TEST201E` と追跡番号 `398007150100` が確認された。PDF response は `application/pdf` で `%PDF-` から始まった。Task201F worker 自体の本番 end-to-end 実行は未実施。
- schema / migration / RLS / GRANT は変更しない。既存 ShipmentStatus の `DRAFT → READY → LABEL_ISSUED` を使う。
- `actualShippedAt`、Repair.status、LINE、引受・配達同期は変更しない。これらは Task204 側の境界。

## API 契約

- Admin `POST /api/shipments/[id]/yupuri-cloud` は body を厳密に `{ "confirmed": true }` とし、DRAFT を READY にする。宛先・予定日などを Task201C CSV で再検証する。`carrierCode=JAPAN_POST`、`serviceCode=YU_PACK` を同時に確定する。既存の異なる code、既発行 field、発送済み、非 OUTBOUND は 409。既に正しい READY は再実行可能。既発行かつ整合した追跡番号なら `alreadyIssued` を返す。
- 内部 `GET /api/internal/yupuri-cloud/next` は READY、OUTBOUND、未発送、追跡番号・発行日時なし、canonical code の先頭1件を予定日・ID順に返す。CSV は base64 で返し、ログには出さない。候補 CSV が不正なら先へ進まず失敗する。
- 内部 `POST /api/internal/yupuri-cloud/complete` は body を厳密に `{ shipmentId, managementNumber, trackingNumber }` とする。管理番号は `SHP-{shipmentId}`、追跡番号は12桁数字。Serializable transaction 内で現行 READY 行と他 Shipment との追跡番号衝突を再確認し、`trackingNumber`、server 時刻 `labelIssuedAt`、`LABEL_ISSUED` のみを更新する。同じ発行結果の再送は `alreadyIssued`。状態や番号の不一致は 409。
- 内部 API は `N8N_INTERNAL_TOKEN` の完全一致 Bearer を使用。未設定 503、欠落・不一致 401。body・DB は認証後に読む。

## Windows worker

- `scripts/start-yupuri-cloud-worker.ps1 -Once` は read-only preview。`-AllowIssue` では localhost CDP で専用 Edge の生きた session に接続し、認証済み `/invoices/` を再確認してから内部 next API と発行処理へ進む。Edge/CDP がない、logout、認証ページ不一致の場合は next/upload/issue 前に停止する。`-Once` 終了後も Edge は開いたままにする。既定 app origin は `https://yoshidawatchrepair.com`。localhost override のみ HTTP 可。
- `N8N_INTERNAL_TOKEN` は Windows User 環境変数。Cloud URL は既定で `https://btoolboxprintservice.jp/invoices/`、17列 filter も Task201E で確認した名前を既定とする。通常の本番運用で `YUPURI_CLOUD_INVOICES_URL` / `YUPURI_CLOUD_FILTER_NAME` は不要。URL override は localhost/mock または厳密な本番 host/path のみ許可する。`scripts/open-yupuri-cloud-login.ps1` は repo 外の専用 Edge profile を起動・再利用し、本人が画面内で login・MFA を完了するのを待つ。SSO 後に開いた別 tab を含め、認証済み invoices page を確認したら helper だけ終了し Edge は閉じない。console/chat に credential を入力しない。
- CDP endpoint は既定 `http://127.0.0.1:18822`、専用 Edge は 127.0.0.1 にのみ bind する。`YUPURI_CLOUD_CDP_URL` は厳密な `http://127.0.0.1:<port>` のみ許可し、18820/18821 は使用しない。専用 profile は `%LOCALAPPDATA%\clock-repair-system\yupuri-cloud\edge-profile`、journal・PDF・lock も repo 外の同じ親ディレクトリ配下。worker/helper は credential・cookie・storageState を保存またはログ出力しない。Edge を閉じた場合、再起動後、または session 失効時は operator が一度ログインし直す。
- worker は発行後 tab、発行前 tab の順に管理番号の完全一致行を照合する。両 tab の次500件 button が各1個で無効な場合だけ不在を判断する。発行時は発行前 tab を再選択して対象行を確認する。filter option は `title` の完全一致で1件を選び、表示に `時計修理アプリ17列` と `あり` が含まれることを確認する。重複、両 tab の存在、発行後行の追跡番号が12桁ちょうど1件でない場合は停止する。発行前行が journal なしで既存なら operator review。発行後行が journal なしで既存なら upload/issue せず DB complete と recovery journal を保存する。
- 発行済み追跡番号を一意に確定した時点で DB の `trackingNumber` / `labelIssuedAt` / `LABEL_ISSUED` を先に writeback し、journal に記録する。その後、発行前後の export 一覧でユ00783の追加1行を確定して PDF を取得する。PDF は popup の署名付き URL から browser context request で取得し、HTTP / content-type / `%PDF-` を検証して repo 外へ保存する。PDF/印刷失敗でも DB の発行状態は維持する。
- `YUPURI_CLOUD_PRINTER_NAME` が設定されている場合は `pdf-to-printer` で指定プリンタへ送る。印刷要求前に journal を記録し、結果不明時は自動再印刷しない。未設定なら PDF 保存まで行う。印刷スプーラの受付は紙への実印刷完了を証明しない。
- `scripts/install-yupuri-cloud-worker-task.ps1` は既定 preview。`-Enable` でログオン時の単一 Scheduled Task を登録し、`-AllowIssue` を併用した場合だけ発行を有効化する。登録・稼働はこの Task では行わない。

## 運用上の停止条件

- single-instance は同一 Windows PC の lock と Scheduled Task の `IgnoreNew` で守る。複数 PC で同時稼働する分散 lease は現行 schema にないため、複数 host へは配置しない。
- crash 後に Cloud 側行が未発行か消えている場合でも、自動で2回目の upload・issue は行わない。journal と Cloud 実画面を照合し、必要なら別の運用判断を行う。
- PDF download 一覧は管理番号を直接表示しないため、発行前後で追加されたユ00783行がちょうど1件という条件を使う。同時に人間が発行した場合や UI 表示が変わった場合は停止する。Task201E の URL / tabs / filter / file input / export popup / tracking row は確認済み。Task201F worker の本番 end-to-end、Scheduled Task 登録・稼働、指定プリンタでの実印刷は未確認。
- `SHP-TEST201E` に対する再発行・DB mutation、実顧客への送信、production deploy、worker 登録は行わない。

## 2026-10-10 production E2E finding / corrective patch

- Shipment #1 は READY、`SHP-1` で内部 next API に現れた。最初の worker attempt は旧専用 Edge profile が開いていたため失敗し、Cloud mutation はなかった。Edge を閉じた後は `stage=processing` まで到達したが journal 作成前に停止した。
- 同じ profile の read-only 診断では Cloud invoices ではなく日本郵便 login page に遷移した。さらに本人 login 後の storageState は ToolBox/Cognito の cookie 16件のみで Cloud cookie と localStorage がなく、その state から作った新 context は SAML login page に戻った。login capture は invoices を確認して Edge を閉じたが、その後の worker は `shipment=1 stage=processing` 前に停止し、journal/PDF/Cloud 発行/DB 更新/印刷はなかった。storageState persistence は本番認証手段として成立しない。
- この修正中は実発行を再試行しない。生きた専用 Edge session を使う修正後の本番 E2E（upload/issue、tracking writeback、PDF/印刷）は未確認。

## Local verification

- Task201F の API・domain・worker mock tests と Task201C route/domain・Shipment regression: 55/55 PASS。`npx tsc --noEmit --incremental false`、PowerShell 3 script の parse、`git diff --check`、`npm run build`（Next.js 15.5.27、static pages 59/59）PASS。Task201D の公開デモ Playwright は外部サービスへ接続するため本作業では実行せず、既存テストは変更していない。
- corrective patch revision: storageState capture を廃止し、localhost CDP URL・専用 Edge profile/port の検証、SSO 後の別 tab 検出を focused test で確認（worker-core と合わせて 12/12 PASS）。`npx tsc --noEmit --incremental false`、変更した PowerShell 2 script の parse、`git diff --check` を確認。生きた Cloud login / 発行はこの修正中には実行しない。

Production: pending（corrective patch）。既存 Task201F commit `4af113f` は production/main に反映済みだが、実サービス E2E は上記認証 blocker で停止した。corrective patch の deploy・再 E2E・Scheduled Task 登録/稼働は未実施。
