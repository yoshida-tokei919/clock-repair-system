# Task204D — 共有ページ配送状況表示

Status: production complete. Real-shipment display verification remains pending.

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

## Production completion ? 2026-10-13

- Application commit: `ec13cd8fb4d0ec79fc97a3947dbb90df64820025`.
- Deployed source: GitHub `main` at `2052f218d2268b5fa02fea423020a2324242988d`.
- Railway deployment: `fb00bade-aecb-44bf-a9a0-3e18a23baa01` ? `SUCCESS`, region `sin`.
- Railway build: Prisma Client generation PASS; Next.js 15.5.27 compile / lint / type validation PASS; static generation 59/59 PASS.
- Production runtime: Next.js Ready in 382ms.
- Non-destructive smoke: `/`=200, `/login`=200, unauthenticated `/repairs`=307, `/shipments`=307, invalid `/customer/repairs/...` token=404, unauthenticated `POST /api/internal/japan-post-tracking`=401, unauthenticated `POST /api/internal/japan-post-tracking/sync`=401. Railway HTTP logs showed empty `upstreamErrors` for these smoke requests.
- No schema / migration / RLS / GRANT / environment-variable change was required. Smoke testing made no Shipment / Repair delivery-state mutation and sent no LINE message.
- Persistent `-AllowTrackingSync` remains OFF. The approved real-shipment E2E will confirm the live Cloud CSV, 14-digit timestamp format, acceptance -> LINE -> transport -> out-for-delivery -> delivered -> Repair delivery completion before operational activation.
- Review exception: the user explicitly authorized Katari implementation and review for Task204A-E while Codex quota was limited; independent Codex review was intentionally omitted for this sequence.
