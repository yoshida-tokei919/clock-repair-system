# AI Task 006: 部品検索から発注管理までの業務フロー設計

## 目的

時計修理案件における、交換部品の選択・検索・マスタ登録・見積承認・発注管理・受取・案件割当・案件ステータス変更までの全体フローを整理する。

今回は実装しない。既存コードを壊さず、今後の実装Taskへ分解できるように、業務フローと画面・データ・ステータスの関係を設計ログとして残す。

## 調査対象

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/lib/repair-parts-status.ts`
- `src/app/(app)/orders/page.tsx`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/repairs/[id]/status/route.ts`
- `prisma/schema.prisma`

## 現状の画面・機能整理

### RepairEntryForm

- 見積・修理明細の入力、既存候補の選択、PartsMaster候補の明細挿入を担当している。
- 明細行は `type === 'part'` のとき `partsMasterId`、`partId`、`quantity`、価格、原価を持てる。
- PartsMaster候補を選択した場合、`buildPartLineItem` で明細行へ変換し、必要数量が不足していれば `ensureOrderRequest` へつなぐ。
- 新規案件ではまだ `repairId` がないため、`orderList` state にローカル保持し、保存payloadへ渡す。
- 既存案件では `/api/orders` にPOSTして `OrderRequest` を作成・更新する。
- `partsPanelRowIdx` で、右下の部品パネルからどの明細行へ挿入するかを紐付けている。

### PartsSearchPanel

- 既存PartsMaster候補を検索・表示し、選択結果を親へ返す役割。
- 現状では「候補を明細へ挿入する」用途が中心。
- 新規PartsMaster登録フォーム、外部サイト検索全体、発注管理、注文済み・受取済み管理までは持たせない方針でよい。

### PartsForm / parts画面

- PartsMasterの登録・編集を担当する画面。
- 現状では「部品マスタ登録後、この部品を元の修理明細へ挿入する」明確な戻り導線は未整備。
- 今後、修理画面から `/parts/new` を開く場合は、検索語・部品カテゴリ・内装/外装・戻り先repairIdなどをどう渡すかを別Taskで設計する必要がある。

### Orders画面

- `/api/orders` から `pending` / `ordered` / `received` の `OrderRequest` を取得して一覧表示する。
- 発注済み・入荷済みへのステータス変更は `/api/orders/[id]` のPUTで行う。
- 検索サイトへのリンクは `OrderRequest.searchWordJp/searchWordEn` または部品名から生成している。
- 「案件へ割当」ボタンは現状、画面上でリストから非表示にするだけで、永続的な割当処理ではない。
- Orders画面には既存の文字化けが残っている。今回の設計Taskでは修正しない。

## 関連データモデル

### EstimateItem

- 見積・修理明細。
- `type === 'part'` の明細が交換部品。
- `quantity` は見積上の必要数量。
- `partsMasterId` があればPartsMasterと紐付く。
- 旧来の `orderStatus` も存在するが、現在の発注管理の主軸は `OrderRequest` に寄っている。

### PartsMaster

- 部品マスタ。
- 明細挿入時の部品名、価格、原価、Ref、Cousins番号、仕入先、在庫数の基点。
- `stockQuantity` は受取済み処理などで参照・更新される。

### OrderRequest

- 発注管理の中心。
- 主な項目は `repairId`、`partsMasterId`、`quantity`、`status`、`supplierId`、`searchWordJp`、`searchWordEn`、`orderedAt`、`receivedAt`。
- `status` は `pending` / `ordered` / `received` / `cancelled` 想定。
- 既存POSTでは同一repair + partsMasterの `pending` / `ordered` があれば数量を加算する。
- PATCH保存時は、既存の `pending` のみ見積明細数量に同期する実装が入っている。

### Repair.status

- 発注状態に応じて `部品待ち(未注文)`、`部品待ち(注文済み)`、`部品入荷済み` へ自動更新する経路がある。
- `作業待ち` への移行は、現状の `getRepairStatusFromOrderStatuses` では自動返却されない。
- `作業待ち` は在庫チェックを伴う明示的なステータス変更として扱われている箇所があるため、完全自動化する前に業務ルールを分けて決める必要がある。

## 目標業務フロー

1. 修理明細の交換部品入力欄をクリックする。
2. 内装 / 外装を選択する。
3. 部品カテゴリを選択する。
4. 部品名を選択または入力する。
5. 過去交換済み、またはPartsMasterに存在する部品を候補表示する。
6. 候補が該当部品なら、クリックで見積明細へ挿入する。
7. 候補がなければ、外部検索サイトを開く。
8. 内装 / 外装に合わせて時計情報から検索ワードを生成する。
9. 各サイトの検索ページを開き、人間が該当部品を探す。
10. 見つけた部品情報をPartsMasterに登録する。
11. 登録済みPartsMasterを修理明細へ挿入する。
12. 見積を作成する。
13. 見積承認後、必要部品を発注管理へ出す。
14. 発注管理で購入サイトへ遷移する。
15. 人間が外部サイトで注文する。
16. 発注管理で「注文済み」にする。
17. 案件ステータスを「部品待ち(注文済み)」へ連動する。
18. 部品を受け取る。
19. 発注管理で「入荷済み」にする。
20. 受取済み部品を案件に割り当てる。
21. 必要部品が揃ったら、案件を「作業待ち」へ進める。

