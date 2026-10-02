# Task201 — ゆうプリR 標準フォーマットV3 CSV出力adapter

Status: production complete — 2026-10-03

## Scope

- Task199の共通ShipmentをゆうプリR標準フォーマットV3へ変換するadapterを追加。
- authenticated Admin専用 `GET /api/shipments/[id]/yupuri-v3` からCSVをdownloadできる。
- Shipmentのdestination snapshotのみを使用し、Customer current addressへfallbackしない。
- お客様側管理番号は `SHP-{Shipment.id}` とし、後続Task202で機械的にShipmentへ照合可能。
- requestedDeliveryDate / requestedDeliveryTimeSlotをV3列へmappingする。
- OUTBOUNDかつ発送前のShipmentのみexport可能。発送済み、取消、配送中、配達済み等は409でfail closed。
- CSV生成だけではShipment / Repair / trackingNumber / status / labelIssuedAt等を一切mutationしない。

## CSV / PoC contract

- 実取込・送り状印刷成功済み `yupuri_standard_v3_poc_20260924.csv` を一次資料として再確認。
- 100列、headerなし、CP932 / Shift_JIS、BOMなし。
- 実装出力は1レコード末尾をCRLFとする。PoC実ファイルは末尾改行なしだったが、V3取込仕様上blocking差分とは判断しない。
- 値にcomma / double quoteが含まれる場合は100列すべてをquoteし、double quoteをescapeする。
- CP932へround-tripできないUnicodeは422でfail closed。
- 内容品はPoCに合わせ「腕時計」。荷物サイズcodeは現時点で `060` 固定。
- 60サイズ以外を扱う場合はShipment共通データ側に荷物サイズの正本を持たせる後続設計が必要。
- 差出人情報は既存帳票で使用中の工房情報と一致させ、ゆうプリR adapter内部へ閉じ込めた。

## Validation

- focused tests: 9/9 PASS。
- `npx --no-install tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- `npm run build`: PASS、Next.js 15.5.27、static pages 56/56。
- Task200C completion後のmainへrebaseし、上記をすべて再実行してPASS。
- direct dependencyとして `iconv-lite ^0.7.3` を追加。
- independent review: blocking findingなし。PoC列位置、CP932、delivery time code、Shipment snapshot境界、Admin認証、read-only性を確認。

## Boundary

- schema / migration / seed / Supabase / RLS / GRANT変更なし。
- Task202のゆうプリR発送履歴CSV取込、お問い合わせ番号保存、配送状態同期は未実装。
- ShipmentStatus遷移、Repair.status、LINE通知、PhysicalTag、StorageLocation、ScanSessionは変更しない。
- `/shipments`共有UIには出力ボタンを追加せず、並列Task200Cとの競合を回避。現時点ではauthenticated APIが出力導線。

## Production

- Application commit: `72c80913f2adf4bbec70af0f064ef341af7f31e5`
- Commit subject: `feat: add yu-pri v3 shipment export`
- Deploy source: GitHub `main` → Railway
- Railway deployment: `42baa5f7-3b3b-4462-bbc5-88772065e3ff` — SUCCESS
- Production tag: `production-task201-20261003`
- Region: `sin`
- Runtime: Next.js 15.5.27, Ready in 336ms
- Supabase migration: none; schema / migration / production DB mutationなし
- Production smoke: `/`=200、`/login`=200、`/shipments`=307、`/repairs`=307、`GET /api/shipments/1`=401、`GET /api/shipments/1/yupuri-v3`=401（すべて未認証期待値）。Railway HTTP logsの`upstreamErrors`なし。

## Next

Task200Dは未着手。次Taskはuser approvalなしに開始しない。
