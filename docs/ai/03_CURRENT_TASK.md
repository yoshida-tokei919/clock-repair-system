# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `f1a45d58987f626277dae6332db25d952af760b9`
- Commit subject: `feat: apply repair work time preview`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `520eae2d-9d88-404a-a3f1-28429121b746`
- Deployment status: `SUCCESS`
- Production tag: `production-task190e-20260927`
- Region: `sin`
- Schema / migration: none

Production: Task190E complete

## Task190E production確認

- Railway source commit: `f1a45d58987f626277dae6332db25d952af760b9`
- Runtime:
  - `next start` 正常起動
  - `Ready in 285ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `GET /api/repairs/1/work-time-preview` = 401
  - unauthenticated `POST /api/repairs/1/work-time-preview/apply` = 401
- local validation:
  - Task190E / Task190D / Task190B / Repair schedule / Task184 regression: 50 / 50 PASS
  - TypeScript `npx tsc --noEmit --incremental false`: PASS
  - `git diff --check`: PASS
- Independent review completed.
- completeなpreviewだけを明示操作で `Repair.estimatedWorkMinutes` へ反映する。
- preview値は `Math.round` で整数分へ丸める。
- clientはrevisionだけを送信し、保存値はserver側で再計算する。
- revision不一致、手動変更競合、不完全preview、無効な保存値では書き込まない。
- applyはSerializable transactionと現在保存値条件付きupdateで競合を検出する。
- Task184 Scheduler本体、`scheduledDate`、WorkCalendar、priorityScore等は変更していない。
- schema / migration変更なし。

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

## 直近完了Task

### Task190E: Repair作業時間 preview → apply

- commit: `f1a45d58987f626277dae6332db25d952af760b9`
- `GET /api/repairs/[id]/work-time-preview` に現在保存値、四捨五入後保存予定値、revisionを追加。
- `POST /api/repairs/[id]/work-time-preview/apply` を追加。
- clientからminutesを受け取らず、server側でpreviewを再計算して安全に反映する。
- completeなpreviewのみ反映可能。
- stale revisionや手動編集との競合は409として再previewを要求する。
- 案件の作業スケジュールパネルで現在値、preview、保存予定値、状態を確認し、「推定時間を採用」できる。
- 既存の手動 `estimatedWorkMinutes` 編集は維持。
- Task184は保存済み `estimatedWorkMinutes` を従来どおり利用する。
- Production: complete

## 次に行うこと

- 次候補は Task191「発注リードタイム・部品待ち・作業中断」。
- 実装開始前に既存 Supplier、OrderRequest、RepairPartAllocation、発注/入荷日時、Repair status / schedule経路を調査し、Task191の物理境界を確定する。
- SupplierとShippingMethodのリードタイムを混同せず、固定値をハードコードしない。
- 部品待ち案件を予定へ入れないためのblocked / partsReadyDate / resumeEligibleDate等は、現行schemaとの整合を確認してから設計する。
- schema / migrationが必要になる可能性が高いため、高リスク変更として実装担当と独立レビュー担当を分離する。
- production migration / deployはユーザー明示承認なしに実行しない。
- 既存 `docs/ai/02_PRODUCT_ROADMAP.md` の未commit差分（+271 / -57）はTask外として保護し、混ぜない。
- 次Taskはユーザー承認なしに実装開始しない。
