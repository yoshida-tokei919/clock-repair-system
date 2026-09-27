# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `acfd69de856974301006d2089b788279145a973d`
- Commit subject: `feat: add scheduler settings foundation`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `557a6e87-8ab6-46e6-a46c-04adcd73b495`
- Deployment status: `SUCCESS`
- Production tag: `production-task190a-20260927`
- Region: `sin`
- Supabase migration: `20260927004833 add_work_time_standard_settings`

Production: Task190A complete

## Task190A production確認

- Railway source commit: `acfd69de856974301006d2089b788279145a973d`
- Runtime:
  - `next start` 正常起動
  - `Ready in 574ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `GET /api/work-time-sessions/active` = 401
  - unauthenticated `GET /api/work-calendar?month=2026-09` = 401
- local Task190A tests: 4 / 4 PASS
- Prisma validate / TypeScript / `git diff --check`: PASS
- production backup: `C:\\Users\\yoshi\\clock-repair-backups\\task190a-20260927T004725Z`
- Supabase: 新3テーブルRLS有効、policy 0件、anon / authenticated / service_role のtable/sequence権限なし。
- カタリ独立レビュー済み。migration順序、nullable一意条件、server-only権限を修正・再確認済み。

## Schedule / Scheduler の現在地

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了
6. Task188: WorkTimeSession基盤 — production完了
7. Task189: 共通業務タイマーUI — production完了
8. Task190A: Scheduler設定・標準作業時間 schema foundation — production完了

## 直近完了Task

### Task190A: Scheduler設定・標準作業時間 schema foundation

- commit: `acfd69de856974301006d2089b788279145a973d`
- 詳細: `docs/ai-tasks/190a-scheduler-schema-foundation.md`
- `SchedulerSetting`、`SchedulerActivitySetting`、`RepairWorkTimeStandard` と型付きenum・DB制約を追加。
- server-onlyとしてRLSを有効化し、Data API用roleへtable/sequence権限を付与しない。
- 既存Scheduler / `estimatedWorkMinutes` / WorkCalendar容量計算にはまだ接続していない。
- Production: complete

## 次に行うこと

- 次候補は Task190B「WorkTimeSession実績集計・統計resolver」。
- Task190Aで作成した設定schemaを正本として使い、同一Repair + 同一作業条件の分割sessionを1 sampleへ集約する設計を実装する。
- Task190Bでは原則schemaを増やさず、WorkTimeSession履歴を削除・上書きしない。
- Task190Bはユーザー承認なしに開始しない。
- 既存 `docs/ai/02_PRODUCT_ROADMAP.md` の未commit差分はTask190A外として保護し、混ぜない。
- マスタデータ投入・復旧は別Taskとして並行可。Schedule差分と混ぜない。
