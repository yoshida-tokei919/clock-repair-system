# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `e5b90e01ecbaafe675bd33cf72e0f1f9a72c83c1`
- Commit subject: `feat: add repair work time preview`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `d1e0f3bc-4636-4aca-b8d9-5b111dd6c1b8`
- Deployment status: `SUCCESS`
- Production tag: `production-task190d-20260927`
- Region: `sin`
- Schema / migration: none

Production: Task190D complete

## Task190D production確認

- Railway source commit: `e5b90e01ecbaafe675bd33cf72e0f1f9a72c83c1`
- Runtime:
  - `next start` 正常起動
  - `Ready in 298ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `/settings/scheduler` = 307
  - unauthenticated `GET /api/settings/scheduler` = 401
  - unauthenticated `GET /api/repairs/1/work-time-preview` = 401
- local validation:
  - Task190D domain: 14 / 14 PASS
  - Task190D server/read-only: 3 / 3 PASS
  - Task190B domain regression: 11 / 11 PASS
  - Task190B DB resolver regression: 3 / 3 PASS
  - TypeScript / `git diff --check`: PASS
- Independent review completed.
- Current LABOR rows are grouped by Task190B-compatible structured condition into logical work units, preventing duplicate current rows from double-counting estimated minutes.
- Read-only only: no `Repair.estimatedWorkMinutes` write, no Scheduler/WorkCalendar write.

## Schedule / Scheduler の現在地

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了
6. Task188: WorkTimeSession基盤 — production完了
7. Task189: 共通業務タイマーUI — production完了
8. Task190A: Scheduler設定・標準作業時間 schema foundation — production完了
9. Task190B: WorkTimeSession実績集計・統計resolver — production完了
10. Task190C: Scheduler設定UI/API — production完了
11. Task190D: Repair作業時間 read-only preview — production完了

## 直近完了Task

### Task190D: Repair作業時間 read-only preview

- commit: `e5b90e01ecbaafe675bd33cf72e0f1f9a72c83c1`
- 認証付き `GET /api/repairs/[id]/work-time-preview` を追加。
- Task190B実績学習とTask190A/190C設定・標準時間を使って、案件ごとの作業時間推定根拠をread-onlyで返す。
- INTERNALは Movement Cal → Base Movement Cal → Watch Cal → Watch Base Cal。
- EXTERNALは Ref → Model → Brand。
- 同一structured conditionの現行LABOR複数行は1 logical work unitへ集約し、二重計上しない。
- 未構造化LABOR、標準時間曖昧、標準時間なし等は未解決として完全推定を作らない。
- `Repair.estimatedWorkMinutes`、Scheduler、WorkCalendarにはまだ書き込まない。
- Production: complete

## 次に行うこと

- 次候補は Task190E「Repair.estimatedWorkMinutes / Schedulerへの安全接続」。
- Task190Dのcompleteなpreviewをどの条件で採用するか、整数分への丸め、手入力済みestimatedWorkMinutesとの優先関係、preview → apply / 自動更新境界を実装前に調査・確定する。
- Task190E開始前に現行Task184 Scheduler、Repair.estimatedWorkMinutesの現行write/read経路、Task185設計を再確認する。
- schema / migrationはTask190Eで必要性が確認されるまで増やさない。
- 既存 `docs/ai/02_PRODUCT_ROADMAP.md` の未commit差分（+271 / -57）はTask外として保護し、混ぜない。
- 次Taskはユーザー承認なしに実装開始しない。
