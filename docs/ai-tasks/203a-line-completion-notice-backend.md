# Task203A — LINE作業完了連絡 backend foundation

## Scope

- RepairStatus変更では自動送信しない。
- authenticated Adminの明示POSTだけを作業完了連絡の送信intent作成トリガーにする。
- 既存 `LineManagerSendOutbox` / `createApprovedLineManagerSendOutbox` を再利用する。
- UI、Shipment配達希望日時更新、Repair/Shipment status更新、sender worker変更、schema / migration / RLS / GRANTは対象外。

## Safety contract

- `confirmed: true` と非空・最大5000文字の本文を要求する。
- B2C (`customer.type=individual`) かつ `Repair.status=作業完了` のみ対象。
- originating Inquiry promotionとverified `LineManagerChat` をserver-sideで再取得する。
- `Customer.lineId` へfallbackしない。
- idempotency keyは `repair-completion-notice:{repairId}` 固定。
- 同一intentは冪等、別本文や別destination等の競合は既存outbox契約で409 fail-closed。
- GETはread-onlyでeligibility、verified destination有無、既存outbox status / approvedAt / confirmedAtを返す。

## Validation

- Task203A focused tests: 8/8 PASS（Customer → Repair lock順、stale eligibility / customer linkageのfail-closedを含む）。
- existing LINE Manager outbox regression: 15/15 PASS。
- TypeScript (`tsc --noEmit --incremental false`) PASS。
- `git diff --check` PASS。
- production build PASS、static pages 56/56。

Production: pending. 実LINE送信、push、merge、deployは未実施。
