# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `3a5b53f5cbff979cd4d17f283298b3a5f3b9a34e`
- Commit subject: `feat: add parts readiness and repair planning`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `b9a1c248-89d5-4713-bc92-d549131ac3c1`
- Deployment status: `SUCCESS`
- Production tag: `production-task191d-20260927`
- Region: `sin`
- Schema / migration: なし。Task191Aのproduction schemaをそのまま利用。

Production: Task191D complete

## Task191D production確認

- schema / migrationなしのためproduction DB backup / migrationは不要。
- Railway production build:
  - Prisma Client v5.7.0生成成功
  - Next.js production compile成功
  - lint / type check通過
  - static pages 66/66生成完了
  - 既存 `/api/repairs/recent` の Dynamic server usageログはbuild失敗ではなくTask191D対象外
- Runtime: `next start` 正常起動、`Ready in 757ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/repairs/1/planning` = 401（想定どおり）

## Task191D 実装内容

- EstimateItem・RepairPartAllocation・OrderRequestから部品準備状態と `partsReadyDate` を保存せず導出。
- `RepairPlanningState` のblock/update/resumeを認証付きAPIとRepair詳細画面へ接続。
- 中断中も理由・メモ・残作業時間・再開可能日・再確認日を更新可能。
- block/update時、同一Repairに紐づくactive WorkTimeSessionをactivityTypeに関係なく同一transaction内で停止。別Repair / global timerは停止しない。
- `WAITING_PARTS` 選択時、空欄なら部品準備見込み日を再開可能日の入力候補にする。
- Repair.status / scheduledDate / scheduleLocked / Task184 schedulerは変更していない。

## Validation / Review

- Parts readiness: 7 / 7 PASS
- Planning parser: 2 / 2 PASS
- WorkTimeSession: 5 / 5 PASS
- RepairPartAllocation: 26 / 26 PASS
- Order expected arrival: 8 / 8 PASS
- 合計48 / 48 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → カタリ独立レビュー完了。
- 初回レビュー指摘3点（同Repair timer停止条件、中断中の編集UI、WAITING_PARTS時の再開可能日候補入力）は修正済み。
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
16. Task191D: 部品準備日・作業中断/再開 — production完了

## 現在のTask: Task191D

Production: complete

- Task191Dはproduction反映・smoke・tagまで完了。
- Production application commit: `3a5b53f5cbff979cd4d17f283298b3a5f3b9a34e`
- Railway deployment: `b9a1c248-89d5-4713-bc92-d549131ac3c1`
- Production tag: `production-task191d-20260927`
- 詳細: `docs/ai-tasks/191d-parts-readiness-repair-planning.md`
- 次Task候補はTask191E: derived parts readiness + `RepairPlanningState.blocked` をTask184 schedulerの除外条件へ接続する。
- 次Taskはユーザー承認なしに開始しない。
