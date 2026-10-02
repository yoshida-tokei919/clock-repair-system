# Task200A — 発送予定一覧とDRAFT計画UI

Status: local implementation + independent review complete — Production: pending

## Scope

- `/shipments` とSidebar導線、NextAuth middleware保護
- OUTBOUNDの`actualShippedAt = null`、`status != CANCELLED`を対象とする発送予定一覧
- `plannedShipDate`をAsia/Tokyoの日付で遅延、今日、明日、今週、来週、それ以降、未設定へ分類。週は月曜始まり。日付未設定のDRAFTも表示。
- Shipment ID、Customer.name/type、Shipment.status、Repair inquiryNumber/status、作業完了件数、納品書発行集計と各`deliveryNoteId`、予定日、配達希望、送り状発行有無、carrier/service/handoffを表示
- DRAFTの`plannedShipDate`、`carrierCode`、`serviceCode`、`handoffMethod`、`requestedDeliveryDate`、`requestedDeliveryTimeSlot`を既存PATCH APIで保存
- 保存成功後に一覧を更新。401、409、その他の保存エラーは編集欄が閉じた後も見える位置に表示

## Canonical data and limitations

- 作業完了数は現在の`Repair.status === "作業完了"`から数える。各Repairのstatusも併記する。
- ランニングテスト完了の正本イベントは未実装で、完了を判定できない。`RepairStatusLog`や`runningTestDays`から推定しない。
- 納品書は各Repairの`deliveryNoteId`から全件発行済み / 一部発行済み / 未発行を導く。ShipmentとDeliveryNoteを新たに結合しない。
- 一覧はShipmentからCustomerとRepairをnested selectで一括取得し、行単位のDB queryを行わない。
- `parseShipmentUpdate`は既存のnull消去と不正入力400を維持。DRAFT以外の更新は409。

## Boundary

schema / migration / seed / Supabase / RLS / GRANT、ShipmentStatus遷移、tracking、CSV、ゆうプリR、ヤマト、LINE、Repair.status、StorageLocation、PhysicalTag release、梱包scan、同一顧客の近接発送候補は変更しない。Task200B/C/Dは未着手。

## Validation

- focused Shipment regression: 17/17 PASS
- `npx --no-install tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- `npm run build`: PASS（Next.js 15.5.27、static pages 56/56、`/shipments` dynamic route生成）
- independent review: 409エラー表示、Repair件数/作業完了集計、納品書集計、ランニングテスト表記を確認・修正後、blocking findingなし

Push / deployは行っていない。productionはTask199Cのまま。
