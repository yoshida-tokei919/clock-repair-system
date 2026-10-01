# Task198B — StorageLocation move flow / ScanSession connection

Status: production complete
Date: 2026-10-02

## Purpose

Task198Aで追加したStorageLocation基盤へ、Repairの実移動履歴を安全に記録するserver-side domain/APIと、Task197の共通ScanSessionを接続する。

scanだけでは状態変更せず、人間の確認操作を必須とする。

## Production record

- Application commit: `aeaa0be6723b526de87af74e18c9faac61c3a5b1`
- Commit subject: `feat: add storage location move flow`
- Railway deployment: `b457c062-0330-4699-9646-25703fdd0967`
- Deployment status: `SUCCESS`
- Production tag: `production-task198b-20261002`
- Region: `sin`
- Runtime: Next.js Ready in 300ms
- Schema / migration / RLS / GRANT changes: none

## StorageLocation resolver

Authenticated endpoint:

`POST /api/storage-locations/resolve`

Supported identifier types:

- `NFC_UID`
- `QR_TOKEN`
- `SHORT_CODE`

NFC normalizationはPhysicalTagと同じ保守的contractを使用し、R65固有のbyte order、10進→16進変換、prefix/suffix除去、UID固定長等を推測しない。

Responses:

- `NOT_FOUND`
- `INACTIVE`
- `RESOLVED`

raw nfcUid / qrTokenはresponseへ返さない。

## StorageLocation move API

Authenticated endpoint:

`POST /api/storage-locations/move`

Input:

- destination StorageLocation ID
- Repair IDs: 1〜100件
- optional reason

Behavior:

- one Prisma Serializable transaction for the full batch
- destination must exist and be active
- all Repairs must exist before mutation
- old active assignment is released with actual Admin.id audit
- new assignment is created with the same shared timestamp
- history is preserved
- Repair already at the destination is unchanged/no-op
- one failure rolls back the entire batch
- stale guarded update / P2002 / P2034 maps to 409
- Repair.status / RepairWorkPlan are not changed

## ScanSession

Added stable mode:

`LOCATION_MOVE`

Workflow:

1. Location move modeを選択
2. destination未選択時の次scanはStorageLocation resolverへ送る
3. destination確定後のscanはPhysicalTag resolverへ送る
4. Repairsを複数選択
5. 明示的な「この保管場所へ移動」確認操作
6. move API成功後はRepair選択だけclearし、destinationは保持
7. destination変更時はdestinationと選択Repairをclear

### Continuous scan safety

LOCATION_MOVEのqueued raw inputはenqueue時点でLocation/Repair種別を固定しない。

destination resolver処理中に次scanがqueueへ入った場合も、処理時点のlive destination stateを見てLocationかRepairかを決定する。

既存の以下は維持:

- FIFO queue
- pending max 16
- 750ms同一raw scan debounce
- stale generation protection

Selection上限はmove APIと合わせて100件。

## Verification

Implementer: Codex
Independent reviewer: Katari

Independent review findings:
- blocking issueなし
- API最大100件に対してUI選択が101件以上可能だった不整合をレビュー中に検出し、100件上限へ修正済み

Final verification:

- Task198B + ScanSession + PhysicalTag regression: 42/42 PASS
- TypeScript: PASS
- `git diff --check`: PASS
- `npm run build`: PASS
- known existing `/api/repairs/recent` Dynamic server usage message only; build exited 0
- schema/migration/docs changes: none
- Repair.status write: none

## Production smoke

- `GET /` = 200
- `GET /login` = 200
- unauthenticated `GET /repairs` = 307
- unauthenticated StorageLocation resolve valid JSON = 401
- unauthenticated StorageLocation resolve malformed JSON = 401
- unauthenticated StorageLocation move valid JSON = 401
- unauthenticated StorageLocation move malformed JSON = 401

No production mutation smoke was performed because production currently has zero StorageLocation rows.

## Out of scope

Task198B did not implement:

- initial Japanese StorageLocation rows
- StorageLocation create/edit/delete UI
- location shortCode/QR/NFC issuance flow
- current-location visibility on Repair detail
- location inventory/count UI
- location mismatch detection
- recommended-zone logic
- automatic Repair.status changes
- Shipment
- PhysicalTag lifecycle changes
- printer changes
- schema/migration changes

Next candidate: Task198C after explicit user approval and fresh implementation-prep review.
