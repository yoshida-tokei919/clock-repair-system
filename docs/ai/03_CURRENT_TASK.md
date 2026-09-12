# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書です。過去Task履歴は残さず、現在有効な状態だけを書きます。

## 現在Task

Task166: local manual verification completed / commit pending

## Task境界

Task163〜165はproduction完了済み。

- B2C送付受付フォーム
- `送付待ち → 受付 → 見積中` のstatus flow
- staff intake invite発行
- Customer構造化住所
- Repair返送先snapshot
- B2C承認時の返送先確認/編集Dialog
- production transaction timeout修正
- 送付待ちから受付を必ず通すTask165E修正

production HEAD:

- `62bf636d0e96eaa04256a24889f2ac60614a6225`
- `Task165E: preserve reception step from shipping wait`

Task165E Railway deployment:

- `fe009b41-21e5-413f-9504-d4c3dae53cbb`
- SUCCESS

最新backup:

- `C:\Users\yoshi\clock-repair-backups\20260912\production-pre-task163-165.dump`
- SHA256 `27B3CC9E78C75C0452B6FA14660832DFC40EA7069FA273F0AAD0B05CC4B50D95`

## Task166: 部品発注完了後の案件status逆戻り修正

### 確定仕様

active `OrderRequest`:

- `pending`
- `ordered`
- `received`

inactive/completed:

- `assigned`

status連携:

- pendingあり → `部品待ち(未注文)`
- pendingなし + orderedあり → `部品待ち(注文済み)`
- activeがすべてreceived → `部品入荷済み`
- 最後のreceivedをassigned → `作業待ち`
- assigned済み部品や過去receivedだけで `部品入荷済み` に戻さない
- `作業待ち / 作業中` で新しいpendingが発生した場合は `部品待ち(未注文)` へ戻せる

### local修正状態

- active OrderRequestをsource of truthに変更
- assignedをactive集計から除外
- `RepairEntryForm` の `status / persistedStatus / statusLog / orderList` をrefresh後の最新 `initialData` に同期
- `useAutoRefreshOnReturn` に `popstate → router.refresh()` を追加
- browser backでもCtrl+R不要で最新statusを表示
- `作業待ち → 作業中` 正常
- `部品入荷済み` への逆戻りなし
- 不要な `作業中` 日付なし
- TypeScript成功
- 関連Node test 14件成功
- local manual verification完了

### 未実施

- stage
- Task166 commit
- recovery branch push
- GitHub diff review
- main push
- Railway deploy
- production manual verification

## 次の順序

1. Task166を明示stage / commit
2. recovery branchへpush
3. GitHub diff review
4. mainへfast-forward
5. Railway production deploy
6. production manual verification
7. Stripe MVP

## 対象外

Task166完了までは、Stripe、QR、shipping API、会計連携などへ広げない。
