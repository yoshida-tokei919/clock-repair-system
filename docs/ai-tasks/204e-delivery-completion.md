# Task204E — 配達完了からRepair納品済みへの確定

Status: local implementation complete; production pending.

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
