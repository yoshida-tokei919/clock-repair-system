# Task187: 作業時間・納期逆算・業務タイマー・分割スケジュール実装前調査

## 目的

Task185 / Task186 の設計を実装へ進める前に、既存schema・スケジューラ・案件画面・発注/部品待ちフローとの接続を確認し、必要な新規モデルと安全なTask分割を確定する。

このTaskは investigation-only / docs-only。schema / migration / API / UI / DB変更は行わない。

## 調査時点

- branch: `main`
- working tree: clean
- `origin/main` より3 commits ahead
- latest local commit: `53b1b39 docs: design scheduler capacity and timers`
- Production application commit: `1b66b0bef90aceb4e8935246797acf094145ecf7`
- Production tag: `production-task184-20260925`
- Task184 シンプル自動スケジューラーMVP production完了
- Task185 / 186 は docs-only、未push

## 主な結論

現行構造へTask185 / 186の方針は接続可能。ただし以下は現行schemaだけでは表現できない。

1. 修理を複数日へ分割した予定
2. 共通業務タイマーの開始・終了履歴
3. 作業中断・残作業時間・再開可能日の状態

## Repair / 現行スケジュール

Repair（修理案件）には既に以下がある。

- `priorityScore（優先度スコア）`
- `scheduledDate（予定日）`
- `estimatedWorkMinutes（推定作業時間）`
- `scheduleLocked（予定固定）`
- `deliveryDateExpected（納品予定日）`
- `deliveryDateActual（実納品日）`

Task184の自動配置対象は `status=作業待ち`、未ロック、`estimatedWorkMinutes > 0`。
並び順は priorityScore → 納品予定日 → 受付日 → ID。

現行は1案件の全作業時間が1日の残容量へ収まる日を探す方式で、1日に収まらない案件を複数日へ分割しない。

### 判断

`scheduledDate` は互換用・代表日として残せるが、複数日予定の正本にはできない。
分割予定には新しい予定明細モデルが必要。

## WorkCalendar

- 標準作業可能時間は480分/日。
- DBには例外日のみ保存する。
- 現行ロジックは曜日で土日を自動休業扱いしない。
- 休み・半日・私用等はWorkCalendar例外として人間が設定する。
- ランニングテスト等の暦日制約とWorkCalendarの作業可能時間は別概念として扱える。

## Cal / 時計情報 / 作業明細

Prisma上に MovementCaliber / BaseMovementCaliber という別modelはなく、単一の `Caliber` をRepairの `movementCaliberId` / `baseMovementCaliberId` が参照する。

Caliberには既存の `movementType` と `standardWorkMinutes` があるが、Task185で必要な一般条件別標準時間とは役割が異なる。
Watchには `driveType = QUARTZ / MECHANICAL / UNKNOWN` がある。

Task185で想定するデイト、デイデイト、クロノグラフ、ツインバレル等の `additionalFunctions（追加機能）` を汎用的に保持する現行構造はない。

Brand / Model / WatchReference / Watch の既存関係から、外装実績の Ref → Model → Brand の優先検索は実装可能。
Brandには `exteriorWorkRiskFactor（外装作業リスク係数）` はまだない。

RepairLineItem（修理明細）にはカテゴリ、処置、対象部品名、detail、snapshotがあるが、`repairWorkNameId` を直接保持していない。
さらにRepairLineItemはreplace時に deleteMany → createMany され、IDが再採番される。

### 判断

WorkTimeSession（作業時間セッション）や実績履歴を RepairLineItem.id へ強く依存させない。
計測開始時点の作業条件をsnapshotとして保持する設計が安全。

既存 `Caliber.standardWorkMinutes（Cal別標準作業時間）` は一般条件の標準時間マスタそのものにはしない。ただし、Cal別実績がない間は一般条件から算出した初期値、実績蓄積後は件数閾値・集計方法に従う現在採用値を保持する用途として再利用できる可能性があるため、Task190の物理設計で再検討する。

## OrderRequest / Supplier / 中断

OrderRequest（発注依頼）には `supplierId`、`orderedAt`、`receivedAt` があり、実リードタイム実績は算出可能。
現状は `plannedOrderDate`、`expectedArrivalDate`、Supplier標準リードタイムを持たない。

部品待ちステータスは単なる表示値ではなく、OrderRequestとRepairPartAllocation（部品割当）の状態からreconcileされる。

### 判断

