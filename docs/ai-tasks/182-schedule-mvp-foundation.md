# Task182: Schedule MVP Step 1 基盤

## 対象

既存 Repair の `scheduledDate`、`estimatedWorkMinutes`、`deliveryDateExpected`、`priorityScore` を再利用し、`scheduleLocked` だけを追加する。`deliveryDateActual` は既存列を維持し、今回の編集対象にはしない。

## 実装

- `Repair.scheduleLocked Boolean @default(false)`。`false` は将来の自動再配置を許可、`true` は予定日を固定する意図を表す。自動スケジューラー自体は後続 Task。
- migration は既存 Repair 表への `BOOLEAN NOT NULL DEFAULT false` 追加のみ。既存行は `false` となる。Repair はサーバー内部で利用する既存表のため、Data API の新規 GRANT は不要。
- `PATCH /api/repairs/[id]/schedule` は認証済みスタッフ用。作業予定日、想定作業時間、納品予定日、ロックの4項目を一括で受け取る。日付は `null` または実在する `YYYY-MM-DD`、時間は0以上の整数、ロックは boolean に限定する。余分なキーを拒否し、優先度や見積・部品・ステータスには触れない。ID/入力不正は400、対象なしは404。
- Repair 詳細画面に独立した作業スケジュール欄を設け、4項目を編集できる。`priorityScore` は参照のみ。
- 入力正規化と拒否条件を Node test で確認する。

## 範囲外

`plannedShipDate`、`scheduleStatus` enum、WorkCalendar、スケジューラー、Shipment、LINE、PDF、Kanban、優先度スコア計算式の変更、Repair の通常保存経路へのスケジュール項目追加。

## 確認

- `npx tsx --test src/lib/repair-schedule.test.ts`: 2 / 2 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- `npx prisma generate`: 未完了。Windows の `node_modules/.prisma/client/query_engine-windows.dll.node` の置換が `EPERM` で失敗した。実行中の共有 Node プロセスは停止していない。
- UI のブラウザ自動確認: 未確認。ローカル DB に今回の migration を適用しておらず、Repair 詳細画面を安全に起動できないため。

## Production

Production: pending。production application commit は `476b39be1a68d3c7d6ba58dfdd6796203c4682c6`。migration・DB変更・push・deploy・Task完了は未実施。
