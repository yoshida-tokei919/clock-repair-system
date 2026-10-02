# Task199B — Shipment server-side create/read/update foundation

## Status

Production complete — 2026-10-02

## Task boundary

Task199Aで追加したShipment / ShipmentRepair schemaへ、server-sideの最小create / read / update基盤を追加した。

対象:

- authenticated admin API
- Shipment create
- Shipment detail read
- DRAFT Shipmentのplanning field update
- selected Repairのserver-side再取得
- same-customer validation
- Repair return-address snapshot検証
- explicit human confirmation
- focused domain / route tests

対象外:

- ScanSession `SHIPMENT_SELECT` UI接続
- 発送スケジュールUI
- Repair.status自動変更
- StorageLocation変更
- DeliveryNote接続
- ShipmentStatus自動遷移
- tracking / label-issued / shipped / delivered event更新
- ゆうプリR / ヤマトadapter
- CSV import/export
- LINE発送通知
- schema / migration / RLS / GRANT変更

## API / domain

### POST /api/shipments

管理画面session + Admin存在確認を要求する。

request:

- `repairIds`
- `confirmed: true`

`customerId`、Shipment status、宛先、carrier event field等をclientから受け取らない。

server-sideで以下を再検証する。

1. repairIdsは1〜100件
2. duplicate idはdeduplicate
3. 指定RepairをDBから再取得
4. 1件でも存在しなければ404
5. 全Repairが同一customerIdでなければ409
6. 全Repairのreturn-address snapshotを既存 `parseRepairReturnAddress` で検証
7. snapshot欠損 / 不正なら409
8. Repair間で返送先が一致しなければ409
9. explicit `confirmed: true` がなければ400

validな場合のみSerializable transaction内で、

- Shipment: OUTBOUND / DRAFT
- destination snapshot
- ShipmentRepair links

を一体作成する。

scanやrepairIds受領だけではShipmentを作成しない。

### B2C / B2B boundary

Customer.typeだけでShipment作成可否を決めない。

- individual / businessどちらでも、Repair側に完全・valid・一致したreturn-address snapshotがあれば共通Shipmentを作成可能
- Customer masterの現住所へのfallbackはしない
- B2B専用の宛先推測ルールは追加しない
- snapshot欠損 / 不正 / 不一致はfail closed

### GET /api/shipments/[id]

管理Adminのみ。

必要最小限のrelationを返す。

- Customer: id / name / type
- ShipmentRepair
- Repair: id / inquiryNumber / customerId

### PATCH /api/shipments/[id]

管理Adminのみ。

`status = DRAFT` のShipmentだけを更新可能。

許可field:

- plannedShipDate
- carrierCode
- serviceCode
- handoffMethod
- requestedDeliveryDate
- requestedDeliveryTimeSlot

許可しないfield:

- status
- trackingNumber
- labelIssuedAt
- actualShippedAt
- deliveredAt
- customerId
- repairIds

status自動遷移は行わない。

## Security

既存管理API patternを再利用。

- NextAuth session必須
- session emailに対応するAdmin record必須
- Shipment tableはTask199Aのserver-only設計を維持
- Data API経由ではなくserver-side Prisma経由
- RLS / GRANT変更なし
- production DB mutationを伴うmigrationなし

## Independent review

Implementer: Codex

Independent reviewer: カタリ

Blocking findings: none after fixes.

production前の独立レビューで1件の業務境界問題を検出した。

### B2B一律拒否

初期実装ではCustomer.typeがindividual以外の場合、完全なRepair return-address snapshotがあってもShipment作成を拒否していた。

修正:

- customer typeによる一律拒否を撤去
- individual / business共通でRepair snapshotを正本として検証
- complete + valid + identicalなら作成可能
- missing / invalid / conflictingなら409
- Customer current address fallbackは追加しない

修正後にfocused testを追加し、再検証した。

## Changed files

- `src/app/api/shipments/route.ts`
- `src/app/api/shipments/[id]/route.ts`
- `src/lib/shipment.ts`
- `src/lib/shipment.test.ts`
- `src/lib/shipment-route.test.ts`

schema / migration / canonical roadmapの実装差分なし。

## Local validation

- `npx prisma validate` — PASS
- `npx tsc --noEmit --incremental false` — PASS
- focused tests — 11/11 PASS
  - shipment domain
  - shipment routes
  - return-address regression
- staged `git diff --check` — PASS
- `npm run build` — PASS
- Next.js 15.5.27
- static pages 56/56
- build exit 0

Application commit:

`165530378a6713c188a33585142b2b1a96420529`

Commit subject:

`feat: add shipment server foundation`

## Production deployment

schema / migration差分なしのためproduction DB backup / migrationは不要。

Railway deployment:

`59a1a9c3-d9be-454b-9f34-49f31355890f`

- status: SUCCESS
- source: GitHub main
- exact commit: `165530378a6713c188a33585142b2b1a96420529`
- region: sin
- runtime: Next.js 15.5.27
- Ready in 345ms

Production tag:

`production-task199b-20261002`

## Production smoke

- `/` = 200
- `/login` = 200
- `/repairs` unauthenticated = 307
- `POST /api/shipments` unauthenticated = 401
- `GET /api/shipments/1` unauthenticated = 401
- `PATCH /api/shipments/1` unauthenticated = 401

認証済みproduction mutation smokeは実データ作成を避けるため実施していない。
domain / route testでmutation条件と認証境界を自動確認済み。

## Follow-up boundary

次候補はTask199C。

Task199CではScanSession `SHIPMENT_SELECT` の選択結果をTask199B server contractへ接続する。

必須方針:

- scanだけではShipmentを作らない
- selected Repairsを確認画面で提示
- 人間の明示確認後にPOST /api/shipments
- server-sideでRepair / customer / addressを再検証
- 別顧客 / 宛先不一致はblock
- Repair.status / StorageLocationはまだ自動変更しない

Task199Cはuser approvalなしに開始しない。
