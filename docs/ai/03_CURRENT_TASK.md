# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `8b65acdd8db584133857d9c6dad519b89f423116`
- Commit subject: `feat: add deadline capacity preview`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `4a394a7c-15ed-4916-a472-4c8ba4d22f38`
- Deployment status: `SUCCESS`
- Production tag: `production-task192b-20260928`
- Region: `sin`
- schema / migration / RLS / GRANT変更なし。migrationがないためproduction backup不要。
- Railway runtime: `next start` / `Ready in 295ms`

Production: Task192B complete

## Task192B production確認

- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - 未認証 `GET /api/repairs/deadline-capacity-preview` = 401（想定どおり）
- 認証済みブラウザでの実画面と、認証済みproduction APIの動作確認は未実施。

## Task192B 実装内容

- Task192Aの工程日数設定、WorkCalendar、作業時間、Task191の部品準備・中断状態、既存予定負荷を組み合わせ、納期窓と日別実効容量をread-onlyで計算。
- 認証必須の `GET /api/repairs/deadline-capacity-preview` と `/repairs/calendar` の分析欄を追加。
- `snapshotRevision` は情報表示のみ。予定のapply、`scheduledDate`の更新、Task193の複数日分割は含まない。
- 詳細: `docs/ai-tasks/192b-deadline-capacity-readonly-preview.md`

## Validation / Review

- 新規 + 既存回帰テスト: 47 / 47 PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Codex実装 → 独立レビュー: 3点を修正し、再確認PASS（対象期間外の現予定、全日0分の納期窓、現予定日のUI表示）。

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
12. Task190E: Repair.estimatedWorkMinutesへの安全なpreview → apply接続 — production完了
13. Task191A: 発注リードタイム・作業中断 schema foundation — production完了
14. Task191B: Supplier / ProcurementShippingMethod 設定操作 — production完了
15. Task191C: OrderRequest入荷予定resolver / 配送方法接続 — production完了
16. Task191D: 部品準備日・作業中断/再開 — production完了
17. Task191E: 部品準備・中断状態をTask184 scheduler除外条件へ接続 — production完了
18. Task192A: Scheduler 工程日数設定 foundation — production完了
19. Task192B: 納期逆算・実効容量 read-only preview — production完了

## 現在のTask: Task192B

Production: complete

- 詳細: `docs/ai-tasks/192b-deadline-capacity-readonly-preview.md`
- 次Task候補はTask193: 分割スケジュール基盤 + Scheduler v2。
- Task193では複数日分割、`RepairScheduleSegment`、preview → 人間確認 → applyを扱う。
- 次Taskはユーザー承認なしに実装開始しない。