作業中断をRepair.statusだけで表現しない。
Repair.statusは既存の部品・承認・進捗フローを維持し、別の作業計画状態で以下を保持する方向が安全。

- blocked / 中断中
- blockReason（中断理由）
- remainingWorkMinutes（残作業時間）
- resumeEligibleDate（再開可能日）
- reviewDate（再確認日）

## WorkTimeSession

新規モデルが適切。

- `activityType（業務区分）`
- Repair / Inquiry / OrderRequest等の関連先
- 主作業・条件snapshot
- `startedAt（開始日時）`
- `endedAt（終了日時）`
- 手動修正有無・理由
- 誤計測の無効化状態・理由

保存は秒精度、集計・スケジューラ利用時は分単位。
同時active sessionは常に1件とし、UIだけでなくDB/API側でも競合を防ぐ。

## 分割予定 / 今日の作業UI

複数日分割には RepairScheduleSegment（仮称）のような予定明細を追加する方向。

最低限の候補:
- repairId
- workDate
- plannedMinutes
- 自動 / 手動の由来
- 順番

既存 `scheduledDate` は当面、未完了の最初の予定日等を示す互換summaryとして維持する。

今日の作業画面は既存Kanbanとは役割が異なるため、`/repairs/today` の独立画面が適切。
案件詳細には既存タブ構造へ「作業時間」を追加できるが、約4200行のRepairEntryFormへロジックを直書きせず独立component化する。

## Data API / RLS / GRANT

現在のWorkCalendar・自動スケジューラー・個別スケジュールはNext.js server API → Prisma → PostgreSQLで動作し、Data APIを使わない。
WorkCalendarもserver-onlyとしてRLS有効 + anon/authenticated/service_roleへREVOKE ALL。

WorkTimeSession、作業計画、分割予定、標準時間マスタも原則server-onlyとし、Data API公開不要・GRANT不要の方向。
新規テーブルを作るTaskではmigration / RLS / GRANTを高リスク変更として実装担当と独立レビュー担当を分離する。

## 実装Task分割案

1. Task188: WorkTimeSession基盤
2. Task189: 共通業務タイマーUI
3. Task190: 作業時間標準・実績学習
4. Task191: 発注リードタイム・作業中断基盤
5. Task192: 納期逆算・実効容量 read-only preview
6. Task193: 分割スケジュール基盤 + Scheduler v2
7. Task194: 「今日の作業」画面
8. Task195: 実績による容量・見積り・リードタイム改善

次Taskはユーザー承認なしに開始しない。

## Production

Production: pending。investigation-only / docs-onlyのためapplication deploy対象外。
コード・schema・migration・DB・production変更なし。


## 2026-09-26 設計追補: スケジューラ設定レイヤー

Task185 / 186の算出条件は、実情に合わせて継続調整できる専用設定画面を持つ方向へ更新された。

設定対象には以下を含む。
- 実績採用の件数閾値
- 平均 / 中央値 / P80等の集計方法
- 直近3ヶ月 / 6ヶ月等の集計期間
- 時計機能別・作業別の標準作業時間
- 納期・ランニングテスト・再調整・発送バッファ
- 問い合わせ等の予約容量
- Supplier（仕入先）リードタイム採用条件
- 取引先優先度
- 分割配置・中断・再計算ルール
- 現在の算出条件表示
- 将来の設定変更前preview

修理時間の初期ルールは、実績0件=一般標準、1〜9件=中央値、10件以上=平均値。見積りは100件未満20分、十分な件数蓄積後に直近3〜6ヶ月平均を採用する。

### 実装Task分割への影響

Task188 WorkTimeSession基盤 / Task189 共通タイマーUIは設定レイヤーへの依存が比較的小さいため、基本方針は維持可能。

一方、Task190以降はハードコードを避けるため再設計が必要。
特に以下を実装前に決める。
- SchedulerSetting（仮称）の単一設定モデルで持つ値
- 作業時間・工程・Supplier等、条件行が複数必要な設定を個別マスタへ分ける範囲
- 既存 WorkCalendar / Caliber.standardWorkMinutes / Supplier 等の既存列と新設定の正本関係
- 設定履歴 / updatedAt / 算出根拠のsnapshot要否
- 設定変更時に既存予定を即再配置せず、preview → apply とする境界

したがって、Task190「作業時間標準・実績学習」、Task191「発注リードタイム・中断」、Task192「納期逆算・実効容量」、Task193「Scheduler v2」は、この設定レイヤーを前提にTask境界とschemaを再確認してから実装する。
