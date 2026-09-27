# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `94f10c58e118224a5435c4607c0539fd43423acb`
- Commit subject: `feat: add order expected arrival resolver`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `2a3ae39c-80a8-413a-917d-2e241727ef30`
- Deployment status: `SUCCESS`
- Production tag: `production-task191c-20260927`
- Region: `sin`
- Schema / migration: なし。Task191Aのproduction schemaをそのまま利用。

Production: Task191C complete

## Task191C production確認

- migrationなしのためproduction DB backupは不要。
- Railway production build:
  - Prisma Client v5.7.0 再生成成功
  - Next.js production build / type check 成功
  - 既存 `/api/repairs/recent` の Dynamic server usage ログはbuild失敗ではなくTask191C対象外
- Runtime: `next start` 正常起動、`Ready in 400ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - `/api/orders` = 200（既存挙動。今回アクセス制御は変更していない）
  - 未認証 `/api/settings/procurement` = 401
- productionデータを書き換える `PUT /api/orders/[id]` の実データsmokeは実施していない。

## Task191C 実装内容

- `OrderRequest.expectedArrivalDate` を Asia/Tokyo 基準の暦日で算出。
- 算式: 発注日 + Supplier処理日数 + ProcurementShippingMethod輸送日数。
- `0` は有効、必要設定不足は `null`。
- `orderedAt` は最初の発注日時を保持。
- status-only の `ordered` 再送では保存済み予定日を維持し、Task191B設定変更だけでは既存発注を勝手に再計算しない。
- 配送方法が実際に変わった場合、初回ordered遷移、または既存orderedAt欠落時だけ再計算。
- `pending` でも配送方法を保存でき、予定日だけ `null`。
- `received` / `assigned` では当時の予定日を履歴として保持。
- 発注済みにする操作では配送方法IDを同一PUTへ含める。

## Validation / Review

- Task191C resolver / update logic: 8 / 8 PASS
- RepairPartAllocation: 26 / 26 PASS
- Task191B procurement settings: 6 / 6 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → カタリ独立レビュー完了。
- 初回レビュー指摘3点
  1. pending時の配送方法保持
  2. ordered snapshotの再計算条件
  3. 発注PUTへの配送方法ID同梱
  は修正済み。
- schema / migration / seed / roadmap / Task184 scheduler へのTask外差分なし。

## Schedule / Scheduler の現在地

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了
6. Task188: WorkTimeSession基盤 — production完了
7. Task189: 共通業務タイマーUI — production完了
8. Task190A: Scheduler設定・標準作業時間 schema foundation — production完了
9. Task190B: WorkTimeSession実績集計・統計resolver — production完了
10. Task190C: Scheduler設定UI/API — production完了
11. Task190D: Repair作業時間 read-only preview — production完了
12. Task190E: Repair.estimatedWorkMinutesへの安全なpreview → apply接続 — production完了
13. Task191A: 発注リードタイム・作業中断 schema foundation — production完了
14. Task191B: Supplier / ProcurementShippingMethod 設定操作 — production完了
15. Task191C: OrderRequest入荷予定resolver / 配送方法接続 — production完了

## 現在のTask: Task191D

Production: pending

- `partsReadyDate` をEstimateItem・RepairPartAllocation・OrderRequestから導出するresolverを実装。
- `RepairPlanningState` のblock/resume APIとRepair画面の操作を実装。
- block時は同一Repairの稼働中WorkTimeSessionをPlanningState更新と同じtransactionで停止する。
- schema / migration / seed / RLS / GRANT、Repair.status、Task184 schedulerは変更しない。
- Task191Eで部品準備とblocked状態をschedulerの除外条件へ接続する。
- 詳細: `docs/ai-tasks/191d-parts-readiness-repair-planning.md`。
- ローカル実装・テスト・カタリ独立レビュー完了。初回レビュー指摘3点は修正済み。
- validation: Parts readiness 7/7、Planning 2/2、WorkTimeSession 5/5、RepairPartAllocation 26/26、Order expected arrival 8/8、Prisma validate、TypeScript、diff checkすべてPASS。
- local buildはWindows環境のPrisma DLL / worker `EPERM`により未確認。productionはpending。
- commit後、production反映は別途判断する。
