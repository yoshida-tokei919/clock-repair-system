# Task195D — Capacity observation feedback

Status: production complete
Date: 2026-09-30

## 目的

WorkTimeSessionで実際に計測できた作業量と、現在のWorkCalendar / Scheduler予約設定から算出される容量をread-onlyで比較する。

Task195Dでは「真の実効容量」を自動学習しない。タイマー計測が全業務を網羅している保証がないため、未計測時間を空き時間・余剰容量とみなさない。

## 調査結論

現行schemaでは以下を安全に観測できる。

- 完了済みWorkTimeSessionの計測時間
- activityTypeによるREPAIR / 非REPAIR区分
- WorkCalendarの日付別現在保存値
- 現在のdailyScheduleReviewMinutes
- 現在のSchedulerActivitySetting.dailyReservedMinutes合計
- Task192の実効容量計算

一方、以下は安全に推定できない。

- タイマー未計測時間の実業務量
- 未計測日を0分とした平均
- historical reservation settings
- 過去日について編集前のWorkCalendar値
- これらから直接得られる「学習済み容量」

そのためTask195Dは記述的feedbackに限定する。

## 集計

対象:

- valid WorkTimeSession
- endedAtあり
- invalidatedAtなし
- endedAt >= startedAt
- now以前
- 今日より前のAsia/Tokyo部分

除外:

- active/open session
- invalidated session
- reversed / invalid interval
- future session
- 0秒sessionだけの日
- 今日の部分

東京時間0時を跨ぐsessionは日付境界で分割する。

## 観測日

- positiveな計測秒数がある日だけ。
- no-session dayは0分として追加しない。
- arbitraryな30日等のlookbackは設定しない。
- 保存済み全履歴の観測日を記述的に表示する。

## 表示

日別:

- WorkCalendar総容量
- 現在の予定確認枠
- 現在の共通業務予約枠
- 現在設定による修理向け実効容量
- overReservedMinutes
- measured REPAIR minutes
- measured non-REPAIR minutes
- total measured minutes

全観測日の平均:

- measured REPAIR
- measured non-REPAIR
- total measured

推奨容量は算出しない。

## WorkCalendar / reservation history caveat

WorkCalendarは各観測日について「現在DBに保存されている日付別値」を使用する。

過去日が後日編集されていれば当時値とは限らない。

予定確認枠・共通業務予約枠はhistorical settingsを保存していないため、現在設定を過去の観測日へ当てた参考比較である。

UIでこの制約を明示する。

## API / UI

`GET /api/settings/scheduler/capacity-feedback`

- session auth必須
- force-dynamic
- read-only
- SchedulerSetting / SchedulerActivitySetting / WorkCalendar / WorkTimeSessionをbulk read
- DB writeなし

Scheduler設定画面へread-only capacity feedbackを追加。

feedback取得失敗は既存設定の編集・保存を阻害しない。

## Scheduler safety

変更しない:

- Task192 capacity formula
- Scheduler v2 planner / preview / revision / apply
- WorkCalendar
- SchedulerSetting
- SchedulerActivitySetting
- Repair estimated/remaining minutes
- schema / migration / seed / RLS / GRANT

## 独立レビュー修正

1. Codex初版の固定30日report windowを削除。既存business ruleでないため採用しない。
2. 0秒sessionだけの日を観測日にしない。0秒artifactで平均容量feedbackが下がるのを防止。
3. WorkCalendarがimmutable historical snapshotではないことをUIで明記。
4. historical reservation settingsがないため、現在設定との参考比較と明記。

## Validation

- Task195D + Task195C + Task192 + WorkTimeSession関連回帰: 55 / 55 PASS。
- TypeScript: PASS。
- tracked/new-file whitespace check: PASS。
- auth / read-only: PASS。
- Task192 / Scheduler / schema core unchanged: PASS。
- invented lookback / capacity-learning ruleなし。

## Production

- Application commit: `1e8e873a86d7f8ce67a002161674a910306f6294`
- Commit subject: `feat: add capacity observation feedback`
- Railway deployment: `2839738f-1620-49c7-a1b3-53fb45835bae`
- Status: SUCCESS
- Runtime: `Ready in 294ms`
- Production tag: `production-task195d-20260930`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated scheduler settings 307
  - unauthenticated capacity feedback API 401

## 次Task候補

Task195E: 遅延実績 → 納期・安全バッファfeedback。
実装前調査で信頼できるtimestampsと観測可能な遅延指標を確定する。
