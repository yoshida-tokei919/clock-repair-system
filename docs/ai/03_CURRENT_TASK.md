# CURRENT TASK

## 現在のcheckpoint — 2026-09-25

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `476b39be1a68d3c7d6ba58dfdd6796203c4682c6`
- Commit subject: `fix: allow safe preapproval part orders`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `6c94951b-c890-4ec3-b77b-d4759506d487`
- Deployment status: `SUCCESS`
- Production tag: `production-task180-181-20260925`
- Region: `sin`
- Task180 / Task181 rolloutにschema / migration変更なし
- Task180 / Task181 rolloutにproduction DB migrationなし
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - `/orders` = 200
  - unauthenticated `/api/repairs/1/line` = 401
- Task180 / Task181のwrite APIはproduction smokeで実データ変更を行っていない

Production: Task180 / Task181 complete

## 直近完了Task

### Task180: RepairEntry PartsMaster標準名連携と外装部品Refドリルダウン

- commit: `dde210118cf74c9e69eba4ef23a9f2f8c56c76ce`
- PartNameMaster（標準部品名）を新規PARTで必須化
- 外装部品はBrand + Product Ref / Case Refを主要条件として適合判定
- 内装部品はmovement maker + Cal / base maker + base Calを維持
- PartsMaster（実部品）のstandardPartNameId（標準部品名ID）とRef適合を保存APIでも検証
- schema / migration変更なし
- 詳細: `docs/ai-tasks/180-repair-part-master-linkage-and-ref-drilldown.md`

### Task181: 承認前の先行発注を許可し、在庫引当と分離

- commit: `476b39be1a68d3c7d6ba58dfdd6796203c4682c6`
- 承認前でも明示した不足部品のpending OrderRequest（発注依頼）を作成可能
- 発注依頼作成とRepairPartAllocation（案件部品引当）を分離
- 承認前の発注だけではstockQuantity（在庫数）・Repair.status（案件状態）を進めない
- pending数量は不足量の目標値として同期し、再送で加算しない
- ordered / received後の再送で二重pendingを作らない
- receivedは物理在庫へ反映済みとして二重計上しない
- received → assignedは承認前409を維持
- schema / migration変更なし
- 詳細: `docs/ai-tasks/181-preapproval-order-request.md`

Task180 + Task181 current HEADで自動確認:
- PartsMaster / allocation tests: 52 / 52 PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS

## 現在Task

実装Taskは現在未開始。
次の実装Taskは、`docs/ai/02_PRODUCT_ROADMAP.md` の **MVP Step 1: Schedule MVP 基盤**。

## 次の実装Task: Schedule MVP Step 1

目的:
- できるだけ早くスケジュール管理込みで実運用開始する
- 既存Repair資産を優先利用し、過剰な再設計を避ける

既存Repairで優先利用する項目:
- priorityScore（優先度）
- scheduledDate（予定日）
- estimatedWorkMinutes（想定作業時間）
- deliveryDateExpected（納品予定日）
- deliveryDateActual（実納品日）

Step 1では不足分だけを調査・設計し、必要なら最小限追加する。
候補は plannedShipDate（発送予定日）、自動再配置ロック、仮予定/確定予定など。
実装開始前にschema / 現行UI / 既存スケジュール関連実装を調査し、Task境界を確定する。

Schedule MVPの順序:
1. Step 1: Schedule MVP 基盤
2. Step 2: WorkCalendar MVP
3. Step 3: シンプル自動スケジューラー
4. Step 1〜3完了時点でスケジュール込み実運用開始

## 並行作業・Task境界

- マスタデータ投入・復旧は別Taskとして並行してよい
- Schedule MVPとマスタ投入の差分・commitを混ぜない
- Brand / BrandAlias production importは完了済み
- foundation master 6種のproduction importは完了済み
- Task180 / Task181はproduction反映済み
- 新しいschema / migration / RLS / GRANT変更が必要な場合は高リスク変更として独立レビューする

## 保留中

- Task172: Stripe production化
- LINE conversation後続Task（Repair summary / ongoing AI classification等）
- Shipment / ゆうプリR / LINE発送連携はSchedule MVP運用開始後のロードマップ順で進める
- QR / 事例公開等は当面Schedule MVPより後順位

## 次に行うこと

1. 新しい実装Task開始前に `git status` を確認する
2. `docs/ai/02_PRODUCT_ROADMAP.md` のStep 1を基準にSchedule MVP基盤を調査する
3. 既存Repair schema / UI / scheduling関連コードを確認する
4. 最小差分のTask境界を作る
5. Codex枠が利用可能ならCodexを実装担当にする
6. production migration / deploy / pushはユーザー明示承認なしに行わない

このdocs-maintenance自体はアプリ挙動・schema・production DBを変更しない。

Docs-maintenance Production: pending（docs-only。production applicationは引き続き `476b39b`）。
