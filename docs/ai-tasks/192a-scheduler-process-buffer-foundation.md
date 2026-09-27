# Task192A: Scheduler 工程日数設定 foundation

Production: complete。Task192B の read-only preview に先立つ設定保存の基盤。

## 範囲

- `SchedulerSetting(id=1)` に `runningTestDays`、`reworkBufferDays`、`shippingBufferDays` を nullable `Int` として追加する。`null` は未設定、`0` は明示的な0暦日。Task186の3/3/1日は設計上の初期案であり、既存行へbackfillしない。
- migration の `CHECK` で各値を `null` または0以上に制限する。既存のserver-only `SchedulerSetting` を使い、新しいtable、Data API GRANT、RLS policyは追加しない。
- `/settings/scheduler` で3項目を読み書きする。`/api/settings/scheduler` の既存認証・singleton確認・exact-key validationを維持し、`null`、0、非負整数を受け付け、負数・小数・文字列・欠落・未知のkeyを拒否する。
- Task184 auto scheduler、WorkCalendar、`scheduledDate`、`deliveryDateExpected`、`Repair.status`、部品準備判定、`priorityScore`、`estimatedWorkMinutes`、`standardDailyMinutes` の実効容量接続は変更しない。`standardLeadDays` も追加しない。
- Task192Bのread-only previewやTask193の`RepairScheduleSegment`は含まない。Shipment、LINE、PDF、shared page、PublicCaseも対象外。

## ローカル確認 / 独立レビュー

- `npx prisma validate`: PASS。
- `src/lib/scheduler-settings-domain.test.ts`: 7 / 7 PASS。
- `tests/task192a-schema.test.mjs`: 1 / 1 PASS。migrationのnullable列、CHECK、backfillなしを静的確認。
- `tests/task190a-schema.test.mjs`: 4 / 4 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Codex実装 → カタリ独立レビュー: 指摘なし / PASS。
- local `npx prisma generate` はWindows DLL lockで `EPERM`。Railway production buildではPrisma Client生成が正常完了。

## Production

- Production application commit: `3b8d372cbbca0a5379b6a7626eaf63130fe557ab`
- Commit subject: `feat: add scheduler process buffer settings`
- Production backup:
  - `C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752\schema.sql`
  - `C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752\data.sql`
  - data-only dumpは既存の循環FKに関するrestore警告あり。dump自体は正常終了。
- Supabase migration: `20260927163924 add_scheduler_process_buffers`
- DB verification:
  - 3列はいずれも nullable integer / defaultなし。
  - 3つのCHECK制約を確認。
  - `SchedulerSetting(id=1)` は3項目とも `null` のまま。
  - security advisorは適用前後で既存指摘のみ、新規Task192A由来の指摘なし。
- Railway deployment: `1152ec4b-11c6-4493-8d86-be0a7b061fc0`
- Deployment status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task192a-20260928`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/settings/scheduler` = 401（想定どおり）

Task192A production反映完了。Task192Bは未着手。
