# Task181: 承認前の先行発注を許可し、在庫引当と分離する

## 目的

見積中・承認待ちなど、まだ案件部品の在庫引当を行わない段階でも、ヨシダの明示判断で `OrderRequest（発注依頼）` を作成し、発注管理から実際に `ordered（注文済み）` へ進められるようにする。

業務上「この顧客なら承認が出る可能性が高いので先に注文しておく」があるため、発注可否と在庫引当可否を同一条件にしない。

## 現状確認

- `POST /api/orders` が `canAllocateRepairParts（案件部品を引当可能か）` を使って発注依頼作成自体を拒否している。
- そのため承認前 Repair で不足部品を選ぶと「承認前の案件には発注依頼を作成できません。」となる。
- `RepairEntryForm.ensureOrderRequest` は非2xx時にAPI本文を読まず `throw new Error('failed to create order request')` するため、auto call site では Next.js の Unhandled Runtime Error になる。
- `PUT /api/orders/[id]` は既に `pending -> ordered -> received` を承認前でも許可している。
- 非legacy Repairでは承認前の `syncRepairPartsStatusFromActiveOrders` が早期returnするため、ordered/receivedだけで Repair.status は進まない。
- `received -> assigned` は `canAllocateRepairParts` で承認前を拒否しており、この境界は維持する。
- `received` は物理入荷イベントなので、承認前でも stockQuantity 加算は既存どおり許可する。
- 承認後の `reconcileRepairPartAllocations` は ordered/received 数量を incomingQuantity として控除するため、既発注分を考慮できる。

## 確定仕様

### 1. 発注依頼作成と在庫引当を分離

承認前・見積中でも、明示的な不足部品について `OrderRequest(status=pending)` の作成・再利用を許可する。

ただし発注依頼作成だけでは以下を行わない。

- `RepairPartAllocation` の作成・更新
- `PartsMaster.stockQuantity` の減算
- `Repair.status` の部品待ち等への自動進行
- `RepairStatusLog` の追加
- `approvalStatus` の変更

`canAllocateRepairParts` は引き続き「在庫引当可能か」の判定にのみ使う。発注依頼作成の権限判定として再利用しない。

### 2. 先行発注は任意

見積明細へPartsMaster部品を追加しただけで、承認前Repairすべてにpending OrderRequestを自動生成してはいけない。

RepairEntryFormの既存の明示的/自動UIアクション（不足部品を選択・発注リストへ追加）で発注依頼が要求された場合のみ、承認前pendingを作成する。

### 3. pending.quantity の既存原則を維持

Task166Fの「`pending.quantity` は不足量の目標値として同期し、保存ごとに加算しない」を維持する。

- 同じ操作の再送で数量が二重加算されないこと。
- 既存pendingへクライアント数量を盲目的に加算しないこと。
- line item数量が2以上でも先行発注数量を1固定にしないこと。
- Repair保存後は、persist済み見積・現在在庫・`ordered` 数量を基準に、**既に明示作成済みのpending** の数量をサーバー側で補正できること。`received` は現在在庫へ反映済みとして別加算しない。
- 承認前保存時、pendingが存在しない別部品について新規pendingを勝手に作らないこと。
- persisted requirementが0または不足0になった既存pendingは、既存設計と整合する形でcancelled等へ安全に同期すること。
- 承認後の通常reconcileでは、`ordered` はincomingとして数え、`received` は既に `PartsMaster.stockQuantity`（物理在庫）へ反映済みとして一度だけ数え、二重pending・二重発注を作らないこと。

実装方法は最小差分でよい。既存 `reconcileRepairPartAllocations` のallocation/status責務を壊さず、必要なら「既存pendingだけを同期する」小さなhelperへ分離する。

### 4. 注文済み・入荷済み・割当の境界

既存挙動を維持する。

- pending -> ordered: 承認前でも可。在庫変更なし。
- ordered -> received: 承認前でも可。物理入荷としてstockQuantity加算。
- received -> assigned: 承認前は不可。既存の409・日本語エラー・atomic境界を維持。
- 承認前のordered/receivedでRepair.statusを部品待ち/入荷済みに進めない。
- 承認時は既発注/入荷分を考慮して不足・引当を再計算する。

