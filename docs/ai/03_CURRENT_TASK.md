# CURRENT TASK

## 現在のcheckpoint — 2026-09-27

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `b09fc122b89690474239d0b997b2fcd9222e69aa`
- Commit subject: `feat: add order lead time blocking foundation`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `99b2d0e2-3ba0-4b1c-82d9-fe281af6253d`
- Deployment status: `SUCCESS`
- Production tag: `production-task191a-20260927`
- Region: `sin`
- Schema / migration: `20260927122026 add_order_lead_time_blocking_foundation`

Production: Task191A complete

## Task191A production確認

- Production backup: `C:\Users\yoshi\clock-repair-backups\task191a-20260927T121904Z`
  - `public.dump` 344,178 bytes
  - SHA256 `C9F55BDC00799FC6F0BAE31BFAE2EE52EA473F17BC36F853342189B792AF328C`
  - TOC 776件 / public TABLE DATA 66件
  - `pg_restore -l` 成功
- Supabase migration: `20260927122026 add_order_lead_time_blocking_foundation`
  - `SupplierLeadTimeSetting` / `ProcurementShippingMethod` / `RepairPlanningState` を作成
  - `OrderRequest.expectedArrivalDate` / `procurementShippingMethodId` を追加
  - 新3テーブルは初期0行
  - RLS有効、policy 0件
  - `anon` / `authenticated` / `service_role` のtable SELECT権限なし
  - `ProcurementShippingMethod_id_seq` のUSAGE権限なし
  - CHECK / FK / index / `RepairBlockReason` enumをproductionで確認
- Security Advisor:
  - 新3テーブルの `rls_enabled_no_policy` INFO はserver-only設計として意図どおり
  - 既存2関数の `function_search_path_mutable` WARN はTask191A対象外
- Railway:
  - source commit `b09fc122b89690474239d0b997b2fcd9222e69aa`
  - deployment `99b2d0e2-3ba0-4b1c-82d9-fe281af6253d`
  - status `SUCCESS` / region `sin`
  - production buildで Prisma Client v5.7.0 再生成成功
- Runtime: `next start` 正常起動、`Ready in 355ms`
- Non-destructive smoke: `/` = 200、`/login` = 200、`/api/orders` = 200
- local validation:
  - Task191A schema test: 4 / 4 PASS
  - `npx prisma validate`: PASS
  - `npx tsc --noEmit --incremental false`: PASS
  - `git diff --check`: PASS
  - isolated PostgreSQL 15 migration fixture: PASS
- Codex実装 → カタリ独立レビュー完了。
- `receivedAt` を実入荷日時の正本として維持し、`actualArrivalDate` は追加していない。
- `partsReadyDate` は保存せず、後続resolverで `OrderRequest` + `RepairPartAllocation` から導出する。
- Supplier処理日数と調達配送方法の輸送日数を別モデルで保持する。
- Task184 scheduler、発注status遷移、RepairPartAllocation同期、runtime API/UIは変更していない。

## Schedule / Scheduler の現在地

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了
6. Task188: WorkTimeSession基盤 — production完了
7. Task189: 共通業務タイマーUI — production完了
8. Task190A: Scheduler設定・標準作業時間 schema foundation — production完了
9. Task190B: WorkTimeSession実績集計・統計resolver — production完了
10. Task190C: Scheduler設定UI/API — production完了
11. Task190D: Repair作業時間 read-only preview — production完了
12. Task190E: Repair.estimatedWorkMinutesへの安全なpreview → apply接続 — production完了
13. Task191A: 発注リードタイム・作業中断 schema foundation — production完了

## 直近完了Task

### Task191A: 発注リードタイム・作業中断 schema foundation

- commit: `b09fc122b89690474239d0b997b2fcd9222e69aa`
- Supplier側処理日数を `SupplierLeadTimeSetting` へ分離。
- 調達配送方法と輸送日数を `ProcurementShippingMethod` へ分離。
- `OrderRequest` に配送方法参照と `expectedArrivalDate` を追加。
- `RepairPlanningState` に中断状態、理由、残作業時間、再開可能日、再確認日を追加。
- `RepairBlockReason` を構造化。
- `receivedAt` を実入荷日時の正本として維持。
- `partsReadyDate` は保存せず後続Taskで導出。
- 新3テーブルはserver-only、RLS有効、Data API向けGRANTなし。
- Production: complete

## 次に行うこと

- 次候補は Task191B「Supplier / ProcurementShippingMethod の設定操作」。
- Task191Aで確定した保存形を前提に、設定API/UIの最小境界を確定してから実装する。
- Supplier側処理日数と配送方法の輸送日数を混同しない。
- Cousins、DHL、国内郵便等の所要日数をコードやseedへ推測でハードコードしない。
- Task191C/Dで到着予定resolver、partsReadyDate、中断状態との業務連携を段階的に扱う。
- production migration / deployを伴う場合は引き続き高リスク工程として独立レビューとユーザー承認を必須とする。
- 既存 `docs/ai/02_PRODUCT_ROADMAP.md` の未commit差分（+271 / -57）はTask外として保護し、混ぜない。
- 次Taskはユーザー承認なしに実装開始しない。
