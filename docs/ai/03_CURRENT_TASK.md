# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書です。過去Task履歴は残さず、現在有効な状態だけを書きます。

## 現在Task

Task166F: in progress

## 目的

案件で使用するPartsMaster（実部品・在庫マスタ）について、単純な在庫減算ではなく案件別の確保数量を永続管理し、在庫・発注・入荷・案件ステータスを整合させる。

`RepairPartAllocation（案件別部品確保）` を導入し、`PartsMaster.stockQuantity（在庫数）` を他案件が利用可能な未確保在庫として扱う。

## Task境界

- 見積明細へ部品を追加しただけでは在庫を確保しない。
- 承認後または作業へ入る段階で案件部品確保を再計算する。
- 必要数と既存確保数の差分だけを確保・解放し、再保存で二重減算しない。
- OrderRequest（発注依頼）はTask166Fでは案件不足分を扱う。
- active OrderRequestは `pending / ordered / received`、inactiveは `assigned` とする。
- `ordered → received` は物理入庫として在庫を増やす。案件確保はまだ行わない。
- `received → assigned` は在庫から案件へ割り当て、RepairPartAllocationを増やす。
- `received → assigned` はatomic（全部成功または全部rollback）。在庫不足ならHTTP 409で止め、OrderRequestはreceivedのまま、新しいpendingを作らない。
- `受付 / 見積中 / 承認待ち` は在庫があるだけで自動的に作業待ちへ進めない。
- B2C承認時、在庫が足りれば確保して `作業待ち`、不足ならpending不足発注を同期して `部品待ち(未注文)` とする。

## 現在状態

- Task166本体のステータス逆戻り修正はmainへ反映済み。
  - `e01488b41e48cbcf33c15c14f4972331564f5988`
  - `c6cb2d36ceaf0d046b33b324809e44cdcb0199e9`
- Task166確認中に見つかった新規案件POSTのPrisma transaction timeout修正もmainへ反映済み。
  - `e43ddf3dbf2bfd616f05160cfd26058bfc1865e4`
  - POST transaction: `maxWait: 5000 / timeout: 20000`
  - request body全体を出していたlogを削除
- Task166Fの実装差分はlocalにあり、この文書更新時点では未commit・production未反映。
- 正常な発注フローはlocal手動確認済み。
  - 在庫0 / 必要1
  - ordered: 在庫0
  - received: 在庫1
  - assigned: 在庫0
  - RepairPartAllocation: RESERVED 1
  - OrderRequest: assigned
  - Repair: 作業待ち
- 再保存で二重減算しない挙動を確認済み。
- `npx tsc --noEmit --incremental false`: 成功。
- 関連Node testは修正途中で27件成功。最終再実行はassertion failureではなく `spawn EPERM` により子プロセス起動前に停止したため、同じ回避再実行は行っていない。
- 最終のreceived→assigned異常系修正で確認できている変更ファイルは以下3件。ただしTask166F全体のlocal差分はこれ以外にもあるため、commit前に必ず全diffを確認する。
  - `src/app/api/orders/[id]/route.ts`
  - `src/lib/repair-part-allocation.ts`
  - `src/lib/repair-part-allocation.test.ts`

## commit前に残っている手動確認

B2C承認フローを1件確認する。

1. B2C案件を `承認待ち`、必要部品1、PartsMaster在庫1で用意する。
2. 承認前は在庫1のままで、見積明細だけでは確保されていないことを確認する。
3. 顧客共有ページの `この内容で進める` から返送先確認を経て承認する。
4. 承認後に以下を確認する。
   - 在庫 `1 → 0`
   - RepairPartAllocation `RESERVED=1`
   - Repair `作業待ち`
   - 案件不足のactive OrderRequestなし
5. 再読込しても `作業待ち` のまま、再保存しても在庫0 / allocation1のままで二重減算しないことを確認する。

この確認が通ればTask166Fをcommit候補とする。

## production移行ルール

- 既存production案件について「過去にすでに在庫を減算したか」を安全に推定できないため、推測によるRepairPartAllocationの一括backfillは禁止する。
- production migration前にRepair、PartsMaster、OrderRequestをread-only監査する。
- Task166FをcommitしただけではTask完了としない。

## 次Task

- Task166G: production移行前read-only監査
- Task166H: backup → migration → deploy → production smoke test
- Task167: Stripe決済設計
- Task168: Stripe基盤
- Task169: B2C共有ページからStripe Checkout
- Task170: Stripe Webhook
- Task171: 決済UI・業務連動
- Task172: Stripe production化

最低在庫数を割った際の自動補充発注はStripe実装後の別Taskとし、Task166Fには含めない。

## 対象外

- 最低在庫による自動補充発注
- Stripe実装
- production DB変更
- Railway deploy
- Task対象外の帳票・LINE・PublicCase等の変更
