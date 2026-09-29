# CURRENT TASK

## 現在のcheckpoint — 2026-09-30

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `1e8e873a86d7f8ce67a002161674a910306f6294`
- Commit subject: `feat: add capacity observation feedback`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `2839738f-1620-49c7-a1b3-53fb45835bae`
- Deployment status: `SUCCESS`
- Production tag: `production-task195d-20260930`
- Region: `sin`
- Supabase migration: none

Production: Task195D complete

## Task195D production確認

- WorkTimeSessionの計測実績と現在の作業容量をread-only比較。
- 容量の自動学習値・推奨値は作成しない。
- arbitraryな30日lookbackは採用せず、保存済みの有効な完了セッション全履歴から、今日より前のAsia/Tokyo観測日だけを記述的に集計。
- 未計測日を0分として追加しない。
- 0秒セッションだけの日は観測日にしない。
- REPAIR計測時間 / 非REPAIR計測時間 / 計測合計を分離。
- 東京時間0時を跨ぐsessionは日付境界で分割。
- 今日に跨ぐsessionは今日より前の部分だけを計上。
- 表示:
  - WorkCalendar総容量
  - 現在の予定確認予約枠
  - 現在の共通業務予約枠
  - Task192と同じ修理向け実効容量
  - 予約超過
  - 計測REPAIR
  - 計測非REPAIR
  - 計測合計
- WorkCalendarは各観測日について現在DBに保存されている値を使用し、後日編集された場合は当時値とは限らないことをUIで明示。
- 予定確認枠 / 共通業務予約枠は過去設定履歴がないため現在値との参考比較であることをUIで明示。
- タイマー網羅率は不明なため、未計測時間を「空き時間」「余剰容量」と扱わない。
- SchedulerSetting / WorkCalendar / SchedulerActivitySettingへのwriteなし。
- Task192実効容量計算 / Scheduler v2 planner・preview・applyの変更なし。
- schema / migration / seed / RLS / GRANT変更なし。
- カタリ独立レビュー:
  - 根拠のない固定30日窓を削除。
  - 0秒sessionだけの日を観測日から除外。
  - WorkCalendarがimmutable historical snapshotではない旨を明記。
- 関連回帰: 55 / 55 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- API auth / read-only boundary: PASS。
- Task192 / Scheduler / schema core unchanged: PASS。
- Railway build / deploy: SUCCESS。
- Runtime: `Ready in 294ms`。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/settings/scheduler` = 307
  - 未認証 `GET /api/settings/scheduler/capacity-feedback` = 401
- 詳細: `docs/ai-tasks/195d-capacity-observation-feedback.md`

## Scheduler / Feedback の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了
7. Task194: 今日の作業dashboard — production完了
8. Task195A: Repair作業時間実績feedbackをScheduler v2へ表示 — production完了
9. Task195B: 調達総リードタイム実績feedback — production完了
10. Task195C: 非REPAIR共通業務の実績と日次予約枠feedback — production完了
11. Task195D: 実績作業量と現在容量の記述的feedback — production完了

## 次のTask候補: Task195E

Status: awaiting user approval

### 目的候補

遅延実績を納期・安全バッファ改善へつなぐためのread-only feedback基盤を調査・実装する。

### 境界

- 現行のrunningTestDays / reworkBufferDays / shippingBufferDaysを自動更新しない。
- 遅延の原因を推測で分類しない。
- 実際の作業完了・発送・納品等のどのtimestampが現行schemaで信頼できるかを実装前調査で確認する。
- 現行データだけで安全に観測できる指標へ限定する。
- schema変更が必要なら別高リスクTaskへ分離する。
- Task196以降は開始しない。

Task195Eはユーザー承認後に実装前調査から開始する。
