# Task193C2 — Scheduler v2 atomic apply backend

Status: production complete
Date: 2026-09-28

## 目的

Task193B/C1のScheduler v2 previewを、revision一致時のみ原子的にDBへ反映できるbackendへ接続する。
このTaskではapply backendのみを実装し、apply UIとlegacy writer cutoverはTask193C3へ分離する。

## 実装

- `POST /api/repairs/scheduler-v2-apply`
- `src/lib/scheduler-v2-apply.ts`
- `src/lib/scheduler-v2-apply.test.ts`

### API contract

- auth必須。
- request bodyは `{ revision }` のみ。
- proposed segmentsやRepair更新内容はclientから受け取らない。
- Serializable transaction内でScheduler v2 previewを再計算。
- submitted revisionと再計算したsnapshotRevisionが一致した場合だけapply。
- stale / serialization / schedule unique conflictは409。
- invalid bodyは400。

## Action別write

- `PROTECTED`: writeなし。
- `PRESERVE_UNPLACED`: writeなし。
- `NO_CHANGE`: writeなし。
- `SUMMARY_ONLY_SYNC`: `Repair.scheduledDate` のみ同期。
- `CREATE_AUTO`: proposed AUTO segmentsを作成しsummary同期。
- `CREATE_FROM_LEGACY`: legacy scheduledDate fallbackをAUTO segmentsへ正本化しsummary同期。
- `REPLACE_AUTO`: 対象RepairのAUTO segmentsだけ削除してproposed AUTO segmentsを作成しsummary同期。

MANUAL segmentは削除しない。
`scheduleLocked=true` はfail-closed。
`skipDuplicates` は使わない。
segment dateはrepoのcanonical date parserを利用する。

## Transaction / conflict

- whole-preview atomic。
- 同一Serializable transaction clientをpreview read / revision check / writeで共有。
- guard不一致はstaleとしてrollback。
- Prisma `P2034` は409。
- 独立レビュー指摘により、concurrent segment insert等で発生し得る `P2002` もこのapply経路ではstale/conflictとして409。
- `P2003` 等の無関係なPrisma errorまでは409へ広げない。

## Validation / Review

- Codex実装。
- カタリ独立レビューでP2002 conflict handlingを指摘。
- 修正後 blocking issueなし / PASS。
- 関連回帰test: 116 / 116 PASS。
- 独立レビュー修正後重点test: 42 / 42 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- staged `git diff --check`: PASS。
- schema / migration / seed / RLS / GRANT変更なし。
- UI / Task184 legacy writer / direct schedule editor変更なし。

## Production

- Application commit: `40002b773c4ec604cdbf23e7cfac95b22d39b700`
- Commit subject: `feat: add scheduler v2 atomic apply backend`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `057e36bb-f940-444c-900d-fee037131f10`
- Status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task193c2-20260928`
- Migration: none
- Smoke:
  - unauthenticated `POST /api/repairs/scheduler-v2-apply` = 401

## 次Task

Task193C3: human confirmation UI + legacy writer cutover。

- Scheduler v2 previewから明示的にapply。
- stale/conflict時はpreview再取得、auto-reapply禁止。
- apply成功後に最新previewへrefresh。
- segment正本化後にTask184 / direct `scheduledDate` writerが予定を破壊しないようguard / cutover。
- schema変更なしを基本とする。
