# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `33384b00a151573c815234841f4b1faef0b9c589`
- Commit subject: `feat: add repair schedule segment foundation`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0dc0a7c4-ac17-4792-b2f5-a606e3c59054`
- Deployment status: `SUCCESS`
- Production tag: `production-task193a-20260928`
- Region: `sin`
- Supabase migration: `20260927211044 add_repair_schedule_segment`
- Railway runtime: `next start` / `Ready in 373ms`

Production: Task193A complete

## Task193A production確認

- Production backup:
  - `C:\Users\yoshi\clock-repair-backups\task193a-20260928-060438`
  - read-only SQLによるpublic data + XSD / schema metadata fallback snapshot。
  - `public-data-and-xsd.xml` SHA256 `6A9AC4E767629F6836442096A92C25CB18AFAD84AE127B7DB56615738F368727`
  - `schema-metadata.json` SHA256 `F5AE90CBE0D95F88C8FA8B0926044A5E6EEA7D77BD27EB8EEBF64D34E60265FF`
  - Supabase Free planかつCLI未認証・未linkのためpg_dump archiveではない。Task192A時点のfull SQL dump baselineも保持。
- Production DB:
  - `RepairScheduleSegment` 0行。
  - enum `AUTO / MANUAL`、CHECK、FK cascade、unique/indexを確認。
  - RLS enabled、policy 0件。
  - anon / authenticated / service_role のtable SELECT権限なし。
  - 同3 roleのsequence USAGE権限なし。
- Security Advisor:
  - 新tableの `rls_enabled_no_policy` INFOはserver-only設計として意図どおり。
  - 既存2関数の `function_search_path_mutable` WARNはTask外。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - 未認証 `GET /api/repairs/deadline-capacity-preview` = 401

## Task193A 実装内容

- server-onlyの `RepairScheduleSegment` と `RepairScheduleSegmentSource(AUTO / MANUAL)` を追加。
- 1 Repair + 1 workDate = 1日別集約segment。
- `plannedMinutes > 0`、`sortOrder >= 0` をDB CHECKで保証。
- `Repair.scheduledDate` は既存summaryのまま維持し、backfill・同期・正本切替は未実装。
- Task193Bのplanner / preview / applyには未着手。
- 詳細: `docs/ai-tasks/193a-repair-schedule-segment-foundation.md`

## Validation / Review

- Task193A schema test: 4 / 4 PASS
- Task191A regression: 4 / 4 PASS
- Task192A regression: 1 / 1 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → カタリ独立レビュー: 指摘なし / PASS。
- `node --test` wrapperはWindows環境の `spawn EPERM`。各ファイル直接実行では全assertion PASS。

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
19. Task192B: 納期逆算・実効容量 read-only preview — production完了
20. Task193A: RepairScheduleSegment schema foundation — production完了

## 現在のTask: Task193A

Production: complete

- 詳細: `docs/ai-tasks/193a-repair-schedule-segment-foundation.md`
- 次Task候補はTask193B: segment-based Scheduler v2 planner / read-only preview。
- Task193Bの正確な境界は実装前調査で確定し、preview → applyの書き込み境界と `scheduledDate` summary同期を分離して安全に進める。
- 次Taskはユーザー承認なしに実装開始しない。
