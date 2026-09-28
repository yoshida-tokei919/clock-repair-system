# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `10b52fffe219605dd971b3d4bfdc03d16d027072`
- Commit subject: `feat: cut over scheduler v2 apply workflow`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `4fae2a69-3b64-4569-ae47-4ebb0ca2c1da`
- Deployment status: `SUCCESS`
- Production tag: `production-task193c3-20260928`
- Region: `sin`
- Supabase migration: none

Production: Task193C3 complete

## Task193C3 production確認

- Scheduler v2 previewから明示確認後にapply可能。
- clientはpreview revisionのみPOSTする。
- apply成功後はpreviewを再取得。
- 409 stale/conflict時はpreviewを再取得するが自動再applyしない。
- 旧Task184 auto-schedule POSTは書込み停止し、Scheduler v2利用を案内する409へcutover。
- 旧Task184 previewはread-only互換として維持。
- segmentが存在するRepairでは個別予定日の直接変更をbackendで拒否。
- 同じ暦日のscheduledDate payloadは他のschedule項目更新を阻害しない。
- 日付変更writeには `scheduleSegments: { none: {} }` を条件に含め、segment同時作成競合もfail-closed。
- Repair詳細UIでもsegment存在時は予定日入力を無効化。
- schema / migration / seed / RLS / GRANT変更なし。
- Codex実装 → カタリ独立レビュー: blocking issue 2点（日付時刻比較・同時segment作成競合）を修正後PASS。
- Node関連回帰: 123 / 123 PASS。
- Playwright: 4 / 4 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- staged `git diff --check`: PASS。
- Railway build / deploy: SUCCESS。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `GET /api/repairs/scheduler-v2-preview` = 401
  - 未認証 `POST /api/repairs/scheduler-v2-apply` = 401
  - 未認証 `POST /api/repairs/auto-schedule` = 401
- 詳細: `docs/ai-tasks/193c3-scheduler-v2-apply-ui-writer-cutover.md`

## Schedule / Scheduler の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了

## 現在のTask: Task194

Status: investigation / implementation authorized

### 目的

`/repairs/today` 等の独立画面で、今日実行すべき作業をScheduler v2・作業状態・部品準備・WorkTimeSessionと接続して一覧化する。

### 要件

- 今日の予定を表示する。
- 優先順位と根拠を表示する。
- 使用予定時間 / 当日残容量を表示する。
- 中断案件 / 再開可能案件 / 部品待ちを判別できる。
- 遅延見込みを把握できる。
- 共通業務タイマーの開始導線へ接続する。
- 既存Kanbanとは役割を分ける。
- Scheduler v2のsegment正本を使用し、legacy `scheduledDate` はsegmentがないRepairのfallbackとしてのみ扱う。
- Task193までの計算ロジックを重複実装せず再利用する。
- schema / migration変更は、実装前調査で本当に必要と判断された場合のみ別高リスク境界として分離する。

### まず確認すること

- 現在のRepair一覧 / Kanban / calendar画面構成。
- RepairScheduleSegmentの今日分取得経路。
- Task192/193のpriority・capacity・parts readiness・blocked情報の再利用可能性。
- WorkTimeSession / 共通タイマーUIの開始API・component。
- 今日画面に必要なread modelを新設すべきか、既存loaderを組み合わせるべきか。
- 今日のsegmentがないlegacy Repairをどう表示するか。
- 当日容量の定義と予約済み時間の扱い。

### 保護中のTask外差分

以下はPhysicalTag / NFC・QR要件であり、Task194へ混ぜない。

- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai-tasks/196-physical-tag-nfc-design.md`
