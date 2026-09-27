# Task193A: RepairScheduleSegment schema foundation

Production: pending。schema と migration は未適用。既存の production application commit は `8b65acdd8db584133857d9c6dad519b89f423116`（Task192B）。

## 意味と範囲

`RepairScheduleSegment` は、将来の複数日スケジュールに使う日別予定明細の最小基盤。1つの `Repair` と1つの `workDate` の組に、1件の日別集約 segment だけを保存する。`plannedMinutes` はその日の正の予定分数、`sortOrder` は日別一覧の非負の表示順を表す。

`source=AUTO` は自動配置由来、`source=MANUAL` は手動配置由来を表す。現Taskは生成・更新操作を実装しない。

既存の `Repair.scheduledDate` は互換用の代表日・summary として維持し、この Task では値も意味も変更しない。既存予定から segment への backfill や seed 追加もしない。migration は新しい enum と空の table、制約、index、外部キーだけを作る。segment を予定の正本として使う規則と summary との同期は Task193B で決める。

## アクセス制御

この table は server-only。RLS を有効化し、`anon`、`authenticated`、`service_role` の table 権限と ID sequence 権限を `REVOKE ALL` する。Data API 用の `GRANT` や policy は追加しない。

## 対象外

Task193B 以降の planner、複数日への配置、preview → 人間確認 → apply、`scheduledDate` との同期・正本切替、自動再計算は対象外。Task184 自動スケジューラー、Task192B read-only preview、`scheduleLocked`、作業時間・残作業時間、優先度、WorkCalendar、Repair.status、画面/API、SchedulerSetting も変更しない。
