# Task192B: 納期逆算・実効容量 read-only preview

Production: complete。Application commit `8b65acdd8db584133857d9c6dad519b89f423116` を GitHub `main` から Railway へ自動deploy済み。

## 範囲

- `src/lib/deadline-capacity-preview-domain.ts`: Prismaに依存しない1日単位の計算。WorkCalendarの通常480分と例外行をgross容量とし、予定確認予約とSchedulerActivitySettingの予約を控除する。固定・仮予定の現行負荷、超過、案件ごとの納期窓・部品/中断制約・空き初日を導出する。
- `src/lib/deadline-capacity-preview.ts`: 同一DBスナップショットのRepair、WorkCalendar、SchedulerSetting、SchedulerActivitySettingを読み、Task191Dの `resolveRepairPartsReadiness()` で部品準備状態を導出する。作業時間は保存済み `remainingWorkMinutes` が非nullなら優先し、なければ正の `estimatedWorkMinutes` を使う。0分は作業時間未設定とする。
- `GET /api/repairs/deadline-capacity-preview`: 認証必須、dynamic、RepeatableRead transaction、読み取りのみ。SHA-256の `snapshotRevision` は情報表示用で、POST/apply tokenではない。
- `/repairs/calendar`: 既存のTask184自動スケジュール案と別の分析欄に、集計・案件別理由・日別実効容量を表示。予定への反映操作はない。

## 判定規則

- `runningTestDays`、`reworkBufferDays`、`shippingBufferDays` は3項目すべて非nullなら暦日で加算する。`0` は設定済み、`null` は未設定。3/3/1の暗黙fallbackは置かない。
- `latestWorkCompletionDate = deliveryDateExpected - totalProcessBufferDays`。標準納期 `standardLeadDays` は使わない。
- 部品 `NOT_REQUIRED` / `READY` は開始可能。`WAITING` かつ日付ありは最短開始候補を部品準備日以降へ移す。`WAITING_UNKNOWN` / `LEGACY_UNKNOWN` は日付を推測しない。
- `blocked=true` は再開可能日があっても `projectedEarliestDate` と空き初日を出さず、手動再開が必要と示す。`potentialEarliestDate` は再開後の参考値。`reviewDate` は開始制約にしない。
- 終端状態の予定負荷を除外する。それ以外の `scheduleLocked=true` の日付付き案件は中断・部品状態にかかわらず固定負荷として残す。未固定の日付付き案件は仮予定負荷とする。
- 1案件は1日で完了する前提で、計算窓内の実効容量そのものに入らなければ `REQUIRES_SPLIT_SCHEDULER`、他案件の現予定を除いた残容量に入らなければ `NO_CAPACITY_IN_WINDOW`。対象案件自身の現予定負荷は候補日の残容量から除外する。
- 対象期間はTask184と同じ基準日から180日。窓が期間外なら `BEYOND_PREVIEW_HORIZON` とし、期間外の空きは推測しない。余裕日数は最短開始候補と最遅完了日の暦日差。
- 現行の固定/仮予定が部品・納期制約または日別容量と競合する場合、競合理由を表示する。既存日付は変更しない。
- 現予定日だけがpreview対象期間外にある場合は競合とせず `BEYOND_PREVIEW_HORIZON` とする。対象期間外でも部品・納期制約に違反する現予定日は競合とする。
- 納期窓の実効容量が全日0分なら `NO_CAPACITY_IN_WINDOW` とする。正の実効容量がある日でも作業時間が1日に収まらない場合のみ `REQUIRES_SPLIT_SCHEDULER` とする。

## 検証

- レビュー後の修正3点を反映済み:
  1. preview対象期間外の `scheduledDate` は、部品・納期制約を満たす限り固定/仮予定とも `BEYOND_PREVIEW_HORIZON` とする。期間外でも制約違反は `LOCKED_DATE_CONFLICT` / `CURRENT_PLAN_CONFLICT` とする。
  2. 納期窓の実効容量が全日0分なら `NO_CAPACITY_IN_WINDOW` とし、正の容量があっても1日で収まらない場合に限り `REQUIRES_SPLIT_SCHEDULER` とする。
  3. 案件別UIに現在の `scheduledDate` と固定/仮の区分を表示する。
- pure domainのWorkCalendar、予約、固定/仮負荷、残作業時間、部品、中断、工程日数、納期窓、自己負荷除外、分割必要、容量不足、現予定競合、対象期間をテスト。
- loaderのcanonical部品準備導出とread-only query、revisionの関連入力変更をテスト。
- 上記修正後、`npx tsx --test` で新規テストと既存Task184、Task191D、WorkCalendarテスト: 47 / 47 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Codex実装後の独立レビューで指摘された上記3点を修正し、再確認PASS。
- 認証済みブラウザでの実画面と、認証済みproduction APIの動作確認は未実施。未認証のproduction smoke結果は下記に記録。

## Production

- Production application commit: `8b65acdd8db584133857d9c6dad519b89f423116`
- Commit subject: `feat: add deadline capacity preview`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `4a394a7c-15ed-4916-a472-4c8ba4d22f38`
- Deployment status: `SUCCESS`
- Production tag: `production-task192b-20260928`
- Region: `sin`
- schema / migration / RLS / GRANT変更なし。migrationがないためproduction backupは不要。
- Railway runtime: `next start` / `Ready in 295ms`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - 未認証 `GET /api/repairs/deadline-capacity-preview` = 401
- GET-onlyのread-only preview。予定のapplyや`RepairScheduleSegment`による複数日分割はTask193の範囲。

## 対象外

schema / migration / seed、Task184の配置・apply、`scheduledDate`・`Repair.status`・部品/中断日付の更新、Task193の `RepairScheduleSegment` と複数日分割、優先度式、WorkCalendar semantics、標準480分の変更、Shipment / ゆうプリR / LINE / PDF / shared page / PublicCase。
