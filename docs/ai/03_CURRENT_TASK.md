# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `c17ed635cc85c73cd4b3bf45935685a74e3487a7`
- Commit subject: `feat: add shared work timer UI`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `6c0785a5-6f0d-4dc5-a472-daa591b4295e`
- Deployment status: `SUCCESS`
- Production tag: `production-task189-20260927`
- Region: `sin`
- Supabase migration: none for Task189

Production: Task189 complete

## Task189 production確認

- Railway source commit: `c17ed635cc85c73cd4b3bf45935685a74e3487a7`
- Runtime:
  - `next start` 正常起動
  - `Ready in 346ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `GET /api/work-time-sessions/active` = 401
  - `/orders` = 200
- local related tests: 12 / 12 PASS
- TypeScript / local Next build / `git diff --check`: PASS
- schema / migration / RLS / GRANT変更なし
- カタリ独立レビュー済み。LABOR同一作業の再開始による不要session分割を `workLabelSnapshot` 判定で修正。
- 認証済みブラウザのタイマー実操作は未確認。

## Schedule / Scheduler の現在地

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了
6. Task188: WorkTimeSession基盤 — production完了
7. Task189: 共通業務タイマーUI — production完了

## 直近完了Task

### Task189: 共通業務タイマーUI

- commit: `c17ed635cc85c73cd4b3bf45935685a74e3487a7`
- 詳細: `docs/ai-tasks/189-common-work-timer-ui.md`
- Repair / Inquiry / OrderRequest / 共通業務をTask188 WorkTimeSession基盤へ接続。
- app常駐タイマーバー、開始・停止、HH:MM:SS表示、共通業務クイック開始を実装。
- Repairは見積とLABOR明細単位で開始可能。PART行は対象外。
- Production: complete

## 次に行うこと

- 次候補は Task190「Scheduler設定・標準作業時間・実績学習」。
- Task190は `docs/ai-tasks/185-work-time-estimation-design.md`、`docs/ai-tasks/186-scheduler-deadline-capacity-timer-design.md`、Task187調査結果を前提に、実装前にTask境界・schemaを再確認する。
- Task190はユーザー承認なしに開始しない。
- 既存 `docs/ai/02_PRODUCT_ROADMAP.md` の未commit差分はTask189外として保護し、混ぜない。
- マスタデータ投入・復旧は別Taskとして並行可。Schedule差分と混ぜない。
