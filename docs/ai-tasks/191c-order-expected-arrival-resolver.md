# Task191C: OrderRequest 入荷予定 resolver

## 範囲

Task191A の `OrderRequest.expectedArrivalDate` と `procurementShippingMethodId`、Task191B の手動リードタイム設定を、発注管理の更新処理へ接続した。
schema、migration、seed は変更していない。

Production: complete

## 計算と更新

- `orderedAt` を Asia/Tokyo の暦日に変換し、`SupplierLeadTimeSetting.manualProcessingLeadDays + ProcurementShippingMethod.manualTransitLeadDays` を暦日で加算する。
- DBの `@db.Date` へ渡す値はUTC 00:00の `Date` とし、サーバーtimezone依存を避ける。
- Supplierまたは処理日数がない、配送方法または輸送日数がない、`orderedAt` がない場合は `expectedArrivalDate = null`。
- `0` 日は設定済みとして扱う。
- 初回 `ordered` 遷移では `orderedAt` を保存し、当時のSupplier / ShippingMethod設定で予定日を算出する。
- 既存 `orderedAt` は上書きしない。
- status-onlyの `ordered` 再送や同じ配送方法IDの再指定では保存済み `expectedArrivalDate` を維持する。
- 配送方法IDが実際に変わった場合、または既存 `orderedAt` が欠けている場合だけ再計算する。
- Task191B設定値の変更だけでは既存OrderRequestを一括再計算しない。
- `pending` では配送方法の選択を保持し、`expectedArrivalDate` のみ `null` にする。
- `received` / `assigned` では保存済み予定日を履歴として保持する。
- `received` / `assigned` の配送方法編集はAPIとUIの両方で防止する。
- 不明な配送方法IDは404。無効な配送方法の新規選択は拒否するが、既に選択済みの無効方法をstatus更新時に保持する既存データ互換は維持する。
- `PUT /api/orders/[id]` は従来の `{ status }` 呼び出しを維持しつつ、`procurementShippingMethodId` 単独またはstatusとの同時指定を受け付ける。
- 画面の「発注済みにする」は、その行の配送方法IDを同じPUTへ含める。

## 境界

入荷・割当時の在庫加算、RepairPartAllocation、既存Repair status同期を維持する。
`receivedAt` が実入荷の正本であり、`actualArrivalDate` は追加しない。
`partsReadyDate`、RepairPlanningState、blocked / resume、Task184 scheduler、リードタイム実績 / P80 は後続Taskとする。

## Local validation / review

- Task191C resolver / update logic: 8 / 8 PASS
- RepairPartAllocation: 26 / 26 PASS
- Task191B procurement settings: 6 / 6 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- カタリ独立レビュー・独立再検証: PASS
- 初回レビュー指摘3点（pending時の配送方法保持、ordered snapshot再計算条件、発注PUTへの配送方法ID同梱）は修正済み。
- schema / migration / seed / roadmap / Task184 scheduler へのTask外差分なし。

## Production

- Production application commit: `94f10c58e118224a5435c4607c0539fd43423acb`
- Production tag: `production-task191c-20260927`
- Railway deployment: `2a3ae39c-80a8-413a-917d-2e241727ef30`
- status: `SUCCESS`
- region: `sin`
- migrationなし。Task191Aのproduction schemaをそのまま使用するためproduction DB backupは不要。
- Railway production buildで Prisma Client v5.7.0 再生成、Next.js production build / type check 成功。
- Runtime: `next start` 正常起動、`Ready in 400ms`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - `/api/orders` = 200（既存挙動。今回アクセス制御は変更していない）
  - 未認証 `/api/settings/procurement` = 401
- productionデータを書き換える `PUT /api/orders/[id]` の実データsmokeは未実施。
- 既存 `/api/repairs/recent` の Dynamic server usage ログはbuildを失敗させておらずTask191C対象外。

Production: complete
