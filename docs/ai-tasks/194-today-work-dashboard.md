# Task194 — 今日の作業 dashboard

Status: production complete
Date: 2026-09-28

## 目的

Scheduler v2で確定した当日予定と、部品準備・中断/再開・当日容量・WorkTimeSessionを一画面へ集約する。

## 実装

### Route / Navigation

- `/repairs/today`
- Sidebarへ「今日の作業」を追加。
- 既存 `/repairs/*` middleware auth境界を利用。

### Read model

`src/lib/today-work.ts`

- Tokyo日付は既存 `todayInJapan` を再利用。
- Task192 `loadDeadlineCapacityPreview` を再利用。
- RepairScheduleSegmentを追加で読取り、segment正本 / legacy fallbackを統合。

#### 予定正本

- Repairにsegmentが1件以上ある場合:
  - 今日の `RepairScheduleSegment.workDate` だけを当日予定として採用。
  - `Repair.scheduledDate` は当日判定に使用しない。
- segmentが0件の場合:
  - `Repair.scheduledDate == today` をlegacy fallbackとして1回だけ採用。

#### 作業時間

- segment: `plannedMinutes`
- legacy fallback: Task192が導出した `PreviewRepairAnalysis.workMinutes`
- `remainingWorkMinutes=0` はworkMinutes nullとして扱い、estimatedWorkMinutesへfallbackしない。
- workMinutes nullのlegacy予定は0分で状態確認sectionに残せるが、容量には加算しない。

### Capacity

Task192の既存計算を再利用。

- grossMinutes = WorkCalendar総容量
- reservedMinutes = schedule review + activity reservations
- effectiveMinutes = gross - reserved（下限0）
- plannedMinutes = 今日のcanonical plan
- remainingMinutes = max(0, effective - planned)
- overbookedMinutes = max(0, planned - effective)
- overReservedMinutes = Task192既存値

### Sections

mutually exclusive:

1. ready
2. resume
3. blocked
4. parts
5. status

部品準備判定はTask191/192の既存parts readinessを再利用。

### Ordering

Task184/193互換:

1. priorityScore DESC
2. deliveryDateExpected ASC null-last
3. receptionDate ASC null-last
4. id ASC

### Attention

新しい予測scoreは追加せず、既存情報のみ利用。

- 納期超過
- 工程期限超過
- 作業中断中
- 部品未確保 / 状況不明

### Timer

- ready rowから既存 `WorkTimerStartButton` を使用してREPAIR timer開始。
- 各rowからRepair詳細の `#repair-timer-heading` へリンク。

## 独立レビュー

カタリ独立レビューで以下を指摘:

Task194初版はlegacy fallbackについて
`remainingWorkMinutes > 0 ? remaining : estimated`
を再実装しており、Task192の意味と差があった。

Task192ではremainingWorkMinutesが非nullなら常に優先され、0は「残作業なし」としてworkMinutes nullになる。
修正後はTask192の `repair.workMinutes` を直接再利用する。

## Validation

- Codex関連回帰: 111 tests PASS。
- 独立レビュー修正後:
  - today-work + Task192重点回帰: 33 / 33 PASS。
  - TypeScript: PASS。
  - diff whitespace check: PASS。
- schema / migration / seed / RLS / GRANT変更なし。
- PhysicalTag/NFC要件docの内容変更なし。

## Production

- Application commit: `c62e756d784179980e50dfdc127cfd2a6158b524`
- Commit subject: `feat: add today work dashboard`
- Railway deployment: `427d78f8-e624-4c59-90cb-f357a079f327`
- Status: `SUCCESS`
- Runtime: `Ready in 793ms`
- Production tag: `production-task194-20260928`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated /repairs/today 307 redirect

## 次Task

Task195: 実績フィードバック基盤。
