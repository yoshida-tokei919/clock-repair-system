# Task202C — ゆうプリR発送履歴 → Shipment同期候補プレビューUI

Status: local implementation. Production: pending.

## Boundary

- 既存のAdmin認証付き `POST /api/shipments/yupuri-history/preview` と `/shipments` に、1 CSVファイルのread-only照合表示を追加する。
- APIはAdminとShipmentのreadのみ。Shipmentの現在値（id、direction、status、trackingNumber、actualShippedAt、deliveredAt）を照合時点で返し、DateはISO文字列へserializeする。発送予定一覧に載らないShipmentもAPI応答から表示する。
- 追跡番号は同値なら変更なし、未設定なら設定候補、異値なら競合error。INBOUNDとCANCELLEDはblocker。status差分は比較候補であり、遷移・DB更新可否は判定しない。
- 仮引受確定作業年月日と配送完了作業年月日はCSVのraw文字列を保持し、timestampへのparse・検証・timezone推測をしない。
- `importableLater` は旧responseとの互換用候補表示。正規化候補がありblocker/errorがない場合だけtrueだが、DB適用資格や承認ではない。UIにapply操作はない。
- Shipment / Repair mutation、LINE、StorageLocation、PhysicalTag、schema / migration / RLS / GRANT変更なし。

## Preview normalization

公式コードペアから得た日本郵便の説明が下記に完全一致した場合だけShipmentStatus候補を表示する。コードや日付から推定しない。

| 候補 | 公式説明 |
| --- | --- |
| AWAITING_ACCEPTANCE | 引受予定 |
| SHIPPED | 引受 |
| IN_TRANSIT | 通過、最寄局送付、ＣＶＳ等引渡、はこぽす等入庫、発送、車船輸送、到着 |
| OUT_FOR_DELIVERY | 持出中 |
| DELIVERED | 配達完了 |
| EXCEPTION | 不在持戻、最寄局保管、返還完了、局内保管、私書箱保管、保管中、保管、転送、他局転送、返還、処分、返還不能、配達希望（63/67、68、72、78、79、80）、保管延長、休日保管、調査中 |

`窓口渡し`（53/37）とその他の未列挙の公式説明は候補なし＋明示warning。公式表のdashペアと未知ペアも候補なし。

## Validation

- Focused parser/route tests: 14/14 PASS（direct transpile）。
- Related Shipment regression attempt: 39 tests discovered / 37 PASS。2件の `shipment-route` test はWindows環境の `spawn EPERM` によりassertion実行前に停止しており、assertion failureではない。
- TypeScript `--noEmit`、`git diff --check`、`npm run build`: PASS。
