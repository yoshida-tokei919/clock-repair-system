# Task204C — 日本郵便引受後の発送LINE通知

Status: local implementation complete; production pending.

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
