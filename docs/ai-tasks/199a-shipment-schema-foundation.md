# Task199A — Shipment schema foundation

## Status

Production complete — 2026-10-02

## Task boundary

Shipment（発送1個口）の共通schema foundationのみを追加した。

Task199AではShipmentをRepair.status / DeliveryNote / StorageLocation / PhysicalTagから独立した正本として定義し、後続Taskが安全に発送業務を接続できる土台を作る。

対象:

- Shipment / ShipmentRepair
- ShipmentDirection / ShipmentStatus / ShipmentHandoffMethod
- Repair ↔ Shipment の多対多
- Shipment単位の発送予定・実発送・追跡・宛先snapshot
- server-only RLS / privilege boundary

対象外:

- Shipment作成API / UI
- ScanSession `SHIPMENT_SELECT` 接続
- 同一顧客のまとめ発送候補UI
- Repair.status自動変更
- StorageLocation自動変更
- ゆうプリR / ヤマトadapter
- LINE発送通知
- ShipmentGroup / tracking event履歴
## Canonical model

### Shipment

1 Shipment = 1 physical parcel / 1個口。

主なfield:

- customerId
- direction: INBOUND / OUTBOUND
- status
- carrierCode / serviceCode
- handoffMethod
- plannedShipDate
- labelIssuedAt
- handoffRequestedAt
- actualShippedAt
- deliveredAt
- trackingNumber
- destination address / phone snapshot
- requestedDeliveryDate / requestedDeliveryTimeSlot

`plannedShipDate` はRepairへ追加せずShipmentが保持する。

`labelIssuedAt` は送り状発行イベントであり、実発送とは扱わない。
`actualShippedAt` は配送会社の実引受を正規化した実発送日時として後続Taskで更新する。
日本郵便ではTask202以降に「引受」を実発送イベントとして扱う。
### Repair relation

`ShipmentRepair` を明示join modelとして追加した。

- 1 Shipment → multiple Repairs
- 1 Repair → multiple Shipments
- composite primary key: shipmentId + repairId
- repairId indexあり
- Shipment / Repair FKは ON DELETE RESTRICT / ON UPDATE CASCADE

ShipmentはcustomerIdを直接保持する。

Shipmentへ紐づけるRepairが同一CustomerかどうかはDB schema単独では保証せず、Task199Bのserver-side create flowで再取得・検証する。

## Carrier boundary

carrier固有schemaは追加していない。

- carrierCode: String?
- serviceCode: String?

日本郵便 / ヤマト等のCSV列・status code・validationは後続adapterへ閉じ込める。
Shipment正本は特定配送会社へ固定しない。

## Security / Data API

Shipment / ShipmentRepairはserver-only。

- RLS enabled
- RLS policyなし
- anon table privilegeなし
- authenticated table privilegeなし
- service_role table privilegeなし
- Shipment_id_seqも上記3 roleへprivilegeなし
- GRANT追加なし

Supabase Data APIから直接利用しないため、明示GRANTは不要と判断した。
## Independent review

Implementer: Codex

Independent reviewer: カタリ

Blocking finding: none after fixes.

独立レビューで2件を検出し、production前に修正した。

1. migration directoryが同日既存migrationより前へsortされていた
   - `20261002_add_shipment_foundation`
   - → `20261002_zz_add_shipment_foundation`
   - 既存の `20261002_z_harden_trigger_function_search_paths` より後へappend-only化
2. TypeScript checkで生成された `tsconfig.tsbuildinfo` がTask差分へ混入
   - HEADへrestore
   - Task199A commitから除外

独立レビュー後のTask差分は以下2ファイルのみ。

- prisma/schema.prisma
- prisma/migrations/20261002_zz_add_shipment_foundation/migration.sql

## Local validation

- `npx prisma validate` — PASS
- `npx tsc --noEmit --incremental false` — PASS
- `git diff --check` — PASS
- `npm run build` — PASS
- Next.js 15.5.27
- static pages 56/56
## Pre-production backup

Local Supabase CLI / pg_dumpが利用できなかったため、既存運用と同じread-only logical fallbackを使用した。

Backup directory:

`C:\Users\yoshi\clock-repair-backups\task199a-20261002-163314`

- public base tables before migration: 74
- public-data-and-xsd.xml
  - bytes: 387305
  - SHA256: `DE83C0048467CFC17FF1DD6B062803F6F359E91EA99C33C5000515CD332E5E98`
- schema-metadata.json
  - bytes: 284286
  - SHA256: `2FF68C29144717EF4A04997294B958B9CAE2A92EDB458F43359DEDB9DC0EE3F4`

schema-metadataにはcolumns / constraints / indexes / RLS / policies / enums / API-role privilegesを保存した。

以前のfull SQL dump baseline:

`C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752`

## Production migration

Supabase project:

`vpyjonjfpkpbvvjufbiu`

Applied migration:

`20261002074103 add_shipment_foundation`
適用前にShipment / ShipmentRepair / 3 enumが未存在であることをread-only確認した。

初回applyではDesktop Commanderの表示footerがSQL末尾へ混入しsyntax errorとなった。
直後にread-backし、table / enum未作成、migration history未追加を確認したためpartial applyなし。
その後、migration.sql本体69行のみを再抽出して正常適用した。

Production read-back:

- Shipment table: present
- ShipmentRepair table: present
- 3 enums: expected values一致
- FK / index: migration定義一致
- RLS: both enabled
- policies: 0
- anon / authenticated / service_role table privileges: 0
- Shipment_id_seq privileges: all false for the 3 API roles

Supabase Security Advisor:

- `rls_enabled_no_policy` INFO: 13 → 15
- 新規2件はShipment / ShipmentRepair
- server-only + no Data API privileges設計のためintentional

新たなblocking security findingなし。

## Production deployment

Application commit:

`2a2a4fe491675e6c67de87b784262226782d0fee`

Commit subject:

`feat: add shipment schema foundation`
Railway deployment:

`83f71fb9-0a51-4a87-bc64-1066fa7bba89`

- status: SUCCESS
- source: GitHub main
- exact commit: `2a2a4fe491675e6c67de87b784262226782d0fee`
- region: sin
- runtime: Next.js 15.5.27
- Ready in 618ms

Production tag:

`production-task199a-20261002`

Production smoke:

- `/` = 200
- `/login` = 200
- `/repairs` unauthenticated = 307
- `/storage-locations` unauthenticated = 307
- Railway HTTP logs: upstreamErrorsなし

## Follow-up boundary

Task199AではShipment schema foundationのみ完了した。

次候補はTask199B。

Task199Bでは少なくとも以下を扱う。

- Shipment create / read / updateのserver-side domain
- selected Repairのserver-side再取得
- same-customer validation
- destination snapshotの確定
- conflicting return-address時のfail-closed
- explicit human confirmation

Task199Bはuser approvalなしに開始しない。
