# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

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

- Task188「WorkTimeSession基盤」はローカル実装・検証済み。詳細は `docs/ai-tasks/188-work-time-session-foundation.md`。
- Task188の新規テーブル / migration / RLS / GRANT は高リスク変更。カタリ独立レビュー済み（startedAt単独index追加、過剰なPUBLIC/enum REVOKE削除を指摘し、Codex修正後の再レビューPASS）。production 適用は未実施。
- Production: pending。push / production migration / deploy は未実施。
- 既存Task184の自動スケジューラーは引き続き実運用可能。後続Task実装までは既存`estimatedWorkMinutes` / `scheduledDate`を使用する。
- マスタデータ投入・復旧は別Taskとして並行可。Schedule差分と混ぜない。
- Task189以降はユーザー承認なしに開始しない。
