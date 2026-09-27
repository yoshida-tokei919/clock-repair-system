# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `3b8d372cbbca0a5379b6a7626eaf63130fe557ab`
- Commit subject: `feat: add scheduler process buffer settings`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `1152ec4b-11c6-4493-8d86-be0a7b061fc0`
- Deployment status: `SUCCESS`
- Production tag: `production-task192a-20260928`
- Region: `sin`
- Supabase migration: `20260927163924 add_scheduler_process_buffers`

Production: Task192A complete

## Task192A production確認

- production DB backup取得済み（schema / data）。
- `SchedulerSetting` に以下3列を追加:
  - `runningTestDays Int?`
  - `reworkBufferDays Int?`
  - `shippingBufferDays Int?`
- 3列はいずれも nullable integer / defaultなし。
- CHECK制約で `null` または0以上に制限。
- Task186の3/3/1はbackfillしていない。
- `SchedulerSetting(id=1)` の3値はmigration後もすべて `null`。
- 新規table / Data API GRANT / RLS policy変更なし。
- Railway production buildでPrisma Client生成・Next.js build完了、deployment `SUCCESS`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/settings/scheduler` = 401（想定どおり）

## Task192A 実装内容

- Scheduler設定へランニングテスト・再調整余裕・発送余裕の暦日設定を追加。
- `null` = 未設定、`0` = 明示的な0日。
- settings API exact-key validationへ3項目を接続。
- `/settings/scheduler` で編集可能。
- UI上で空欄 / 0の意味と、現行auto schedulerへ未接続であることを明示。
- Task184 auto scheduler、WorkCalendar、scheduledDate、deliveryDateExpected、Repair.status、parts readiness、priorityScore、estimatedWorkMinutesには接続していない。
- `standardDailyMinutes` のWorkCalendar接続、`standardLeadDays`、Task192B、Task193は対象外。

## Validation / Review

- `npx prisma validate`: PASS
- Scheduler settings domain: 7 / 7 PASS
- Task190A schema regression: 4 / 4 PASS
- Task192A schema: 1 / 1 PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → カタリ独立レビュー: 指摘なし / PASS
- Supabase security advisor: 適用前後で既存指摘のみ、Task192A由来の新規指摘なし。

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
18. Task192A: Scheduler 工程日数設定 foundation — production完了

## 現在のTask: Task192A

Production: complete

- 詳細: `docs/ai-tasks/192a-scheduler-process-buffer-foundation.md`
- 次Task候補はTask192B: 納期逆算・実効容量 read-only preview。
- Task192BではTask192Aの工程日数設定、WorkCalendar、estimatedWorkMinutes、Task191 parts readiness / planning stateをpure resolver中心で接続する。
- Task193の複数日分割 / RepairScheduleSegmentへは踏み込まない。
- 次Taskはユーザー承認なしに実装開始しない。
