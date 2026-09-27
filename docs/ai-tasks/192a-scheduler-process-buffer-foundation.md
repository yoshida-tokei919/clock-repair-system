# Task192A: Scheduler 工程日数設定 foundation

Production: pending。Task192B の read-only preview に先立つ設定保存の基盤。commit、push、production migration、deploy はこの段階では行わない。

## 範囲

- `SchedulerSetting(id=1)` に `runningTestDays`、`reworkBufferDays`、`shippingBufferDays` を nullable `Int` として追加する。`null` は未設定、`0` は明示的な0暦日。Task186の3/3/1日は設計上の初期案であり、既存行へbackfillしない。
- migration の `CHECK` で各値を `null` または0以上に制限する。既存のserver-only `SchedulerSetting` を使い、新しいtable、Data API GRANT、RLS policyは追加しない。
- `/settings/scheduler` で3項目を読み書きする。`/api/settings/scheduler` の既存認証・singleton確認・exact-key validationを維持し、`null`、0、非負整数を受け付け、負数・小数・文字列・欠落・未知のkeyを拒否する。
- Task184 auto scheduler、WorkCalendar、`scheduledDate`、`deliveryDateExpected`、`Repair.status`、部品準備判定、`priorityScore`、`estimatedWorkMinutes`、`standardDailyMinutes` の実効容量接続は変更しない。`standardLeadDays` も追加しない。
- Task192Bのread-only previewやTask193の`RepairScheduleSegment`は含まない。Shipment、LINE、PDF、shared page、PublicCaseも対象外。

## ローカル確認

- `npx prisma validate`: PASS。
- `src/lib/scheduler-settings-domain.test.ts`: 7 / 7 PASS。
- `tests/task192a-schema.test.mjs`: 1 / 1 PASS。migrationのnullable列、CHECK、backfillなしを静的確認。
- `tests/task190a-schema.test.mjs`: 4 / 4 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- `next lint` はESLint設定の選択プロンプトが出て実行されず、未確認。
- `npx prisma generate`: 既存Windows DLLのunlinkが `EPERM`。`PRISMA_GENERATE_NO_ENGINE=1` は制限されたネットワークでschema engineを取得できず失敗。生成は未確認。
- PostgreSQL実適用は未確認。ローカルDocker APIはpermission denied。
