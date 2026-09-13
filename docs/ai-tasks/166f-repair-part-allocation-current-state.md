# Task166F: 案件別部品確保・在庫・発注連動 現状記録

更新日: 2026-09-14

## 背景

Task166の部品発注ステータス逆戻り問題を確認する過程で、案件に必要な部品について「このRepairがPartsMaster在庫を何個確保済みか」を永続的に判定できない構造上の問題が見つかった。

単純な `stockQuantity` 減算とOrderRequestだけでは、PATCH再保存やstatus更新時の二重減算を安全に防げないため、Task166Fでは `RepairPartAllocation（案件別部品確保）` を追加する方針に確定した。

## 確定仕様

### PartsMaster.stockQuantity

`PartsMaster.stockQuantity（在庫数）` は、他案件が利用可能な**未確保在庫**を表す。

### RepairPartAllocation

案件ごとの確保数量を永続管理する。

最低限の状態:

- `RESERVED（確保済み）`
- `CONSUMED（使用済み）`
- `RELEASED（解放済み）`

必要数と現在のRESERVED数量を比較し、差分だけを確保・解放する。

- 必要数 > 確保数: 差分だけ確保し、その分だけstockQuantityを減らす
- 必要数 < 確保数: RESERVEDの差分だけ解放し、その分stockQuantityを戻す
- 明細削除: 対応するRESERVEDを解放する
- 同じ内容で再保存: 在庫・確保数を変えない

### 確保タイミング

見積明細へPartsMaster部品を追加しただけでは確保しない。

`受付 / 見積中 / 承認待ち` の段階では、在庫があるという理由だけで `作業待ち` に進めない。

B2Cでは顧客承認後に案件部品確保を再計算する。

### OrderRequest

Task166Fでは案件不足分の発注を扱う。

active:

- `pending（未注文）`
- `ordered（注文済み）`
- `received（入荷済み）`

inactive:

- `assigned（割当済み）`

`pending.quantity` は不足量の目標値として同期し、保存ごとに加算しない。

### 発注・入荷・割当

- `pending → ordered`: 在庫は変えない
- `ordered → received`: 物理入庫としてstockQuantityを増やす。まだ案件確保しない
- `received → assigned`: stockQuantityを減らし、RepairPartAllocationをRESERVEDにする

`received → assigned` はatomic（全部成功または全部rollback）とする。

在庫不足などの不整合がある場合:

- HTTP 409
- 日本語の明確なエラー
- allocationを作らない
- stockQuantityを変更しない
- OrderRequestはreceivedのまま
- 新しいpendingを作らない
- Repair.statusを変更しない
- status logを追加しない

`received → received` の再送では在庫を二重加算しない。

## Repair.status連動

- pendingあり → `部品待ち(未注文)`
- orderedあり → `部品待ち(注文済み)`
- receivedあり → `部品入荷済み`
- 必要部品を全量確保済みで部品フローに入っている → `作業待ち`

B2C承認時:

- 在庫十分 → 確保 → `作業待ち`
- 在庫不足 → pending不足発注を同期 → `部品待ち(未注文)`

旧ロジックの「部品明細あり + OrderRequest 0件 = 部品待ち(未注文)」は使用しない。

## local確認済み

正常な発注フロー:

1. 在庫0 / 必要1
2. ordered → 在庫0
3. received → 在庫1
4. assigned → 在庫0
5. RepairPartAllocation → RESERVED 1
6. OrderRequest → assigned
7. Repair → 作業待ち

`0 → 1 → 0` の在庫移動を手動確認済み。

再保存で二重減算しない挙動も確認済み。

確認結果:

- `npx tsc --noEmit --incremental false`: 成功
- 関連Node test: 修正途中で27件成功
- 最終再実行: assertion failureではなく `spawn EPERM` で子プロセス起動前に停止。無限再試行はしていない
- 対象差分の `git diff --check`: 成功

最終のreceived→assigned異常系修正で確認されているファイル:

- `src/app/api/orders/[id]/route.ts`
- `src/lib/repair-part-allocation.ts`
- `src/lib/repair-part-allocation.test.ts`

Task166F全体のlocal差分はこれ以外にもあるため、commit前に必ず全diffを確認する。

## commit前に残っている手動確認

B2C承認フロー1件。

条件:

- B2C Repair
- status = `承認待ち`
- PartsMasterに紐づく必要部品1
- stockQuantity = 1
- 承認前allocationなし

期待:

1. 承認前はstockQuantity=1のまま
2. 顧客共有ページから `この内容で進める`
3. 返送先確認を経て承認
4. stockQuantity `1 → 0`
5. RepairPartAllocation `RESERVED=1`
6. active shortage OrderRequestなし
7. Repair `作業待ち`
8. 再読込でも作業待ちのまま
9. 再保存してもstockQuantity=0 / allocation=1のまま

この確認が通ればTask166Fをcommit候補とする。

## production移行方針

Task166Fのコード・migrationはこの文書作成時点ではlocal未commit、production未反映。

既存production案件について、過去に在庫をすでに減算したかを安全に推定できないため、推測によるRepairPartAllocationの一括backfillは禁止する。

次工程:

- Task166G: production移行前read-only監査
- Task166H: backup → migration → deploy → production smoke test

## Stripeまでのロードマップ

- Task167: Stripe決済設計
- Task168: Stripe基盤
- Task169: B2C共有ページからStripe Checkout
- Task170: Stripe Webhook
- Task171: 決済UI・業務連動
- Task172: Stripe production化

最低在庫数を割った際の自動補充発注はStripe実装後の別Taskへ回す。

## 動作確認ルール

Codex/AIはユーザーから明示指示がある場合を除き、Playwrightやブラウザ自動操作を行わない。

Codex/AIは静的確認・型チェック・関連Node test・`git diff --check` を基本とし、実画面確認はユーザーが手動で行う。
