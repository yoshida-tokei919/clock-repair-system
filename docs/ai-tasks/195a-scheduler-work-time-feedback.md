# Task195A — Scheduler v2 work-time feedback

Status: production complete
Date: 2026-09-29

## 目的

Task190で既に実装済みのRepair作業時間実績学習を、Scheduler v2 preview上で確認できるようにする。
Schedulerの予定計算自体は保存済み推定時間を正本とし、推薦値は情報表示に限定する。

## 実装

- `src/lib/scheduler-v2-work-time-feedback.ts`
- `src/lib/scheduler-v2-work-time-feedback.test.tsx`
- Scheduler v2 preview GETへfeedback付きloaderを追加。
- Scheduler v2 UIへ保存値 / 推奨値 / 差分 / evidenceを追加。
- Repair詳細の既存作業時間previewへstable anchorを追加。

### Feedback

各Repairについて以下を表示可能にした。

- currentEstimatedWorkMinutes
- recommendedEstimatedWorkMinutes
- deltaMinutes
- status: UP_TO_DATE / RECOMMENDED_CHANGE / UNAVAILABLE
- Task190 previewStatus
- adoptedReason
- adoptedTier
- usableSampleCount

統計ロジックはTask190の `resolveRepairWorkTimePreview` をそのまま再利用する。

## Scheduler安全性

- plannerは推薦値を使用しない。
- Scheduler v2 applyは推薦値を書き込まない。
- feedbackはsnapshotRevisionへ含めない。
- GET表示用の `loadSchedulerV2PreviewWithFeedback` と、apply用core `loadSchedulerV2Preview` を分離。
- Serializable apply transactionはWorkTimeSession / RepairWorkTimeStandardを読まない。

## 独立レビュー

初版ではfeedback loaderがcore previewへ入っており、Task193C2 applyのSerializable transactionまで全REPAIR履歴を読む状態だった。

カタリ独立レビューでblockingとし、以下へ修正。

- core preview: 従来のschedule入力だけ
- GET preview: core + feedback
- apply: coreのみ
- feedback-only変更ではschedule revision不変
- 保存済みestimatedWorkMinutes変更ではschedule revision変化

## Validation

- 最終主要回帰: 106 / 106 PASS。
- Scheduler focused: 39 / 39 PASS。
- Task190 / Task192回帰: 67 / 67 PASS。
- TypeScript: PASS。
- diff-check: PASS。
- schema / migration / DB write追加なし。

## Production

- Application commit: `df8db7b0408d97c7c458a10e9e6c52efebd54d9f`
- Commit subject: `feat: surface scheduler work-time feedback`
- Railway deployment: `0a9a0517-2406-4a23-98e6-42beb3dd0ee1`
- Status: SUCCESS
- Production tag: `production-task195a-20260929`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated Scheduler v2 preview 401

## 次Task

Task195B: OrderRequest実績から調達総リードタイムfeedbackをread-onlyで可視化する。
Supplier処理日数とShippingMethod輸送日数は分離概念のまま保持し、観測不能な内訳は推測しない。
