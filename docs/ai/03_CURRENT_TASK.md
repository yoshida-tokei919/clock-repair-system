# CURRENT TASK

## 現在のcheckpoint — 2026-09-28

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `40002b773c4ec604cdbf23e7cfac95b22d39b700`
- Commit subject: `feat: add scheduler v2 atomic apply backend`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `057e36bb-f940-444c-900d-fee037131f10`
- Deployment status: `SUCCESS`
- Production tag: `production-task193c2-20260928`
- Region: `sin`
- Supabase migration: none

Production: Task193C2 complete

## Task193C2 production確認

- Scheduler v2 atomic apply backendを追加。
- clientからはpreview `revision`のみを受け取り、server側で同一Serializable transaction内にてpreviewを再計算する。
- revision一致時だけapplyし、stale revision / Prisma P2034 / apply経路のP2002 conflictは409。
- MANUAL segment / `scheduleLocked=true` は保護。
- `NO_CHANGE` / `PRESERVE_UNPLACED` / `PROTECTED` はwriteなし。
- `SUMMARY_ONLY_SYNC` は `Repair.scheduledDate` のみ同期。
- `CREATE_AUTO` / `CREATE_FROM_LEGACY` はAUTO segmentを作成。
- `REPLACE_AUTO` は対象RepairのAUTO segmentだけを置換し、MANUALは削除しない。
- schema / migration / seed / RLS / GRANT変更なし。
- apply UI / legacy writer cutoverは未実装。
- Codex実装 → カタリ独立レビュー: P2002 conflict handlingを追加修正後、blocking issueなし / PASS。
- 関連回帰test: 116 / 116 PASS。
- 独立レビュー修正後重点test: 42 / 42 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- staged `git diff --check`: PASS。
- Railway build / deploy: SUCCESS。
- Non-destructive smoke:
  - 未認証 `POST /api/repairs/scheduler-v2-apply` = 401
- 詳細: `docs/ai-tasks/193c2-scheduler-v2-atomic-apply-backend.md`

## Schedule / Scheduler の現在地

1. Task182–184: Schedule MVP / WorkCalendar / simple scheduler — production完了
2. Task185–187: 作業時間・納期/容量設計 / 実装前調査 — docs-only完了
3. Task188–190E: WorkTimeSession / 共通タイマー / Scheduler設定・作業時間 — production完了
4. Task191A–191E: 発注リードタイム / 部品待ち / 中断・再開 — production完了
5. Task192A–192B: 工程日数設定 / 納期逆算・実効容量preview — production完了
6. Task193A: RepairScheduleSegment schema foundation — production完了
7. Task193B: segment-based Scheduler v2 read-only preview — production完了
8. Task193C1: Scheduler v2 apply-safe planner correction — production完了
9. Task193C2: Scheduler v2 atomic apply backend — production完了

## 現在のTask: Task193C3

Status: implementation authorized

### 目的

Scheduler v2 previewを人間の確認後にapplyできるUIへ接続し、segment正本化後に旧writerが予定を破壊しないようcutoverする。

### 実装境界

- Scheduler v2 preview UIに明示的なapply確認操作を追加する。
- applyはTask193C2の `POST /api/repairs/scheduler-v2-apply` を利用し、clientからはrevisionのみ送る。
- apply成功後はpreviewを再取得して最新状態を表示する。
- 409 stale/conflict時はpreviewを再取得し、内容を更新するが自動再applyしない。
- apply前に「予定が更新される」ことを人間が確認できる導線を残す。
- Task184 legacy auto-schedule writerと直接 `Repair.scheduledDate` を更新する経路を調査し、segmentが正本になったRepairを破壊しないguard / cutoverを行う。
- MANUAL segment / `scheduleLocked=true` 保護を壊さない。
- `Repair.scheduledDate` はsegmentが存在する場合のcompatibility summaryとして扱う。
- schema / migration / seed / RLS / GRANT変更なしを基本とする。
- PhysicalTag / NFC / QR / ScanSession要件はTask196–197へ分離し、このTaskには含めない。

### 調査対象

- `src/components/repairs/SchedulerV2Preview.tsx`
- `src/app/api/repairs/scheduler-v2-preview/route.ts`
- `src/app/api/repairs/scheduler-v2-apply/route.ts`
- `src/app/api/repairs/auto-schedule/route.ts`
- `src/app/api/repairs/[id]/schedule/route.ts`
- `RepairSchedulePanel`および予定編集UI
- Scheduler v2 / Task184 / schedule input関連test

### 高リスク扱い

このTaskはproductionの予定更新経路を切り替えるため高リスク。
Codex実装 → カタリ独立レビューを行い、productionへpush / deployする前にユーザーの明示承認で停止する。

### 保護中のTask外差分

以下はPhysicalTag / NFC・QR要件であり、Task193C3へ混ぜない。

- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai-tasks/196-physical-tag-nfc-design.md`
