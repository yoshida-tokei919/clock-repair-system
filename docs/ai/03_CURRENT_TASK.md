# CURRENT TASK

## 現在のcheckpoint — 2026-09-29

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `df8db7b0408d97c7c458a10e9e6c52efebd54d9f`
- Commit subject: `feat: surface scheduler work-time feedback`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0a9a0517-2406-4a23-98e6-42beb3dd0ee1`
- Deployment status: `SUCCESS`
- Production tag: `production-task195a-20260929`
- Region: `sin`
- Supabase migration: none

Production: Task195A complete

## Task195A production確認

- Task190で既に実装済みのRepair作業時間実績学習をScheduler v2 previewへ接続。
- Scheduler v2各Repairに、保存中推定時間 / 推奨時間 / 差分 / 採用理由 / tier / 有効サンプル数を表示。
- 推奨値は情報表示のみで、Scheduler v2から `estimatedWorkMinutes` を自動更新しない。
- 推奨採用は既存Repair詳細のTask190 preview/apply導線を利用。
- planner / Scheduler v2 applyは従来どおりpersist済み `estimatedWorkMinutes` / `remainingWorkMinutes` のみ使用。
- feedback情報はScheduler revisionへ含めない。
- GET previewだけ `loadSchedulerV2PreviewWithFeedback` を使用。
- Serializable apply transactionはcore `loadSchedulerV2Preview` を使用し、WorkTimeSession履歴 / RepairWorkTimeStandardを読まない。
- Task190元loaderと同じ4入力・同じ全REPAIR実績母集団・同じresolverを再利用。
- カタリ独立レビューで、feedback readがapply transactionへ入る初版設計をblockingとして分離修正。
- 最終主要回帰: 106 / 106 PASS。
- Scheduler focused: 39 / 39 PASS。
- Task190/192回帰: 67 / 67 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- schema / migration / seed / RLS / GRANT変更なし。
- Railway deploy: SUCCESS。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `GET /api/repairs/scheduler-v2-preview` = 401
- 詳細: `docs/ai-tasks/195a-scheduler-work-time-feedback.md`

## Scheduler / Feedback の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了
7. Task194: 今日の作業dashboard — production完了
8. Task195A: Repair作業時間実績feedbackをScheduler v2へ表示 — production完了

## 現在のTask: Task195B

Status: investigation / implementation authorized

### 目的

既存の `OrderRequest.orderedAt` / `receivedAt` 実績から、調達リードタイムの実績feedbackをread-onlyで可視化する。

### 境界

- Supplier処理日数とProcurementShippingMethod輸送日数は概念上分離したまま維持する。
- `orderedAt -> receivedAt` だけではSupplier処理と輸送を分解できないため、Task195Bで個別値を自動学習・自動更新しない。
- まず既存データから観測可能な「総リードタイム」を集計し、現在設定との比較を表示する。
- read-only / recommendation-only。
- Supplier / ShippingMethod設定値を自動applyしない。
- schema / migration / seed / RLS / GRANT変更なしを基本とする。
- 新business ruleを推測で追加しない。
- Task190既存の統計設定を流用できる場合のみ流用し、意味が合わない場合は独自流用しない。
- 自動反映や個別Supplier/ShippingMethod学習は後続Taskへ分離する。

### まず確認すること

- `OrderRequest` のSupplier / ShippingMethod参照と `orderedAt` / `receivedAt`。
- Task191のexpectedArrivalDate算出helperとfallback優先順位。
- Supplier処理日数 / ProcurementShippingMethod輸送日数の現行field。
- 既存のprocurement settings・集計UI。
- 日数の定義（暦日 / 稼働日 / timestamp差分）。
- 未受領 / キャンセル / 不正intervalの扱い。
- Supplier単独、ShippingMethod単独、組合せ単位のどこまで観測値として安全に出せるか。

### 高リスク境界

Task195Bはread-onlyを基本とし、production data mutationは追加しない。
schema変更が必要と判明した場合は実装せず別Taskへ分離する。
