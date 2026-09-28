# Task193C3 — Scheduler v2 apply UI / legacy writer cutover

Status: production complete
Date: 2026-09-28

## 目的

Scheduler v2 previewを人間の明示確認後にapplyできるUIへ接続し、RepairScheduleSegment正本化後に旧writerが予定を破壊しないようcutoverする。

## 実装

### Scheduler v2 apply UI

- `SchedulerV2Preview` に明示的な反映ボタンを追加。
- apply前に確認dialogを要求。
- POST payloadは `{ revision: snapshotRevision }` のみ。
- 成功後はpreview再取得。
- 409 stale/conflict時もpreview再取得するが、自動再POSTしない。
- actionable actionがない場合はapply disabled。
- その他errorは表示し、自動retryしない。

### 旧Task184 cutover

- legacy auto-schedule GET previewはread-only互換として維持。
- legacy POSTはDB writeを行わず409でScheduler v2を案内。
- legacy UIから反映ボタンを撤去。

### 個別予定編集guard

- segmentが0件ならlegacy fallbackとして予定日編集を継続。
- segmentが1件以上あり、予定日の暦日が変わる場合は409。
- segmentがあり予定日が同一暦日のpayloadなら、estimatedWorkMinutes / deliveryDateExpected / scheduleLocked等の更新は許可。
- segmentはこのendpointから変更しない。
- Serializable transactionを使用。
- 日付変更writeの `updateMany.where` に `scheduleSegments: { none: {} }` を追加し、初回確認後にsegmentが作られる競合もfail-closed。
- Repair詳細UIではsegment存在時の予定日inputをdisable。

## 独立レビュー修正

1. stored `scheduledDate` に時刻成分がある既存データで同一日を変更扱いしないよう、比較をYYYY-MM-DD単位へ修正。
2. segment不存在確認後の同時segment作成raceを防ぐため、日付変更SQL自体へrelation absence guardを追加。

## Validation

- Node関連回帰: 123 / 123 PASS。
- Playwright UI: 4 / 4 PASS。
  - confirmation cancelでPOSTなし
  - success後preview refresh
  - 409後preview refresh / auto re-applyなし
  - no actionable writesでapply disabled
  - 500等その他errorでretryなし
- `npx tsc --noEmit --incremental false`: PASS。
- staged `git diff --check`: PASS。
- schema / migration / seed / RLS / GRANT変更なし。
- PhysicalTag / NFC・QR差分はTask外として保護。

## Production

- Application commit: `10b52fffe219605dd971b3d4bfdc03d16d027072`
- Commit subject: `feat: cut over scheduler v2 apply workflow`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `4fae2a69-3b64-4569-ae47-4ebb0ca2c1da`
- Status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task193c3-20260928`
- Migration: none
- Smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated v2 preview = 401
  - unauthenticated v2 apply = 401
  - unauthenticated legacy apply = 401

## 次Task

Task194: 「今日の作業」画面。

Scheduler v2のsegment、部品準備、中断/再開、priority、日別容量、WorkTimeSessionを再利用して、今日実行すべき作業とタイマー開始導線を独立画面へまとめる。
