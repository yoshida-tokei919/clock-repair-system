# CURRENT TASK

## 現在のcheckpoint — 2026-09-30

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `829314f63c2e8d431e18249e54f03956feb83fec`
- Commit subject: `feat: add activity reservation feedback`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `a1a3426e-468e-4df9-8130-1858ce6e7daa`
- Deployment status: `SUCCESS`
- Production tag: `production-task195c-20260930`
- Region: `sin`
- Supabase migration: none

Production: Task195C complete

## Task195C production確認

- WorkTimeSessionの非REPAIR実績をSchedulerActivitySetting単位でread-only集計。
- 対象:
  - ESTIMATE
  - INTAKE
  - INQUIRY
  - CUSTOMER_CONTACT
  - PARTS_ORDER
  - SHIPPING
  - ADMIN
  - OTHER
- REPAIRはTask190 / Task195Aの正本を維持し、Task195C集計から除外。
- `dailyReservedMinutes` は1日単位の容量控除なので、主比較はAsia/Tokyoの日別合計実績。
- 日別実績は計測がある日だけを分母とし、未計測日を0分として扱わない。
- 予約枠との差は日別平均を主指標とする。
- 中央値 / 平均 / P80 / min / maxを参考表示。
- 1セッション単位統計は日次予約とは別の参考値として表示。
- ESTIMATE / INQUIRY / PARTS_ORDERはTask190の既存1対象あたり学習値を補助表示として再利用。
- open session / invalidated session / 不正interval / future sessionは実績対象外。
- 東京時間0時跨ぎは日別合計を正しく分割。
- feedback APIは認証必須・read-only。
- feedback取得失敗時も既存Scheduler設定の編集・保存は継続可能。
- SchedulerActivitySettingの自動更新なし。
- Task192実効容量計算 / Scheduler v2 planner・applyの変更なし。
- schema / migration / seed / RLS / GRANT変更なし。
- カタリ独立レビューで、予約枠との差の主比較を中央値から日別平均へ修正。
- 最終関連回帰: 55 / 55 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- API auth / read-only boundary: PASS。
- Scheduler core unchanged: PASS。
- Railway deploy: SUCCESS。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/settings/scheduler` = 307
  - 未認証 `GET /api/settings/scheduler/activities/feedback` = 401
- 詳細: `docs/ai-tasks/195c-activity-reservation-feedback.md`

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
10. Task195C: 非REPAIR共通業務の実績と日次予約枠feedback — production完了

## 次のTask候補: Task195D

Status: awaiting user approval

### 目的候補

実作業実績を実効作業容量へ戻すfeedbackをread-onlyで可視化する。

### 境界

- 詳細な集計単位・期間・分母は実装前調査で既存設計と照合して確定する。
- Task192の実効容量計算を自動変更しない。
- Scheduler v2へ学習値を自動反映しない。
- 遅延buffer学習、調達内訳学習、Task196以降は開始しない。
- schema変更が必要なら別高リスクTaskへ分離する。

Task195Dはユーザー承認後に実装前調査から開始する。
