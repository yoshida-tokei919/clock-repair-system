# Task191A: 発注リードタイム・作業中断 schema foundation

## 範囲と状態

Task191 のうち、Supplier と調達配送方法の手動リードタイム、OrderRequest の入荷予定日、Repair の中断計画状態を保存する Prisma schema と migration のみを追加した。resolver、API、UI、Task184 scheduler、RepairPartAllocation の同期処理は変更していない。Production: complete。production application commit は `b09fc122b89690474239d0b997b2fcd9222e69aa`。

## 現行データとの接続

- `OrderRequest.supplierId`、`orderedAt`、`receivedAt` は既存列を使う。`actualArrivalDate` は追加せず、実入荷時刻として `receivedAt` を使う。リードタイム実績の算出は Task195 に委ねる。
- `OrderRequest.status = received` は物理的な入荷、`assigned` は案件への割当を表す。新しい enum や status 遷移は追加しない。割当の正本は既存の `RepairPartAllocation` とする。
- `partsReadyDate` は保存列を追加しない。Task191 の後続 resolver で、案件の OrderRequest と RepairPartAllocation の状態から導出する。計算式、未紐付け発注や legacy 案件の扱いはその段階で決める。
- `Repair.status` は既存の業務状態として維持する。`RepairPlanningState` は Repair と 1:1 の任意行で、`blocked`、理由、残作業時間、再開可能日、再確認日を保存する。行がない Repair の解釈や scheduler 除外条件は後続 Task で定義する。

## 追加 schema

- `SupplierLeadTimeSetting` は Supplier の任意 1:1 設定。`manualProcessingLeadDays` の `null` は未設定、`0` は明示的な 0 日。Supplier 行や既存 seed を変更しない。
- `ProcurementShippingMethod` は調達の輸送手段で、将来の顧客向け Shipment とは別。`manualTransitLeadDays` の `null` と `0` も区別する。`name` は一意、`isActive` の初期値は true。Cousins、DHL などの選択肢や所要日数は推測して seed しない。
- `OrderRequest.procurementShippingMethodId` と `expectedArrivalDate` は nullable。既存行を backfill しない。配送手段削除時は FK を `SET NULL` とし、予定日と配送手段 ID に個別 index を置く。予定日の自動算出や更新は後続 Task。
- `RepairPlanningState` は Repair 削除時に cascade。`remainingWorkMinutes` の `null` は未設定、`0` は残作業なし。残作業時間の算出・更新は Task193 以降。`resumeEligibleDate` と `reviewDate` は任意の日付。
- `RepairBlockReason` は `ADDITIONAL_PART_POSSIBLE`、`REPAIR_METHOD_REVIEW`、`WAITING_CUSTOMER`、`WAITING_OUTSOURCE`、`WAITING_PARTS`、`OTHER`。Repair の status 値や enum は変更しない。

## DB 制約とアクセス

手動日数と残作業分数は `null` または 0 以上。理由メモは `null` または空でない trim 済み文字列。`blocked = true` のとき理由を必須とし、`blocked = false` のとき理由を `null` にする。これらは PostgreSQL `CHECK` で守る。

新規 3 テーブルは Next.js サーバーから Prisma で使う専用データ。migration で RLS を有効化し、policy と Data API 向け GRANT は追加しない。`anon`、`authenticated`、`service_role` に対して 3 テーブルおよび `ProcurementShippingMethod` の sequence の権限を `REVOKE ALL` する。既存の Supplier、OrderRequest、Repair の RLS や権限は変更しない。

## 後続 Task と反映

Task191B/C/D で設定操作、到着予定 resolver、partsReadyDate と中断状態の業務連携を段階的に扱う。Task184 scheduler はこの Task では現状の status 判定のままであり、部品待ち除外の新規保証はまだない。Task191A の schema / migration はproductionへ反映済み。次Taskはユーザー承認なしに開始しない。

## ローカル確認

- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `node tests/task191a-schema.test.mjs`: 4 / 4 PASS。`node --test` は実行環境の `spawn EPERM` で起動できなかったため、テストファイルを直接実行した。
- `git diff --check`: PASS
- 一時 PostgreSQL 15 コンテナで migration を適用: PASS。0 日・0 分の保存、負数・不整合理由・未trimメモの拒否、FK、RLS、anon / authenticated / service_role のテーブル・sequence 権限なしを確認。コンテナは削除済み。
- Codex実装後、カタリ独立レビュー完了。
- Railway production buildで Prisma Client v5.7.0 の再生成成功。

## Production反映

- Production application commit: `b09fc122b89690474239d0b997b2fcd9222e69aa`
- Production tag: `production-task191a-20260927`
- production backup: `C:\Users\yoshi\clock-repair-backups\task191a-20260927T121904Z`
  - `public.dump` 344,178 bytes
  - SHA256 `C9F55BDC00799FC6F0BAE31BFAE2EE52EA473F17BC36F853342189B792AF328C`
  - TOC 776件 / public TABLE DATA 66件
  - `pg_restore -l` 成功
- Supabase migration: `20260927122026 add_order_lead_time_blocking_foundation`
- production DB verification:
  - 新3テーブル存在、初期0行
  - `OrderRequest.expectedArrivalDate` / `procurementShippingMethodId` 存在
  - RLSは新3テーブルすべて有効、policy 0件
  - anon / authenticated / service_role のtable SELECT権限なし
  - `ProcurementShippingMethod_id_seq` のUSAGE権限なし
  - CHECK / FK / index / `RepairBlockReason` enumを確認
- Security Advisor:
  - 新3テーブルの `rls_enabled_no_policy` INFO はserver-only設計として意図どおり
  - 既存2関数の `function_search_path_mutable` WARN はTask191A対象外
- Railway deployment: `99b2d0e2-3ba0-4b1c-82d9-fe281af6253d`
  - source commit `b09fc122b89690474239d0b997b2fcd9222e69aa`
  - status `SUCCESS` / region `sin`
- Runtime: `next start` 正常起動、`Ready in 355ms`
- Non-destructive smoke: `/` = 200、`/login` = 200、`/api/orders` = 200

Production: complete
