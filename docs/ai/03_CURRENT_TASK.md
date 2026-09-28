# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `c62e756d784179980e50dfdc127cfd2a6158b524`
- Commit subject: `feat: add today work dashboard`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `427d78f8-e624-4c59-90cb-f357a079f327`
- Deployment status: `SUCCESS`
- Production tag: `production-task194-20260928`
- Region: `sin`
- Supabase migration: none

Production: Task194 complete

## Task194 production確認

- `/repairs/today` に「今日の作業」画面を追加。
- RepairScheduleSegmentが存在するRepairはsegmentを予定正本として使用し、今日のsegmentのみ当日負荷へ計上。
- segmentが0件のRepairだけlegacy `scheduledDate` をfallbackとして使用。
- legacy fallbackの作業時間はTask192が導出済みの `workMinutes` を再利用し、`remainingWorkMinutes=0` を推定時間へ戻さない。
- Task192のWorkCalendar / Scheduler予約容量 / parts readiness / planning分析を再利用。
- 総容量 / 実効容量 / 予定負荷 / 残容量 / over-reserved / overbookedを表示。
- 実行可能 / 再開可能日到来 / 中断中 / 部品待ち / 状態確認を重複しないsectionで表示。
- Task184/193と同じ優先順: priorityScore DESC → deliveryDateExpected ASC null-last → receptionDate ASC null-last → id ASC。
- 納期超過 / 工程期限超過等の注意表示を既存日付から導出。
- 実行可能Repairは既存WorkTimeSession共通タイマーをその場で開始可能。
- Repair詳細のタイマーsectionへの導線も維持。
- schema / migration / seed / RLS / GRANT変更なし。
- Codex実装 → カタリ独立レビュー。
- 独立レビュー指摘: legacy fallbackで `remainingWorkMinutes=0` がestimatedへ戻る差異を修正。
- Codex関連回帰: 111 tests PASS。
- 独立レビュー修正後重点回帰: 33 / 33 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Railway build / deploy: SUCCESS。
- Runtime: Next.js Ready in 793ms。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/today` = 307（login redirect）
- 詳細: `docs/ai-tasks/194-today-work-dashboard.md`

## Scheduler / Operations の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了
7. Task194: 今日の作業dashboard — production完了

## 次のTask: Task195

Status: awaiting user approval

### 目的

実績フィードバック基盤。
既存の実績データを、将来案件の作業時間・調達リードタイム・実効容量・納期安全バッファ等の算出へ戻せる基盤を作る。

### 想定対象

- WorkTimeSession実作業時間 → 推定作業時間
- OrderRequest orderedAt / receivedAt → Supplier / ShippingMethodリードタイム
- 実績作業量 → 実効作業容量
- 遅延実績 → 納期・安全バッファ
- 見積り等の共通業務実績 → Scheduler予約容量
- Task190の集計期間 / 件数閾値 / 平均・中央値・P80設定との接続

### 開始時に確認すること

- Task190で既に実装済みの実績学習範囲とTask195との差分。
- WorkTimeSession集計helper / API / settingsの現状。
- Supplier / ProcurementShippingMethodのリードタイム実績集計の現状。
- 新規schemaが本当に必要か、既存データからread-time集計で成立するか。
- 自動反映とpreview / 人間確認の境界。

Task195はユーザー承認後に開始する。
