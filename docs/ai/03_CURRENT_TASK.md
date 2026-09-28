# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `c768119f17e72dbaf7d10ba132bbcfb0747142bb`
- Commit subject: `feat: add scheduler v2 segment preview`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `3bbe6916-a371-42b7-83c1-a70bdf81a688`
- Deployment status: `SUCCESS`
- Production tag: `production-task193b-20260928`
- Region: `sin`
- Supabase migration: none
- Railway runtime: `next start` / `Ready in 397ms`

Production: Task193B complete

## Task193B production確認

- schema / migration / RLS / GRANT変更なし。
- production backupは不要（DB schema / data mutationなし）。
- Railway build: `prisma generate && next build` SUCCESS。
- 新route `/api/repairs/scheduler-v2-preview` がproduction buildへ含まれることを確認。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - 未認証 `GET /api/repairs/scheduler-v2-preview` = 401

## Task193B 実装内容

- Task192Bの納期逆算・実効容量・部品準備・中断判定を再利用するScheduler v2 pure plannerを追加。
- 1案件を複数日へ1分単位で分割し、日別容量内でAUTO segment案を生成。
- candidate単位でtentative allocationし、全量配置できない場合は完全rollback。
- fixed / preserved provisional / replaceable provisionalを分離し、MANUAL segmentとschedule lockを保護。
- segment存在時はlegacy `scheduledDate` を二重負荷計上しない。
- Task184互換のpriority orderingを維持。
- GET-only / RepeatableRead / auth必須のread-only preview APIを追加。
- `/repairs/calendar` にScheduler v2 preview sectionを追加し、apply操作は未実装。
- 詳細: `docs/ai-tasks/193b-scheduler-v2-readonly-preview.md`

## Validation / Review

- Codex実装 → カタリ独立レビュー: 指摘なし / PASS。
- Codex最終test: 62 / 62 PASS。
- カタリ独立回帰test: 61 / 61 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Scheduler v2新規コードのPrisma write操作スキャン: 0件。
- Task184 / Task192B / Task191D / WorkCalendar regression: PASS。
- `npm run lint` は既存repoにESLint設定がなく、Next.js初期設定の対話プロンプトになるため対象外。

## Schedule / Scheduler の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A: RepairScheduleSegment schema foundation — production完了
7. Task193B: segment-based Scheduler v2 read-only preview — production完了

## 現在のTask: Task193B

Production: complete

- 実装commit: `c768119`
- production tag: `production-task193b-20260928`
- 次Task候補はTask193C: Scheduler v2 apply境界・segment永続化・`scheduledDate` summary同期の実装前調査。
- apply / DB write / manual segment編集はTask193Bには含めていない。
- 次Taskはユーザー承認なしに実装開始しない。
