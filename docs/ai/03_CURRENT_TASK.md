# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `d69e2fcdfc60e852cc09594311ba31a788cee8d2`
- Commit subject: `feat: add work time session foundation`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0bcf36a8-d0a2-44fd-a9c0-33c7ee520bef`
- Deployment status: `SUCCESS`
- Production tag: `production-task188-20260927`
- Region: `sin`
- Supabase migration: `20260926203459 add_work_time_session`
- Production backup: `C:\\Users\\yoshi\\clock-repair-backups\\task188-20260926T202752Z`

Production: Task188 complete

## Task188 production確認

- Railway source commit: `d69e2fcdfc60e852cc09594311ba31a788cee8d2`
- Railway runtime:
  - `next start` 正常起動
  - `Ready in 411ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `GET /api/work-time-sessions/active` = 401
  - unauthenticated `GET /api/work-calendar?month=2026-09` = 401
- `WorkTimeSession`: 初期0件、RLS有効、policy 0件、Data API 3 roleのtable / sequence privilege 0件
- `startedAt` 単独index、各FK + startedAt index、single-active partial unique index、FK 3本、CHECK 2本をproductionで確認
- local related tests: 12 / 12 PASS
- Prisma validate / TypeScript / local Next build / `git diff --check`: PASS
- Railway production build/deploy: SUCCESS

## Schedule MVPの現在地

1. Step 1: Schedule MVP基盤 — **Task182 production完了**
2. Step 2: WorkCalendar MVP — **Task183 production完了**
3. Step 3: シンプル自動スケジューラー — **Task184 production完了**
4. **Step 1〜3完了。スケジュール込み実運用開始ポイントへ到達**

## 直近完了Task

### Task188: WorkTimeSession基盤

- commit: `d69e2fcdfc60e852cc09594311ba31a788cee8d2`
- 詳細: `docs/ai-tasks/188-work-time-session-foundation.md`
- WorkTimeSession schema / migration / server API / snapshot / 状態遷移を実装
- 同時active sessionはDB partial unique indexで全体1件を保証
- RepairLineItem.idへ強く依存せず、開始時条件をsnapshot保存
- server-only / Data API非公開としてRLS有効、anon / authenticated / service_role権限なし
- production backup / migration / deploy / smoke / production tagまで完了
- Production: complete

### Task187: Task185/186 実装前調査

- docs-only / investigation-only
- 詳細: `docs/ai-tasks/187-work-time-scheduler-preimplementation-investigation.md`
- 現行 `scheduledDate（予定日）` だけでは複数日分割を表現できないため、予定明細モデルが必要
- WorkTimeSession（作業時間セッション）は開始/終了区間の履歴を持つ新規モデルが適切
- RepairLineItem（修理明細）はreplaceでID再採番されるため、実績履歴をRepairLineItem.idへ強く依存させない
- 部品待ちstatusはOrderRequest / RepairPartAllocationと連動するため、作業中断状態はRepair.statusと分離する方向
- 新規テーブルは原則server-only / Data API非公開 / GRANT不要の方向
- 実装Task案はTask188〜195へ分割。Task187後の設計追補でスケジューラ専用設定レイヤーを追加したため、Task188/189は基本方針維持、Task190以降は設定モデルを前提にTask境界・schemaを再確認する。ユーザー承認なしに開始しない
- schema / migration / API / UI / DB変更なし
- Production: pending（docs-onlyのためdeploy対象外）

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

- Task188「WorkTimeSession基盤」はproduction完了。詳細は `docs/ai-tasks/188-work-time-session-foundation.md`。
- 次候補はTask189「共通業務タイマーUI」。Repair / Inquiry / OrderRequest / 共通業務をTask188のタイマー基盤へ接続する。
- Task189はユーザー承認なしに開始しない。
- 既存Task184の自動スケジューラーは引き続き実運用可能。後続Task実装までは既存`estimatedWorkMinutes` / `scheduledDate`を使用する。
- マスタデータ投入・復旧は別Taskとして並行可。Schedule差分と混ぜない。
