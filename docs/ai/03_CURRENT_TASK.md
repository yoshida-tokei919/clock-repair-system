# CURRENT TASK

## 現在のcheckpoint — 2026-09-30

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `bdcd86c4451000e41e2c717ffe0bb75112783e6a`
- Commit subject: `feat: add deadline feedback readiness`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0e7eedda-4e88-4270-b0bb-60d9ba9517a3`
- Deployment status: `SUCCESS`
- Production tag: `production-task195e-20260930`
- Region: `sin`
- Supabase migration: none

Production: Task195E complete

## Task195E production確認

- Task195の「遅延実績 → 納期・安全バッファ」について、現行schema / write-path / status履歴を実装前調査。
- `deliveryDateExpected` は現在の納品予定日としてSchedulerで使用中。
- `deliveryDateActual` は既存列として存在し、請求・保証等で参照されるが、現行コードで信頼できる正規write-pathを確認できない。
- `RepairStatusLog.changedAt` はstatus履歴を保持するが、手入力・過去日入力経路があり、厳密な実イベントtimestampとして扱わない。
- WorkTimeSession終了時刻を作業完了時刻へ推測変換しない。
- RepairScheduleSegmentの日付を実作業完了日へ推測変換しない。
- Task199未実装のため実発送timestampの正本はまだない。
- 配達完了timestamp / carrier event連携も後続Taskで整備予定。
- そのためTask195Eでは遅延日数・納期遵守率・工程別原因・推奨buffer日数を算出しない。
- Scheduler設定画面へread-only「納期フィードバックのデータ状況」を追加。
- 表示:
  - 現在のrunningTestDays
  - 現在のreworkBufferDays
  - 現在のshippingBufferDays
  - Repair総件数
  - deliveryDateExpectedあり件数
  - deliveryDateActualあり件数
  - 両方あり件数
  - 現状では工程別遅延原因 / 適切なbuffer日数を算出できない理由
- 過去buffer設定履歴はないため、現在値を当時値として扱わない。
- readiness APIは認証必須・read-only。
- readiness取得失敗時も既存Scheduler設定・Task195C/D feedbackは継続利用可能。
- DB writeなし。
- Task192実効容量 / Scheduler v2 planner・preview・apply変更なし。
- schema / migration / seed / RLS / GRANT変更なし。
- カタリ独立レビュー: blocking issueなし。
- Task195E focused: 2 / 2 PASS。
- Task195C/D + Task192/Scheduler回帰: 71 / 71 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- API auth / read-only boundary: PASS。
- lateness / recommendation logic: 追加なし。
- Railway deploy: SUCCESS。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/settings/scheduler` = 307
  - 未認証 `GET /api/settings/scheduler/deadline-feedback-readiness` = 401
- 詳細: `docs/ai-tasks/195e-deadline-feedback-readiness.md`

## Scheduler / Feedback の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A–193C3: RepairScheduleSegment / Scheduler v2 preview・apply・writer cutover — production完了
7. Task194: 今日の作業dashboard — production完了
8. Task195A: Repair作業時間実績feedback — production完了
9. Task195B: 調達総リードタイム実績feedback — production完了
10. Task195C: 非REPAIR共通業務の実績と日次予約枠feedback — production完了
11. Task195D: 実績作業量と現在容量の記述的feedback — production完了
12. Task195E: 納期・安全buffer feedbackのdata readiness — production完了

Task195: production完了

## 次のTask: Task196 — PhysicalTag / NFC・QR基盤

Status: awaiting user approval

### 目的

時計現物へ再利用可能なPhysicalTagを割り当て、NFC UID / QR token / shortCodeからRepairを安全に解決できる基盤を作る。

### 実装前に必ず確認

- `docs/ai-tasks/196-physical-tag-nfc-design.md`
- 現行Repair / intake / WorkTimeSession / customer-facing token構造
- 実機PoC前提と現行schemaの再照合
- NFC UID / QR token / shortCodeのprivacy・reuse・active assignment要件
- Task197 ScanSessionへ渡す共通resolve contract
- 新規public tableをData APIから利用するか、role別GRANTが必要か

### 境界

- Task196はschema / migrationを伴う高リスクTaskになる可能性が高い。
- schema / migration / RLS / GRANT変更はCodex実装とカタリ独立レビューを分離する。
- production migration / deployはユーザー明示承認なしに実行しない。
- Task197 ScanSession、Task198 StorageLocation、Shipmentは開始しない。
- 1 Task = 1 commitを維持する。

Task196はユーザー承認後に実装前調査から開始する。
