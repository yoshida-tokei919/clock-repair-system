# CURRENT TASK

## 現在のcheckpoint — 2026-09-29

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `e8f5eb97d4955d8d01547c250f1ebd010e860ff6`
- Commit subject: `feat: add procurement lead-time feedback`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `24cc4192-7999-4497-9da1-1166b0f5e833`
- Deployment status: `SUCCESS`
- Production tag: `production-task195b-20260929`
- Region: `sin`
- Supabase migration: none

Production: Task195B complete

## Task195B production確認

- `OrderRequest.orderedAt -> receivedAt` の実績から調達総リードタイムをread-only集計。
- 実績日数はTask191と同じAsia/Tokyo暦日基準。
- 集計単位はSupplier × ProcurementShippingMethodの組。
- 片側が欠ける実績は「不明」dimensionとして保持し、もう片側へ原因帰属しない。
- 未受領 / 不正interval / cancelledは集計対象外。
- 表示項目:
  - sampleCount
  - median
  - mean
  - P80
  - min / max
  - 現在設定の合計日数
  - 現在設定との差
- 現在設定合計はTask191と同じ `manualProcessingLeadDays + manualTransitLeadDays` の成立条件を使用。
- 観測できるのは総リードタイムのみで、Supplier処理日数と輸送日数へ分解しない。
- Supplier / ShippingMethod設定値の自動更新なし。
- expectedArrivalDate / parts readiness / Scheduler挙動の変更なし。
- feedback APIは既存procurement設定APIから分離し、feedback取得失敗時も設定編集を継続可能。
- APIは認証必須・read-only。
- カタリ独立レビュー: blocking issueなし。
- Task195B + Task191周辺回帰: 27 / 27 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- schema / migration / seed / RLS / GRANT変更なし。
- Railway deploy: SUCCESS。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/settings/scheduler` = 307
  - 未認証 `GET /api/settings/procurement/feedback` = 401
- 詳細: `docs/ai-tasks/195b-procurement-lead-time-feedback.md`

## Scheduler / Feedback の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了
7. Task194: 今日の作業dashboard — production完了
8. Task195A: Repair作業時間実績feedbackをScheduler v2へ表示 — production完了
9. Task195B: 調達総リードタイム実績feedback — production完了

## 次のTask: Task195C

Status: awaiting user approval

### 目的

WorkTimeSessionの非REPAIR実績とSchedulerActivitySettingの予約枠を比較し、共通業務の実績feedbackをread-onlyで可視化する。

### 想定対象

- ESTIMATE
- INQUIRY
- PARTS_ORDER
- INTAKE
- CUSTOMER_CONTACT
- SHIPPING
- ADMIN
- OTHER

### 境界

- REPAIR実績はTask190 / Task195Aの正本を維持し、混在させない。
- まず実績と現在の `dailyReservedMinutes` / manual standard / learning設定を比較表示する。
- Task195Cでは予約枠を自動更新しない。
- 既存WorkTimeSessionのactivityType別集計helperを優先再利用する。
- schema変更が必要なら別高リスクTaskへ分離する。
- Task195D/Eの実効容量・遅延buffer・調達内訳学習は開始しない。

Task195Cはユーザー承認後に開始する。
