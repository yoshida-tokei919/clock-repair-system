# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `9e2fe9d3260e2adb94039d0408afbbfa544a4e0a`
- Commit subject: `fix: make scheduler v2 planning apply-safe`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `dc08e8ef-c826-4046-a904-67dd96e152ea`
- Deployment status: `SUCCESS`
- Production tag: `production-task193c1-20260928`
- Region: `sin`
- Supabase migration: none

Production: Task193C1 complete

## Task193C1 production確認

- schema / migration / RLS / GRANT変更なし。
- DB write / apply API / apply UIなし。
- apply-safe fixed-point planner correctionのみ。
- Codex実装 → カタリ独立レビュー: blocking issueなし / PASS。
- 関連回帰test: 101 / 101 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Railway deployment: `SUCCESS`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `GET /api/repairs/scheduler-v2-preview` = 401
- 詳細: `docs/ai-tasks/193c1-scheduler-v2-apply-safe-planner.md`

## Schedule / Scheduler の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A: RepairScheduleSegment schema foundation — production完了
7. Task193B: segment-based Scheduler v2 read-only preview — production完了
8. Task193C1: Scheduler v2 apply-safe planner correction — production完了

## 現在のTask: Task193C2

Status: implementation authorized

### 目的

Scheduler v2 previewをrevision一致時のみ原子的にDBへ反映するapply backendを実装する。

### 実装境界

- clientからはpreview `revision`のみを受け取る。
- server側でpreview入力を再読込・再計算し、revision一致時だけapplyする。
- whole-preview atomic transaction / Serializableを基本とする。
- MANUAL segment / `scheduleLocked=true`は変更しない。
- changed AUTO candidateのみ既存AUTO segmentを置換し、no-opは書き換えない。
- legacy fallbackからsegmentへ移行する場合はproposed AUTO segmentを作成する。
- segmentが存在するRepairは`scheduledDate = min(workDate)`へ同期する。
- stale revision / serialization conflictは409。
- schema / migration / seed / RLS / GRANT変更なしを基本とする。
- apply UIとlegacy writer cutoverはTask193C3へ分離する。

### 高リスク扱い

このTaskはproduction data mutation経路を追加するため高リスク。
Codex実装 → カタリ独立レビューを行い、productionへpush / deployする前にユーザーの明示承認で停止する。

### 参照

- `docs/ai-tasks/193a-repair-schedule-segment-foundation.md`
- `docs/ai-tasks/193b-scheduler-v2-readonly-preview.md`
- `docs/ai-tasks/193c1-scheduler-v2-apply-safe-planner.md`
