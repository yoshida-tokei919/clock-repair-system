# Task204C — 日本郵便引受後の発送LINE通知

Status: production complete. Automatic tracking sync and real LINE delivery notice remain pending.

## Scope

- Task204BのCSV同期後、`actualShippedAt` が確定したB2C OUTBOUND / JAPAN_POST Shipmentについて発送LINE送信待ちを作る。
- 配送同期transactionとLINE Outbox作成transactionは分離する。LINE送信先不備やOutbox作成失敗で配送状態を巻き戻さない。
- Shipment単位の固定idempotency key `shipment-shipping-notice:{shipmentId}` を使い、同じCSVの再取込や後続status pollで二重送信しない。
- 通知文面には日本郵便の追跡番号と、既存の修理状況ページでも配送状況を確認できる旨を含める。

## Eligibility / source resolution

- individual Customer、OUTBOUND、carrierCode=JAPAN_POST、12桁trackingNumber、actualShippedAtあり、対象Repairありを必須とする。
- 同一RepairIntakeInvite由来ならinviteの検証済みLineManagerChatを優先する。
- inviteが無い単独/旧経路は、全Repairが同じInquiry promotionに由来する場合だけその検証済みLINE送信先へfallbackする。
- B2B、LINE紐付け不整合、複数由来が混在するShipmentはfail-closedで通知しない。

## Safety

- 実LINE送信はこのTaskでは行わない。既存LineManagerSendOutboxへAPPROVED送信意図を積むだけ。
- tracking同期成功後のLINE queue失敗は結果に `ERROR / notice_queue_failed` として残し、次回CSV同期で再試行可能。
- schema / migration / RLS / GRANT変更なし。

## Validation

- 204C focused + existing LineManager outbox regression tests: 28/28 PASS。
- TypeScript / diff-checkはcommit前に実施。
- Codex制限中のため、ユーザー明示例外によりカタリ実装・カタリレビュー。
- production push/deploy、自動同期ON、実LINE送信は未実施。

## Production completion ? 2026-10-13

- Application commit: `3fceb4fb7222ef1bb24ca569ce1dc856929b2d24`.
- Deployed source: GitHub `main` at `2052f218d2268b5fa02fea423020a2324242988d`.
- Railway deployment: `fb00bade-aecb-44bf-a9a0-3e18a23baa01` ? `SUCCESS`, region `sin`.
- Railway build: Prisma Client generation PASS; Next.js 15.5.27 compile / lint / type validation PASS; static generation 59/59 PASS.
- Production runtime: Next.js Ready in 382ms.
- Non-destructive smoke: `/`=200, `/login`=200, unauthenticated `/repairs`=307, `/shipments`=307, invalid `/customer/repairs/...` token=404, unauthenticated `POST /api/internal/japan-post-tracking`=401, unauthenticated `POST /api/internal/japan-post-tracking/sync`=401. Railway HTTP logs showed empty `upstreamErrors` for these smoke requests.
- No schema / migration / RLS / GRANT / environment-variable change was required. Smoke testing made no Shipment / Repair delivery-state mutation and sent no LINE message.
- Persistent `-AllowTrackingSync` remains OFF. The approved real-shipment E2E will confirm the live Cloud CSV, 14-digit timestamp format, acceptance -> LINE -> transport -> out-for-delivery -> delivered -> Repair delivery completion before operational activation.
- Review exception: the user explicitly authorized Katari implementation and review for Task204A-E while Codex quota was limited; independent Codex review was intentionally omitted for this sequence.
