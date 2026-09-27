# Task191D: 部品準備日と作業中断・再開

Production: complete

## 範囲

- `EstimateItem(type=part, partsMasterIdあり)` の必要数量を部品IDごとに集計する。quantityがnullなら1、0なら0とする。
- `RepairPartAllocation` の `RESERVED` / `CONSUMED` を案件確保済み数量とし、`RELEASED` と一般在庫 `PartsMaster.stockQuantity` は含めない。
- 不足数量を同じrepairId/partsMasterIdの `ordered` (expectedArrivalDate) と `received` (receivedAtのAsia/Tokyo暦日) の日付付き数量で積み上げる。`pending`、`cancelled`、`assigned`、日付未設定の供給は日付見込みに含めない。
- 全不足部品に日付付き供給が足りる場合、各部品の不足充足日で最も遅い日を `partsReadyDate` として返す。入荷済みでも引当されるまで `isReady=false`。日付不足なら `WAITING_UNKNOWN`。
- `partsAllocationLegacy=true` は `LEGACY_UNKNOWN`。必要部品がない非legacy案件は `NOT_REQUIRED`。全量引当済みは `READY`。
- `RepairPlanningState` のblock/update/resume操作を認証付きRepair単位APIと画面に追加。中断中も理由・メモ・残作業時間・日付を編集できる。block/updateは同一DB transactionで当該Repairに紐づく稼働中WorkTimeSessionをactivityTypeに関係なく停止する。別RepairやrepairIdを持たないglobal/inquiry timerは停止しない。resumeは理由・日付を消し、残作業時間を保持する。
- `WAITING_PARTS` を画面で選び、再開可能日が空欄で部品準備見込み日がある場合、その日付を入力候補として設定する。保存済みの日付や手入力した日付は上書きしない。

## 境界

- schema、migration、seed、RLS/GRANTは変更しない。`partsReadyDate` は保存しない。
- `Repair.status`、予定日、scheduleLocked、Task184 schedulerは変更しない。部品準備日とPlanningStateによるscheduler除外はTask191Eで扱う。
- `remainingWorkMinutes` は手入力保存のみ。自動算出・更新はTask193以降。
- `WAITING_PARTS` と `partsReadyDate` の連動は上記の画面入力候補のみ。自動resumeやサーバー側のresumeEligibleDate更新はしない。
- LINE、Shipment、PDF、production DB、push、deployは対象外。

## ローカル確認

- Parts readiness: 7 tests PASS
- Planning parser: 2 tests PASS
- WorkTimeSession: 5 tests PASS
- RepairPartAllocation: 26 tests PASS
- Order expected arrival: 8 tests PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- カタリ独立レビュー・独立再検証: PASS。初回レビュー指摘3点（同Repair timer停止条件、中断中の編集UI、WAITING_PARTS時の再開可能日候補入力）は修正済み。
- 合計48 tests PASS（Parts readiness 7 + Planning 2 + WorkTimeSession 5 + RepairPartAllocation 26 + Order expected arrival 8）。
- schema / migration / seed / roadmap / Task184 scheduler へのTask外差分なし。
- `npm run lint`: ESLint設定がまだないため対話的な初期設定プロンプトとなり、lint結果は未確認。
- `npm run build`: local Windowsでは `prisma generate` が既存Prisma DLLのunlinkで `EPERM`、`npx next build` もworkerの `spawn EPERM` で停止したためlocal buildは未確認だった。

## Production確認

- Production application commit: `3a5b53f5cbff979cd4d17f283298b3a5f3b9a34e`
- Commit subject: `feat: add parts readiness and repair planning`
- Railway deployment: `b9a1c248-89d5-4713-bc92-d549131ac3c1`
- Deployment status: `SUCCESS`
- Region: `sin`
- Production tag: `production-task191d-20260927`
- schema / migration: なし。production DB backup / migration不要。
- Railway production build:
  - Prisma Client v5.7.0生成成功
  - Next.js production compile成功
  - lint / type check通過
  - static pages 66/66生成完了
  - 既存 `/api/repairs/recent` Dynamic server usageログはbuild失敗ではなくTask外
- Runtime: `next start` 正常起動、`Ready in 757ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/api/repairs/1/planning` = 401（想定どおり）

Production: complete
