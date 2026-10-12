# Task204D — 共有ページ配送状況表示

Status: local implementation complete; production pending.

## Scope

- `/customer/repairs/[token]` のB2C/B2B共有ページに、Repairへ紐づく日本郵便OUTBOUND Shipmentの配送状況を表示する。
- 表示は Shipment 単位で重複排除し、同じShipmentに複数Repairが入る場合は共有ページ上で見えている問合番号だけを対象として併記する。

## Customer labels

- LABEL_ISSUED / AWAITING_ACCEPTANCE: 発送準備中
- SHIPPED: 発送済み
- IN_TRANSIT: 輸送中
- OUT_FOR_DELIVERY: 配達中
- DELIVERED: 配達完了
- EXCEPTION: 配送状況を確認中

DRAFT / READY / CANCELLED、INBOUND、JAPAN_POST以外は共有ページへ表示しない。

## Data exposure boundary

- 追跡番号は12桁の日本郵便形式だけ表示する。不正な値は非表示。
- 表示するShipmentは、既に共有トークンで取得を許可されたRepairの `shipmentRepairs` からのみ導出する。
- 発送日時・配達完了日時はShipmentに保存済みの値だけをAsia/Tokyo表示する。
- Shipment/Repair/LINE/DBへのmutationなし。schema / migration / RLS / GRANT変更なし。

## Validation

- public shipment view focused tests: 4/4 PASS。
- TypeScript `--noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Codex制限中のため、ユーザー明示例外によりカタリ実装・カタリレビュー。
- production push/deployは未実施。
