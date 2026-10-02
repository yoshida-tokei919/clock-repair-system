# Task200D — Shipment発送前のPhysicalTag release確認

Status: production complete — 2026-10-03

## Scope

- Task200Cの`SHIPMENT_PACKING` flowを拡張し、新しいscan modeは追加しない。
- 梱包内容一致後にread-only release previewを行い、対象PhysicalTag / assignmentを表示する。
- scan、梱包確認、previewだけではDB mutationを行わない。
- ユーザーがrelease対象を確認し、明示的にreleaseボタンを押した場合だけPOSTする。
- Shipment作成、ShipmentStatus、tracking、Repair.status、StorageLocation、CSV、LINEは変更しない。
- schema / migration / RLS / GRANT変更なし。

## Server-side validation

- Shipment存在、`direction=OUTBOUND`、`status!=CANCELLED`、`actualShippedAt=null`を再確認する。
- ShipmentRepair集合とrequestされたRepair集合の完全一致を確認する。
- active PhysicalTagAssignmentの`assignmentId / physicalTagId / repairId`を再確認する。
- PhysicalTagが`ACTIVE`であることを確認する。
- active assignmentなし、複数active assignment、tag状態変化はfail closedとする。
- client preview / Task200C snapshotだけを信用しない。

## Atomicity / audit

- release全体をPrisma `Serializable` transactionで処理する。
- 各Assignmentは`id + repairId + physicalTagId + releasedAt:null`のguarded `updateMany`を使う。
- `count !== 1`なら409としてtransaction全体をrollbackし、partial releaseを防ぐ。
- 更新fieldは既存`PhysicalTagAssignment`の`releasedAt / releasedBy / releaseReason`だけ。
- `releasedBy`には実ログインAdmin IDを保存する。
- `releaseReason`はserver側でShipment IDを含む理由を生成する。
- PhysicalTag本体は`ACTIVE`を維持し、発送後も再利用可能とする。

## Client safety

- Task200Cのgeneration / request ID / stale response guardをrelease preview / POSTへ拡張した。
- mode変更、Shipment変更、clear、新規scan、梱包再確認で旧responseを無効化する。
- 400 / 401 / 404 / 409では発送ID再読込と梱包再確認を要求する。
- 通信断、5xx、成功responseの内容不明等は`uncertain`として、同sessionからの盲目的な再POSTを禁止する。

## Validation

- Implementer validation: Task200D / ScanSession / PhysicalTag / Shipment regression 67/67 PASS。
- Coordinator independent core regression: 32/32 PASS。
- TypeScript: PASS。
- `git diff --check`: PASS。
- `npm run build`: PASS。
- Independent review: blocking findingなし。既存active assignment partial unique indexとPhysicalTag lifecycle監査fieldの整合を確認。

## Production

- Application commit: `df4753cc50e84ab8f692924fb78e4408359531c6`
- Commit subject: `feat: add shipment physical tag release`
- Railway deployment: `174eaa26-0374-41c6-aa48-94a06ac9b2f7` — SUCCESS
- Production tag: `production-task200d-20261003`
- Region: `sin`
- Runtime: Next.js 15.5.27, Ready in 389ms
- Supabase migration: none; schema / migration / production DB mutationなし
- Smoke: `/`=200、`/login`=200、`/shipments`未認証=307、`/repairs`未認証=307、Shipment GET未認証=401、release GET/POST未認証=401。
- Railway HTTP logs: `upstreamErrors`なし。

## Next checkpoint

Task202Aは`task/202A`で実装・独立レビュー済み。最新mainへrebase・再検証後、production反映前に承認待ちで停止する。
Task202A完了後は次Taskへ進まず、QRリーダーBC-NL3000U-WとBrother QL-800 / DK-2205の実機PoCを先に実施する。
