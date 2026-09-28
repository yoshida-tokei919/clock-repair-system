# Task193B — Scheduler v2 segment-based read-only preview

Status: production complete
Date: 2026-09-28

## 目的

Task193Aで追加した `RepairScheduleSegment` を読み取り、既存予定を壊さずに複数日へ分割したScheduler v2案を表示する。
このTaskではpreviewのみとし、DBへの予定反映は行わない。

## 実装境界

- Task192B `loadDeadlineCapacityPreview()` / `resolveDeadlineCapacityPreview()` の結果を再利用。
- capacity / reservation / process buffer / parts readiness / blocked / remainingWorkMinutes / deadline計算を複製しない。
- `status === "作業待ち"` を既存Task184互換のAUTO候補条件として維持。
- orderingは priorityScore DESC → deliveryDateExpected ASC null-last → receptionDate ASC null-last → id ASC。
- `blocked=true` は自動再開しない。reviewDateは開始可能日として使用しない。
- workMinutesはremainingWorkMinutesを優先し、なければ正のestimatedWorkMinutesを利用。
- 1分単位、plannedMinutes > 0、0分日はskip、1 Repair + 1 workDateは日別集約segment。
- candidateは全量配置成功時のみproposed loadへcommitし、失敗時はpartial allocationをrollback。
- MANUAL segment / schedule lockはAUTO変更対象外。
- current segmentが存在する場合はsegmentを詳細予定として扱い、legacy scheduledDateを二重計上しない。
- segment 0件ではscheduledDate + resolved workMinutesをlegacy fallbackとして扱う。
- proposedSummaryDateは最初のproposed segment日。

## 追加実装

- `src/lib/scheduler-v2-planner-domain.ts`
- `src/lib/scheduler-v2-preview.ts`
- `GET /api/repairs/scheduler-v2-preview`
- `src/components/repairs/SchedulerV2Preview.tsx`
- `/repairs/calendar` へ独立preview sectionを追加。
- APIはauth必須、force-dynamic、RepeatableRead、GET-only。
- snapshotRevisionはplannerVersion + Task192B revision + ordering metadata + existing segment rowsから生成。
- UIにapplyボタンは置かず、予定を変更しないpreviewであることを明示。

## 対象外

- RepairScheduleSegmentのINSERT / UPDATE / DELETE
- Repair.scheduledDate / scheduleLockedの更新
- RepairPlanningState / estimatedWorkMinutesの更新
- schema / migration / seed / RLS / GRANT
- Task184 POST/apply変更
- manual segment編集UI
- LINE / Shipment / PDF / shared page / PublicCase

## Validation

- Codex最終test: 62 / 62 PASS。
- カタリ独立回帰test: 61 / 61 PASS。
- TypeScript: PASS。
- git diff --check: PASS。
- Prisma write操作スキャン: 0件。
- 独立レビュー: 指摘なし / PASS。

## Production

- Application commit: `c768119f17e72dbaf7d10ba132bbcfb0747142bb`
- Railway deployment: `3bbe6916-a371-42b7-83c1-a70bdf81a688`
- Status: `SUCCESS`
- Production tag: `production-task193b-20260928`
- Runtime: `next start` / `Ready in 397ms`
- Migration: none
- Smoke: `/` 200, `/login` 200, unauthenticated `/repairs/calendar` 307, unauthenticated preview API 401。
