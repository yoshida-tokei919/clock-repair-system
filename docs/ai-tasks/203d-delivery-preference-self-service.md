# Task203D-A — 修理完了LINE + 配達希望セルフ回答

## Scope

- Task203の作業完了連絡は既存 `LineManagerSendOutbox` / LINE Manager通常トークを維持し、Messaging API Pushは追加しない。
- Adminが「送信内容を確認」した時だけRepairの既存`publicToken`を明示的に準備し、配達希望回答URLを含む最終文面を表示してからAPPROVED intentを作る。
- 顧客向け `/customer/delivery/[token]` で `希望なし / 日付 / 時間帯 / 日付+時間帯` を構造化回答する。
- 希望なしでも回答必須であることをLINE本文と回答画面の双方で明示する。
- 回答はRepair単位の `RepairDeliveryPreference` に保持し、Shipment未作成でも失わない。
- 既存Task203CのDRAFT Shipment手動編集は維持する。

## Shipment reflection

- 回答時に対象Repairへ紐づく未取消OUTBOUND Shipmentが1件だけ、DRAFT・未発送かつShipment内Repairが1件だけなら、同一Serializable transactionでShipmentへ自動反映する。
- Shipmentが0件、複数件、または複数Repair同梱ならRepair回答だけを保持して自動選択しない。
- active OUTBOUND ShipmentがDRAFTを離れた後は顧客ページからの変更をlockする。
- 後から単一Repair Shipmentを作る場合でも、そのRepairに他のactive OUTBOUND・未発送Shipmentがない時だけ保存済み回答を自動反映する。既存active個口がある場合と複数Repair Shipmentは自動反映せず要確認とする。

## Security / schema

- URL bearerは既存の推測困難な `Repair.publicToken` を再利用し、Repair ID / LINE識別子をURLへ出さない。
- public GETはtokenを生成しない。token生成はAdmin認証済みの明示POSTのみ。
- 配達回答ページ/APIはB2CかつTask203 completion notice intentが存在しCANCELLEDでないRepairだけを許可する。
- `RepairDeliveryPreference` はserver-only。RLS enabled、policyなし、`PUBLIC / anon / authenticated / service_role` のtable権限を明示REVOKEする。Data API GRANTは付与しない。
- schema / migration / production DB変更は高リスク扱い。migrationはproduction未適用。

## LINE safety

- Repair.status変更のみで送信しない。
- sender worker / lineoa送信方式は変更しない。
- 実LINE送信はこのTaskのlocal validationでは行わない。
- Adminが確認した最終文面とserver再構築文面が一致しない場合は409でfail closedする。

Production: pending. Production migration / deploy / real LINE send are not performed without explicit approval.
