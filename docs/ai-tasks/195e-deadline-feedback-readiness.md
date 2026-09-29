# Task195E — Deadline feedback readiness

Status: production complete
Date: 2026-09-30

## 目的

Task195の「遅延実績 → 納期・安全バッファ」について、現行データだけで安全に学習できる範囲を確認する。

誤ったイベント時刻や原因推定を使ってbufferを自動調整しないことを最優先とする。

## 調査結論

### 納品予定日

`Repair.deliveryDateExpected` は現在の納品予定日としてScheduler / deadline preview / Today画面等で利用されている。

ただし編集可能であり、当初の顧客約束日をimmutableに履歴保存していないため、現在値を過去時点の約束日として扱えない。

### 実納品日

`Repair.deliveryDateActual` は既存列として存在し、請求書・保証書等で参照される。

一方、現行コード調査では「納品確定イベントで必ずこの列を更新する」正規write-pathを確認できなかった。

そのため、列に値が入っている件数は確認できるが、Task195Eで遅延実績の正本として統計計算には使用しない。

### RepairStatusLog

`RepairStatusLog.changedAt` はstatus履歴を保持する。

ただしRepair編集UI / APIにはstatusLogの日付手入力・過去日入力経路があり、全経路で「実際にその瞬間に状態遷移したtimestamp」を保証していない。

そのため `作業完了` / `納品済み` status logを厳密なactual event timestampへ昇格しない。

### 作業完了

- WorkTimeSession.endAt: タイマー終了でありRepair作業完了ではない。
- RepairScheduleSegment.workDate: 予定日でありactual completionではない。
- 現行schemaにcanonical workCompletedAtはない。

### 発送・配達

Task199 Shipment基盤未実装のためcanonical actualShippedAtはまだ存在しない。

配達完了eventもTask202/204等の後続配送連携で整備予定。

## Task195Eで算出しないもの

現行データだけでは以下を安全に算出しない。

- 遅延日数
- 納期遵守率
- running test由来の遅延日数
- rework由来の遅延日数
- shipping由来の遅延日数
- 適切なbuffer推奨値
- bufferの自動apply

`updatedAt`、WorkTimeSession、schedule segment、status current valueからイベント日を推測しない。

## 実装

Scheduler設定画面へread-onlyの「納期フィードバックのデータ状況」を追加。

表示:

- 現在の `runningTestDays`
- 現在の `reworkBufferDays`
- 現在の `shippingBufferDays`
- Repair総件数
- `deliveryDateExpected` あり件数
- `deliveryDateActual` あり件数
- 両方あり件数
- なぜ現状では遅延統計・原因別buffer学習ができないか

これはreadiness確認であり、遅延分析結果ではない。

## API

`GET /api/settings/scheduler/deadline-feedback-readiness`

- session auth必須
- force-dynamic
- read-only
- SchedulerSetting / Repair countのみ
- DB writeなし

Scheduler設定画面のmain settings / Task195C / Task195D feedbackとは取得failureを分離する。

## Scheduler safety

変更しない:

- runningTestDays / reworkBufferDays / shippingBufferDays
- Task192 deadline-capacity formula
- Scheduler v2 planner / preview / revision / apply
- Repair schedule
- Repair status
- WorkTimeSession
- schema / migration / seed / RLS / GRANT

## 独立レビュー

カタリ独立レビューで以下を確認。

- `deliveryDateActual` に信頼できる正規write-pathが現行コードから確認できない。
- `RepairStatusLog.changedAt` は手入力・過去日入力が可能。
- 実イベントでない値を遅延timestampへ推測変換していない。
- lateness / recommendation計算が追加されていない。
- APIはauth/read-only。
- Task192 / Scheduler / schema core無変更。

Blocking issueなし。

## Validation

- Task195E focused: 2 / 2 PASS。
- Task195C/D + Task192/Scheduler regressions: 71 / 71 PASS。
- TypeScript: PASS。
- tracked/new-file diff check: PASS。
- API auth/read-only: PASS。
- lateness/recommendation logicなし。

## Production

- Application commit: `bdcd86c4451000e41e2c717ffe0bb75112783e6a`
- Commit subject: `feat: add deadline feedback readiness`
- Railway deployment: `0e7eedda-4e88-4270-b0bb-60d9ba9517a3`
- Status: SUCCESS
- Production tag: `production-task195e-20260930`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated scheduler settings 307
  - unauthenticated deadline readiness API 401

## Task195完了判定

Task195A–Eで、本格運用前に安全に実装可能な実績feedback基盤はproduction反映済み。

実イベントtimestampが必要な遅延原因別buffer学習は、Shipment / 配送event等の後続基盤が整った後に精度向上Taskとして再開する。

次はTask196 PhysicalTag / NFC・QR基盤。
