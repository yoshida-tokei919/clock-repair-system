# Task193C1 — Scheduler v2 apply-safe planner correction

Status: production complete
Date: 2026-09-28

## 目的

Task193Bのread-only Scheduler v2 previewを、将来のapply時に既存予定を失わない形へ補強する。
このTaskではplannerの純粋計算だけを修正し、DB write / apply API / apply UIは追加しない。

## 実装境界

- `RepairScheduleSegment` / `Repair.scheduledDate` への書込みは行わない。
- schema / migration / seed / RLS / GRANT変更なし。
- MANUAL segmentと`scheduleLocked=true`は引き続きAUTO変更対象外。
- 既存AUTO予定を置換できないcandidateは、旧予定負荷を最終計画へ復元する。
- 復元された負荷を含めて下位candidateを再計算し、apply後に日別容量超過や予定消失が起きないpreviewを作る。
- legacy `scheduledDate` fallbackも、置換失敗時は既存負荷として保持する。
- fixed-point再計算はpreserve集合が安定するまで行う。
- `Repair.scheduledDate`は将来の互換summaryとして扱い、segmentが正本になる前提を維持する。

## 追加・変更

- `src/lib/scheduler-v2-planner-domain.ts`
- `src/lib/scheduler-v2-planner-domain.test.ts`
- planner version: `193C1-1`
- apply後の扱いを示す`futureApplyAction`を追加。
- 主な分類:
  - `NO_CHANGE`
  - `CREATE_AUTO`
  - `CREATE_FROM_LEGACY`
  - `REPLACE_AUTO`
  - `SUMMARY_ONLY_SYNC`
  - `PRESERVE_UNPLACED`
  - `PROTECTED`
- 日別結果に`preservedForApplyLoadMinutes` / `resultingPlanLoadMinutes`を追加。

## 対象外

- Scheduler v2 apply API
- RepairScheduleSegment INSERT / UPDATE / DELETE
- Repair.scheduledDate更新
- legacy Task184 writer / direct schedule editorのcutover
- apply confirmation UI
- schema / migration / production DB mutation

## Validation / Review

- Codex実装。
- カタリ独立レビュー: blocking issueなし / PASS。
- 関連回帰test: 101 / 101 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- 変更ファイルはplanner本体とtestの2ファイルのみ。

## Production

- Application commit: `9e2fe9d3260e2adb94039d0408afbbfa544a4e0a`
- Commit subject: `fix: make scheduler v2 planning apply-safe`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `dc08e8ef-c826-4046-a904-67dd96e152ea`
- Status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task193c1-20260928`
- Migration: none
- Smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `GET /api/repairs/scheduler-v2-preview` = 401

## 次Task

Task193C2: Scheduler v2 atomic apply backend。

- clientはpreview revisionのみ送る。
- server側で同一入力を再計算し、revision一致時だけapplyする。
- whole-preview atomic / Serializableを基本とする。
- MANUAL / lockedは保護する。
- changed AUTOのみsegmentを更新し、`Repair.scheduledDate = min(segment.workDate)`へ同期する。
- stale / serialization conflictは409。
- production DB mutationを伴うため、実装担当と独立レビュー担当を分離し、production反映前にユーザー承認で停止する。