### 5. RepairEntryFormのエラー処理

`ensureOrderRequest` はAPIエラーを内部で処理し、auto call siteから未処理Promise rejectionを出さない。

- 非2xx時は可能ならAPIの `{ error }` を読み、日本語toastで表示する。
- generic fallbackも日本語にする。
- 赤いNext.js Unhandled Runtime Error overlayにしない。
- 成功時の既存toast・orderList更新は維持する。
- Task181外の保存エラーや他UIを大きく変更しない。

## 変更対象候補

必要最小限に限定する。

- `src/app/api/orders/route.ts`
- `src/lib/repair-part-allocation.ts`
- `src/lib/repair-part-allocation.test.ts`
- `src/components/repairs/RepairEntryForm.tsx`
- 必要なら小さなorder helper/test追加
- このTask記録

`src/app/api/orders/[id]/route.ts` は既存の preapproval ordered/received と assigned拒否が正しいため、回帰防止に必要な場合だけ最小変更する。

## 対象外

- schema / migration / RLS / GRANT
- production DB
- 発注管理画面の全面改修
- supplier連携・自動発注
- 承認フローそのもの
- 在庫引当の基本仕様変更
- LINE / 帳票 / PDF / 共有ページ
- Task180のPartsMaster Ref/標準名仕様

## 実装・確認結果

実装完了。承認前の発注依頼作成と在庫引当を分離した。

- 承認前でも明示的な不足部品についてpending OrderRequestを作成できる。
- 発注依頼作成だけではRepairPartAllocation作成、stockQuantity減算、Repair.status進行を行わない。
- 既存pendingはRepair保存でサーバー同期した数量を正とし、古い画面側数量で上書きしない。
- 既存pendingがordered/receivedへ進んだ後の再送では、総必要数・現在在庫・ordered数量からサーバー側で不足を再計算し、不要なpendingを作らない。
- received数量は物理在庫へ反映済みなので、在庫と別にincomingへ二重計上しない。
- received -> assigned の承認前409境界は維持する。
- RepairEntryFormの非2xxは日本語toastへ落とし、auto call siteの未処理Promise rejectionを防止する。
- schema / migration / RLS / GRANT変更なし。

### 自動確認

- `npx tsc --noEmit --incremental false`: 成功。
- `npx tsx --test src/lib/repair-part-allocation.test.ts`: 26/26成功。
- stale clientによる既存pending上書き防止テスト: 成功。
- ordered/received後の再送による二重pending防止テスト: 成功。
- `git diff --check`: 成功（LF/CRLF warningのみ）。
- `npx next build`: 成功。既存の `/api/repairs/recent` Dynamic Server UsageログとBrowserslist warningのみ。
- `npm run build`: Prisma generate時に起動中プロセスが `query_engine-windows.dll.node` を保持しておりEPERM。コード失敗ではないため同じ再試行はしていない。

### 独立レビュー

Codex read-only reviewで以下2件のP2を検出し、修正済み。

1. stale client値でserver-synchronized pending quantityを上書きできる問題。
2. pendingがordered/receivedへ進んだ後の再送で余分なpendingを作れる問題。

修正後はカタリが差分・境界・テスト結果を独立確認した。

## 画面受入条件（必要時の確認項目）

ユーザー手動画面確認はTask完了条件にしない。必要な場合は以下を確認する。

1. B2C承認前Repairで不足PartsMasterを選択しても赤いUnhandled Errorが出ず、発注リスト追加できる。
2. Repair.status / approvalStatus が変わらない。
3. RepairPartAllocationが作られず、stockQuantityも減らない。
4. pending -> ordered -> received は承認前でも進められる。
5. receivedでstockQuantityは入荷分だけ増えるが案件割当されない。
6. received -> assigned は承認前409で拒否される。
7. 承認後は既発注/入荷分を考慮し、二重pendingを作らない。

**Production: pending**。commit後もpush/deployはユーザー承認まで行わない。
