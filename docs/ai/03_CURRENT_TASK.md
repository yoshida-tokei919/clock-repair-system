# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `122c2d9b3ed12ed7a62a0e258211fc3ae4f3aa8c`
- Commit subject: `feat: connect scheduler readiness gates`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `b5a59b8a-7b09-4bc4-b863-062971e7f88f`
- Deployment status: `SUCCESS`
- Production tag: `production-task191e-20260928`
- Region: `sin`
- Schema / migration: なし。Task191Aのproduction schemaをそのまま利用。

Production: Task191E complete

## Task191E production確認

- schema / migrationなしのためproduction DB backup / migrationは不要。
- Railway production build: `npm run build` 完了、deployment `SUCCESS`。
- Runtime: `next start` 正常起動、`Ready in 256ms`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/repairs/auto-schedule` = 401（想定どおり）

## Task191E 実装内容

- Task184 schedulerの既存条件に、Task191Dの `RepairPlanningState.blocked` とderived parts readinessを除外条件として接続。
- 除外判定の優先順は terminal → scheduleLocked → status → estimatedWorkMinutes → planning blocked → parts readiness。
- `NOT_REQUIRED` / `READY` のみ既存のsort / capacity計算へ進み、`WAITING` / `WAITING_UNKNOWN` / `LEGACY_UNKNOWN` は除外。
- `LEGACY_UNKNOWN` はfail-closedとし、status等へのfallbackは行わない。
- locked案件の既存固定容量消費は維持。
- routeはTask191Dのcanonical `resolveRepairPartsReadiness()` を利用し、readiness判定を重複実装していない。
- preview revisionへraw sourceに加えてderived `planningBlocked` / `partsReadinessState` を明示し、GET後に状態が変わったpreviewのPOST適用を409で拒否できる。
- Repair.status同期、partsReadyDate / resumeEligibleDate / reviewDateからscheduledDateへの転記、優先度式、WorkCalendar、分割Schedulerは変更していない。

## Validation / Review

- Scheduler / parts readiness / WorkCalendar / repair schedule関連: 24 / 24 PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → カタリ独立レビュー完了。
- 独立レビュー指摘1点（derived eligibilityをrevisionへ明示）は修正済み。
- schema / migration / seed / roadmapへのTask外差分なし。

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
17. Task191E: 部品準備・中断状態をTask184 scheduler除外条件へ接続 — production完了

## 現在のTask: Task191E

Production: complete

- Task191Eはproduction反映・smoke・tagまで完了。
- Production application commit: `122c2d9b3ed12ed7a62a0e258211fc3ae4f3aa8c`
- Railway deployment: `b5a59b8a-7b09-4bc4-b863-062971e7f88f`
- Production tag: `production-task191e-20260928`
- 詳細: `docs/ai-tasks/191e-scheduler-readiness-gates.md`
- 次Task候補はTask192: 納期逆算・実効容量 read-only preview。
- 次Taskはユーザー承認なしに実装開始しない。