## 画面責務の分離案

### RepairEntryForm

- 明細入力、既存PartsMaster候補の選択、明細への挿入を担当する。
- 発注管理への連携は「必要部品をOrderRequestに出す」までに限定する。
- 注文済み・入荷済み・受取後の割当判断は持たせすぎない。

### PartsSearchPanel

- 既存PartsMaster候補の検索・選択に限定する。
- 外部検索やマスタ登録フォームを内包しない。
- 将来的に検索語やカテゴリ初期値を受け取る場合も、表示条件の最小拡張に留める。

### PartsMaster登録画面

- 外部検索で見つけた部品の登録を担当する。
- 修理画面から開かれた場合は、戻り先情報を持たせるか、保存後に再検索・選択しやすくする。
- 「この部品を明細に挿入」は便利だが、別タブ・別画面間の受け渡し設計が必要。

### Orders画面

- 未発注、注文済み、入荷済みの管理を担当する。
- 購入サイトリンク、注文済みボタン、入荷済みボタンはここに置く。
- 受取済み部品の案件割当を永続化するか、既に `repairId` で紐付いているものを確認済みにするだけかは別途決める。

## ステータス設計

### OrderRequest.status

- `pending`: 発注リストにあるが、まだ人間が注文していない。
- `ordered`: 人間が外部サイトで注文済み。
- `received`: 部品を受け取り済み。
- `cancelled`: 将来用。現状の一覧取得では主対象外。

### Repair.status 連動

- 1件でも `pending` があれば `部品待ち(未注文)`。
- `pending` がなく、1件でも `ordered` があれば `部品待ち(注文済み)`。
- 全件 `received` なら `部品入荷済み`。
- `作業待ち` は「入荷済み後に作業へ回せる」確認を挟むなら手動または専用アクションにするのが安全。

## 現時点の問題点・未整理点

- PartsMaster登録後に、元の修理明細へ安全に戻して挿入する導線が未整備。
- 外部検索の検索語生成はあるが、修理画面からPartsMaster登録画面へ検索条件を渡す設計が未整備。
- 部品カテゴリ選択フローは、現在の部品パネル/明細入力とまだ完全には接続されていない。
- Orders画面の「案件へ割当」は永続化せず、画面上で非表示にするだけ。
- `received` 後に `PartsMaster.stockQuantity` を増やす処理はあるが、その在庫を該当案件へ消し込む/割り当てる操作の定義が曖昧。
- `作業待ち` への自動遷移は現状の発注ステータス集約関数では行っていない。
- `src/lib/repair-parts-status.ts` やOrders画面には文字化けが残っているように見える。業務フロー実装前に別Taskで確認した方がよい。

## 最小Task分解案

### Task A: Orders画面の文字化け確認・修正

- 対象をOrders画面と関連する表示ラベルに限定する。
- 発注管理の操作文言が読めないと、以降の業務フロー確認が難しい。

### Task B: 部品検索から `/parts/new` への導線設計

- 修理画面から外部検索とPartsMaster新規登録を別タブで開く最小導線を追加する。
- まずは検索語・内装/外装・カテゴリをURL queryで渡すだけに留める。
- 明細への自動挿入はまだ行わない。

### Task C: PartsMaster保存後の明細挿入導線

- `repairId`、行index、または一時キーを使って元の修理明細へ戻すかを決める。
- 別タブ運用なら、保存後に「この部品を明細に挿入」ボタンで親画面へ通知する方式を検討する。
- 実装前に、既存案件と新規案件で分けて設計する。

### Task D: 発注管理の購入サイトリンク強化

- OrderRequestに保存済みの検索語を使って購入サイトを開く。
- 仕入先URLや購入URLを永続化するならDB変更が必要なので別Taskに分ける。

### Task E: 受取済み後の案件割当ルール整理

- `received` 時点で在庫を増やすだけでよいか、該当案件に消し込む必要があるかを決める。
- 既に `repairId` で紐付いているOrderRequestは「割当済み」とみなせる可能性がある。
- 「案件へ割当」ボタンを永続化するなら、別の状態または既存状態の再解釈が必要。

### Task F: `部品入荷済み` から `作業待ち` への移行

- 全部品入荷で自動的に `作業待ち` にするか、人間確認後に `作業待ち` にするかを決める。
- 推奨は、最初は `部品入荷済み` で止め、人間が確認して `作業待ち` に進める半自動運用。

## 推奨方針

最初の実装フェーズは半自動を維持する。

- 部品パネルは既存PartsMaster候補の選択に限定する。
- 外部検索とPartsMaster登録は別画面に分ける。
- 見積承認後または明細保存時に、必要部品を `OrderRequest.pending` として出す。
- 注文済み・入荷済みはOrders画面で人間がクリックする。
- 全部品入荷後は `部品入荷済み` で止め、`作業待ち` への移行は人間確認にする。

この分け方なら、既存の検索ロジック・保存ロジック・DB構造を大きく壊さず、1Taskずつ安全に進められる。
