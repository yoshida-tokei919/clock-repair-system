# Task204E — 配達完了からRepair納品済みへの確定

Status: production complete. Real-shipment delivery-completion E2E remains pending.

## Scope

- Task204BのCSV同期で `DELIVERED` と確認できたOUTBOUND Shipmentに紐づくRepairを納品確定候補にする。
- Repairに紐づく未取消OUTBOUND Shipmentをすべて再確認し、全件 `DELIVERED` かつ `deliveredAt` ありの場合だけRepairを `納品済み` へ進める。
- `deliveryDateActual` は対象となる全OUTBOUND Shipmentの `deliveredAt` のうち最も遅い時刻を保存する。
- RepairStatusLogへ `納品済み` を自動処理として `changedBy=null` で記録する。

## Fail-closed / idempotency

- Repairが `作業完了` 以外なら上書きしない。既に `納品済み` ならNO_CHANGE。
- DRAFT / READY / LABEL_ISSUED / AWAITING_ACCEPTANCE / SHIPPED / IN_TRANSIT / OUT_FOR_DELIVERY / EXCEPTION が1件でも残るRepairは納品済みにしない。
- CANCELLED OUTBOUND ShipmentとINBOUND Shipmentは納品完了判定を阻害しない。
- ShipmentとRepairをtransaction内でロックし、Serializable isolationで競合時はfail-closedとする。
- 納品確定DB処理の予期しない失敗は握り潰さずinternal routeを失敗させ、次回CSV同期で安全に再試行する。

## Boundary

- schema / migration / RLS / GRANT変更なし。
- Task204CのLINE OutboxとTask204EのRepair確定は別処理。LINE障害で配送同期・納品判定を巻き戻さない。
- production push/deploy、自動追跡ON、実発送/実LINEテストは未実施。

## Validation

- 204E focused tests: 5/5 PASS。
- 204B/C regressionを含む同期経路tests: 16/16 PASS（自己レビュー修正前後で確認）。
- TypeScript `--noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Codex制限中のため、ユーザー明示例外によりカタリ実装・カタリレビュー。

## Production completion ? 2026-10-13

- Application commit: `2052f218d2268b5fa02fea423020a2324242988d`.
- Deployed source: GitHub `main` at `2052f218d2268b5fa02fea423020a2324242988d`.
- Railway deployment: `fb00bade-aecb-44bf-a9a0-3e18a23baa01` ? `SUCCESS`, region `sin`.
- Railway build: Prisma Client generation PASS; Next.js 15.5.27 compile / lint / type validation PASS; static generation 59/59 PASS.
- Production runtime: Next.js Ready in 382ms.
- Non-destructive smoke: `/`=200, `/login`=200, unauthenticated `/repairs`=307, `/shipments`=307, invalid `/customer/repairs/...` token=404, unauthenticated `POST /api/internal/japan-post-tracking`=401, unauthenticated `POST /api/internal/japan-post-tracking/sync`=401. Railway HTTP logs showed empty `upstreamErrors` for these smoke requests.
- No schema / migration / RLS / GRANT / environment-variable change was required. Smoke testing made no Shipment / Repair delivery-state mutation and sent no LINE message.
- Persistent `-AllowTrackingSync` remains OFF. The approved real-shipment E2E will confirm the live Cloud CSV, 14-digit timestamp format, acceptance -> LINE -> transport -> out-for-delivery -> delivered -> Repair delivery completion before operational activation.
- Review exception: the user explicitly authorized Katari implementation and review for Task204A-E while Codex quota was limited; independent Codex review was intentionally omitted for this sequence.
