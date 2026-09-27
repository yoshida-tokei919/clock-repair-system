# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `0deae211300ac3a86f729fce2fc807b6ec5cf073`
- Commit subject: `feat: add procurement lead time settings`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `72d13243-70ba-48de-a50c-0a128bef040e`
- Deployment status: `SUCCESS`
- Production tag: `production-task191b-20260927`
- Region: `sin`
- Schema / migration: なし。Task191Aのproduction schemaをそのまま利用。

Production: Task191B complete

## 現在の実装 Task191C

- `OrderRequest.expectedArrivalDate` の Asia/Tokyo 暦日 resolver と、発注管理の配送方法選択・予定日表示をローカル実装済み。
- resolver test 8件、既存 RepairPartAllocation test 26件、Task191B 設定 test 6件、Prisma validate、TypeScript型チェックは PASS。認証付き実画面は未確認。
- `pending` は配送方法を保持して予定日だけを消す。`ordered` の status-only 更新では予定日を維持し、注文への遷移・未設定の発注日時・配送方法変更時だけ再計算する。画面の発注済み操作は配送方法IDも送信する。
- 既存の発注 status 更新、入荷時の在庫処理、RepairPartAllocation は維持する。
- schema / migration / seed、partsReadyDate、RepairPlanningState、Task184 scheduler は Task191C の変更対象外。
- 詳細: `docs/ai-tasks/191c-order-expected-arrival-resolver.md`
- Production: pending。Task191C の commit / push / deploy は未実施。

## Task191B production確認

- migrationなしのためproduction DB backupは不要。
- Railway production build:
  - Prisma Client v5.7.0 再生成成功
  - Next.js production build / type check 成功
  - 既存 `/api/repairs/recent` の Dynamic server usage ログはbuild失敗ではなくTask191B対象外
- Runtime: `next start` 正常起動、`Ready in 241ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/settings/procurement` = 401
- local validation:
  - Task191B domain / API helper test: 6 / 6 PASS
  - 既存 scheduler settings domain test: 7 / 7 PASS
  - `npx prisma validate`: PASS
  - Task191A schema対応の一時Prisma Clientを用いた `tsc --noEmit --incremental false`: PASS
  - 一時生成物は削除済み
  - commit diff check: PASS
- Codex実装 → カタリ独立レビュー完了。コードレビュー指摘なし。
- schema / migration / seed / OrderRequest / RepairPlanningState / Task184 scheduler は変更していない。
- Supplier処理日数と調達配送方法の輸送日数を分離し、null と 0 を区別する。
- Cousins、DHL、国内郵便等の所要日数は推測でハードコードしていない。

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

## 直近完了Task

### Task191B: Supplier / ProcurementShippingMethod の設定操作

- production application commit: `0deae211300ac3a86f729fce2fc807b6ec5cf073`
- `/settings/scheduler` に調達リードタイム設定を追加。
- Supplierごとの手動処理日数を設定可能。
- ProcurementShippingMethodの作成・編集・有効/無効化と手動輸送日数を設定可能。
- 設定APIは認証必須。入力不正400、ID不在404、配送方法名重複409。
- 削除APIは設けず履歴参照を保護する。
- 到着予定resolver、partsReadyDate、中断状態との業務連携、scheduler連携は未実装。
- Production: complete

## 次に行うこと

- Task191C はローカル実装・テスト・カタリ独立レビュー完了。レビュー指摘3点は修正済み。production反映は未実施。
- Task191C validation: resolver 8/8、RepairPartAllocation 26/26、Task191B procurement 6/6、Prisma validate、TypeScript、diff check すべてPASS。
- partsReadyDate、中断/再開、Task184 schedulerへの連携は後続Taskで扱う。
