# Task191E: Scheduler readiness gates

Production: complete

## 目的

Task191Dで導出できる部品準備状態と `RepairPlanningState.blocked` を、Task184のシンプル自動スケジューラーへ最小差分で接続する。

部品未準備または作業中断中のRepairを作業予定へ入れず、既存の優先順位・WorkCalendar・固定予定容量・preview → applyの競合防止は維持する。

## 実装

- `ScheduleRepair` に `planningBlocked` と `partsReadinessState` を追加。
- schedulerの除外判定を既存条件の後段へ追加。
  1. terminal
  2. `scheduleLocked=true`
  3. `status != 作業待ち`
  4. `estimatedWorkMinutes <= 0`
  5. `planningBlocked=true`
  6. parts readiness
- `NOT_REQUIRED` / `READY` のみ配置対象。
- `WAITING` / `WAITING_UNKNOWN` / `LEGACY_UNKNOWN` は除外。
- `LEGACY_UNKNOWN` はfail-closed。
- 新規除外理由へstructured `reasonCode` を追加。
  - `PLANNING_BLOCKED`
  - `PARTS_WAITING`
  - `PARTS_WAITING_UNKNOWN`
  - `PARTS_LEGACY_UNKNOWN`
- locked Repairはblocked/readinessに関係なく既存どおり固定予定として容量を消費する。
- `loadSchedule()` でplanning state、EstimateItem、RepairPartAllocation、OrderRequestを取得。
- readinessはTask191Dのcanonical `resolveRepairPartsReadiness()` を使用し、scheduler側へ判定ロジックを複製していない。
- preview revisionへraw sourceに加えてderived `planningBlocked` / `partsReadinessState` を明示。
- GET preview後にblocked/readinessが変わった状態で旧revisionをPOSTした場合、既存のstale protectionにより409となる。

## 境界

- schema / migration / seed / RLS / GRANT変更なし。
- `Repair.status` の自動同期なし。
- `partsReadyDate` / `resumeEligibleDate` / `reviewDate` を `scheduledDate` へ転記しない。
- priority formula変更なし。
- WorkCalendar semantics変更なし。
- 分割スケジュール、納期逆算、Scheduler v2はTask192以降。
- Shipment / ゆうプリR / LINE / PDF / shared page / PublicCaseは対象外。

## Local validation / review

- Scheduler / parts readiness / WorkCalendar / repair schedule関連: 24 / 24 PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装。
- カタリ独立レビュー実施。
- 独立レビュー指摘: derived scheduler eligibilityをrevisionへ明示すること。
- 修正後に独立再検証し、上記validationはすべてPASS。
- Task外ファイル変更なし。

## Production
- Production application commit: `122c2d9b3ed12ed7a62a0e258211fc3ae4f3aa8c`
- Commit subject: `feat: connect scheduler readiness gates`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `b5a59b8a-7b09-4bc4-b863-062971e7f88f`
- Deployment status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task191e-20260928`
- schema / migration: なし。production DB backup / migration不要。
- Runtime: `next start` 正常起動、`Ready in 256ms`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/repairs/auto-schedule` = 401（想定どおり）

Production: complete

## 次

Task192: 納期逆算・実効容量 read-only preview。

Task192の実装はユーザー承認なしに開始しない。
