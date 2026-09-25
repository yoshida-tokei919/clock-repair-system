# CURRENT TASK

## 現在のcheckpoint — 2026-09-25

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `1b66b0bef90aceb4e8935246797acf094145ecf7`
- Commit subject: `feat: add simple auto scheduler MVP`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0c4bcef6-f4c0-44c9-8826-ba4060bac15e`
- Deployment status: `SUCCESS`
- Production tag: `production-task184-20260925`
- Region: `sin`
- Task184 schema / migration: なし
- Production DBの直近migrationは Task183 の `20260925072252 add_work_calendar`
- Production backup: Task184はmigrationなしのため不要

Production: Task184 complete

## Task184 production確認

- Railway source commit: `1b66b0bef90aceb4e8935246797acf094145ecf7`
- Railway runtime:
  - `next start` 正常起動
  - `Ready in 342ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `/repairs/calendar` = 307 → NextAuth
  - unauthenticated `GET /api/work-calendar?month=2026-09` = 401
  - unauthenticated `GET /api/repairs/auto-schedule` = 401
- schema / migration / RLS / GRANT変更なし
- local related tests: 15 / 15 PASS
- TypeScript: PASS
- `git diff --check`: PASS
- ローカルbuildは環境起因 `spawn EPERM` だったが、Railway production build/deployはSUCCESS

## Schedule MVPの現在地

1. Step 1: Schedule MVP基盤 — **Task182 production完了**
2. Step 2: WorkCalendar MVP — **Task183 production完了**
3. Step 3: シンプル自動スケジューラー — **Task184 production完了**
4. **Step 1〜3完了。スケジュール込み実運用開始ポイントへ到達**

## 直近完了Task

### Task184: シンプル自動スケジューラー MVP

- commit: `1b66b0bef90aceb4e8935246797acf094145ecf7`
- 詳細: `docs/ai-tasks/184-simple-auto-scheduler-mvp.md`
- 自動配置対象: `status=作業待ち`、未ロック、想定作業時間>0
- 並び順: `priorityScore` → 納品予定日 → 受付日 → ID
- WorkCalendarの日別容量を使用
- 固定予定は容量から控除し、自動で動かさない
- 配置不可案件の既存予定日は維持
- preview → 人間確認 → apply
- preview後の状態変化はrevision不一致で409
- 対象外理由・配置不可理由・日別案件内訳を表示
- B2B/B2C優先差、priorityScore正式計算式、発注リードタイムはTask184対象外

## 次に行うこと

- 新しいTaskはまだ開始しない。
- まずTask184の自動スケジューラーを実データで運用開始し、`estimatedWorkMinutes（想定作業時間）`、`deliveryDateExpected（納品予定日）`、`priorityScore（優先度）` の入力状況と使い勝手を確認する。
- 運用結果を見て、次Taskとして発注リードタイム連携またはスケジュール精度向上へ進む。
- マスタデータ投入・復旧は別Taskとして並行可。Schedule差分と混ぜない。
- ユーザー承認なしに次Taskを実装開始しない。
