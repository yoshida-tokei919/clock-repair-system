# Task191C: OrderRequest 到着予定日 resolver

## 範囲

Task191A の `OrderRequest.expectedArrivalDate` と `procurementShippingMethodId`、Task191B の手動リードタイム設定を、発注管理の更新操作へ接続する。schema、migration、seed は変更しない。Production: pending。

## 計算と更新

- `orderedAt` を Asia/Tokyo の暦日へ変換し、`SupplierLeadTimeSetting.manualProcessingLeadDays + ProcurementShippingMethod.manualTransitLeadDays` を暦日で加える。DB の `@db.Date` へ渡す値は UTC 00:00 の `Date` とする。
- Supplier または処理日数がない、配送方法または輸送日数がない、`orderedAt` がない場合は `null`。0 日は設定済みとして扱う。
- `ordered` 更新時は既存 `orderedAt` を維持し、なければ現在時刻を保存する。`ordered` への遷移、`previousOrderedAt` がない場合、または配送方法IDの変更時だけ、同じトランザクションで当該 Supplier と配送方法の現行設定を読み、予定日を再計算する。`ordered` の status-only 更新と同一配送方法IDの再指定では保存済み予定日を維持する。配送方法を `null` に変更した場合は予定日を `null` にする。
- `pending` では配送方法の選択を保持し、予定日だけを `null` にする。`received` / `assigned` では保存済み予定日を維持する。Task191B の設定変更では既存注文を一括再計算しない。
- 配送方法の新規選択は有効行のみ。既に選択されている無効行は表示し、status 更新時に維持できる。`received` / `assigned` の配送方法編集は API と画面の両方で禁止する。未知 ID は 404。
- `PUT /api/orders/[id]` は従来の `{status}` を受け付け、`procurementShippingMethodId` のみ、または status との同時指定も受け付ける。
- 画面の `pending` → `ordered` 操作では、その行の配送方法IDも同じ PUT に含める。保存中はその行の配送方法と状態ボタンを無効にする。

## 境界

入荷・割当時の在庫加算、RepairPartAllocation、既存 Repair status 同期を維持する。`receivedAt` が実入荷の正本であり、`actualArrivalDate` は追加しない。`partsReadyDate`、RepairPlanningState、blocked / resume、Task184 scheduler、リードタイム実績 / P80 は後続 Task とする。

## 確認

- resolver の null / 0 / 加算 / 東京日付境界、注文の status-only 更新・配送方法変更・解除、pending の選択保持、無効方法の扱いを unit test 8件で確認した。PASS。
- 既存 RepairPartAllocation test 26件、Task191B 設定 test 6件。PASS。
- `npx prisma validate`、`npx tsc --noEmit --incremental false`、`git diff --check`。PASS。
- カタリ独立レビュー・独立再検証: PASS。初回レビュー指摘3点（pending時の配送方法保持、ordered snapshot再計算条件、発注PUTへの配送方法ID同梱）は修正済み。
- schema / migration / seed / roadmap / Task184 scheduler へのTask外差分なし。
- 認証付き実画面・production runtime は未確認。
- Production: pending。commit、push、deploy はこの Task の依頼範囲外。
