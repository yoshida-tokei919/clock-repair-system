# Task195C — Activity reservation feedback

Status: production complete
Date: 2026-09-30

## 目的

WorkTimeSessionの非REPAIR実績と現在のSchedulerActivitySettingを比較し、共通業務の予約枠が実態とどの程度ずれているかをread-onlyで可視化する。

Task195Cでは予約枠を自動更新せず、Scheduler挙動も変更しない。

## 既存実装との関係

Task190ではESTIMATE / INQUIRY / PARTS_ORDERについて、対象単位のWorkTimeSession学習ロジックがすでに存在する。

一方、`dailyReservedMinutes` はTask192で毎日の実効容量から控除される「1日単位の予約枠」であり、1セッション・1対象の学習値とは単位が異なる。

そのためTask195Cでは以下を分離して表示する。

- 日別合計実績: 日次予約枠との比較用
- 1セッション実績: 手動標準時間の参考
- Task190既存学習値: ESTIMATE / INQUIRY / PARTS_ORDERの補助表示

## 対象activityType

- ESTIMATE
- INTAKE
- INQUIRY
- CUSTOMER_CONTACT
- PARTS_ORDER
- SHIPPING
- ADMIN
- OTHER

REPAIRは対象外。Task190 / Task195Aの正本を維持する。

## 実績sample

対象:
- 対象activityType
- endedAtあり
- invalidatedAtなし
- startedAt / endedAtが有効
- endedAt >= startedAt
- now以前

除外:
- REPAIR
- active/open session
- invalidated session
- 不正interval
- future session

## 日次実績

`dailyReservedMinutes` と単位を揃えるため、Asia/Tokyoの日付ごとに実績時間を合算する。

東京時間0時を跨ぐsessionは日付境界で分割して各日に配賦する。

分母は「対象期間内に計測実績がある日」のみ。

未計測日について、休業日なのか記録漏れなのか判定できないため、Task195Cでは0分として追加しない。

## 比較指標

日次予約枠との主比較:

- 日別平均
- 現在の `dailyReservedMinutes`
- 平均 - 予約枠 のdelta

参考統計:

- observed day count
- median
- mean
- P80（nearest-rank）
- min
- max

既存設計で共通業務の総負荷は平均を主指標としているため、独立レビューで予約比deltaを中央値から平均へ修正した。

## 1セッション実績

日次予約とは別に、期間内に終了したsessionの全区間時間について以下を表示する。

- sampleCount
- median
- mean
- P80
- min
- max

これは手動標準時間の参考であり、日次予約枠と直接同一視しない。

## Task190学習の再利用

ESTIMATE / INQUIRY / PARTS_ORDERは既存 `resolveWorkTimeLearning` を再利用し、対象単位の学習情報を補助表示する。

新しい学習アルゴリズムは追加しない。

## API / UI

追加API:

`GET /api/settings/scheduler/activities/feedback`

- session auth必須
- read-only
- SchedulerSetting / SchedulerActivitySetting / WorkTimeSessionをbulk read
- DB writeなし

Scheduler設定画面の各activity setting内へread-only feedbackを表示。

feedback取得失敗は既存Scheduler設定APIと分離し、設定編集・保存を継続可能にする。

## Scheduler safety

変更しないもの:

- SchedulerActivitySetting persistence
- Task192 effective-capacity formula
- Scheduler v2 planner / preview / revision / apply
- REPAIR learning semantics
- DB schema
- migration / seed / RLS / GRANT

## Validation

- Task195C + Task190 + Task192 + settings周辺回帰: 55 / 55 PASS。
- TypeScript: PASS。
- tracked/new-file whitespace check: PASS。
- API auth / read-only boundary: PASS。
- Scheduler core unchanged: PASS。
- feedback failure isolation: PASS。
- 独立レビュー: blocking issueなし。

## Production

- Application commit: `829314f63c2e8d431e18249e54f03956feb83fec`
- Commit subject: `feat: add activity reservation feedback`
- Railway deployment: `a1a3426e-468e-4df9-8130-1858ce6e7daa`
- Status: SUCCESS
- Production tag: `production-task195c-20260930`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated scheduler settings 307
  - unauthenticated activity feedback API 401

## 次Task候補

Task195D: 実作業実績を実効作業容量へ戻すread-only feedback。
詳細境界は実装前調査で確定し、Task192 / Scheduler v2へ自動反映しない。
