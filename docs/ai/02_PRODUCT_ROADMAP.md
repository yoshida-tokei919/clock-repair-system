# PRODUCT ROADMAP

このファイルは、時計修理業務アプリ全体の現在地、全体方針、開発フェーズ、今後の開発順序を管理する正本文書である。

過去の変更履歴は残さない。現在有効な方針だけを書く。
個別Taskの詳細や一時的な調査内容は書かない。

## 全体目的

時計修理業務における以下を一つの業務アプリで管理する。

- 受付
- 見積
- 修理明細
- 内装作業
- 外装作業
- 内装部品
- 外装部品
- 部品検索
- 部品発注
- 在庫
- 案件識別と現場運用
- 帳票
- 顧客共有
- 作業可能判定
- 作業優先順位
- 作業スケジュール
- 事例公開

## Phase 1: 作業マスタ

### 目的

内装作業・外装作業を構造化して入力できるようにする。

### 対象

- RepairWorkCategory（作業カテゴリ）
- RepairWorkAction（処置マスタ）
- RepairWorkName（作業名マスタ）
- PricingRule（価格ルール）
- RepairLineItem（修理明細）

### 方針

- 内装と外装は分ける
- 内装/外装の処置を混在表示しない
- 部品マスタと作業マスタを混同しない
- PricingRule（価格ルール）は価格ルールとして残す
- 作業マスタは帳票・共有ページ・PublicCase（公開事例）へ直接表示しない
- 表示値はRepairLineItem（修理明細）側にsnapshot（保存時点表示値）を保持する

### 現在地

- 内装作業マスタは基本完了
- 外装作業マスタを進行中
- 外装LABOR（外装技術料）入力とPricingRule（価格ルール）接続を調整中
- 内外装の処置表示分離が現在の優先課題

### 完了条件

- 内装LABOR（内装技術料）を構造化入力できる
- 外装LABOR（外装技術料）を構造化入力できる
- external_labor（外装技術料）とpart_external（外装部品行）が分離されている
- business（B2B）/ individual（B2C）別にPricingRule（価格ルール）を保存・取得できる
- 内装/外装の処置候補が混在しない

## Phase 2: 部品マスタ・部品検索・発注連携

### 目的

内装部品・外装部品を検索、在庫、価格、発注に使える形へ整理する。

### 対象

- PartCategoryMaster（標準部品カテゴリ）
- PartNameMaster（標準部品名マスタ）
- PartsMaster（実部品・在庫マスタ）
- PartGradeMaster（部品グレード）
- Supplier（仕入先）
- OrderRequest（発注依頼）
- 部品検索ワード生成
- 複数サイト検索
- 通貨変換
- 価格クリック挿入

### 方針

- PartNameMaster（標準部品名マスタ）は対象部品名の標準マスタ
- PartsMaster（実部品・在庫マスタ）は実部品・在庫・価格・仕入先・写真・発注用
- 内装部品はmovementCaliber（ムーブメントCal）中心
- 外装部品はbrandId（ブランドID）/ modelId（モデルID）/ Ref（時計Ref）/ 部品Ref中心
- external_labor（外装技術料）ではPartsMaster（実部品・在庫マスタ）を使わない
- part_external（外装部品行）ではPartsMaster（実部品・在庫マスタ）を使う
- 検索ワード生成は時計部品検索の実務に合わせて調整する

### 作業順

1. 内装部品マスタ
2. 外装部品マスタ
3. 部品検索ワード生成修正
4. 複数サイト検索
5. 通貨変換
6. 検索結果の価格クリック挿入
7. 発注管理連携

### 完了条件

- 内装部品をCal中心に検索できる
- 外装部品をブランド/モデル/Ref/部品Ref中心に検索できる
- 複数サイト検索用の検索ワードが時計部品検索の実務に合う
- 検索結果の通貨を換算できる
- 部品価格をクリック操作で明細へ反映できる
- 発注が必要な部品を発注管理へ連携できる

## Phase 3: 現場運用・PhysicalTag / NFC・QR

### 目的

時計1本ごとの現物とアプリ上のRepair（修理案件）を、作業場のPCから高速かつ取り違えに強い形で対応付ける。
単なる案件遷移用QRではなく、受付・作業タイマー・納品書・Shipment・棚卸し等で共通利用できる「現物識別基盤」とする。

### 対象

- PhysicalTag（物理タグ）とRepairの割当履歴
- NFC UIDによる識別
- QR tokenによる識別
- 人間が読めるshortCode
- QR付き小型ラベル印刷
- NFCタグ / QRラベルの時計収納袋・トレーへの付与
- PC常設USB NFC / QRリーダー
- 案件詳細画面への遷移
- ScanSessionによる連続読み取り
- タイマー開始 / 切替
- 納品書対象の連続選択
- Shipment梱包対象の連続選択・確認
- 将来の現物所在確認 / 棚卸し

### 方針

- 主運用はNFC、QRはフォールバック、人間向けshortCodeを第3の識別手段とする
- NFC / QR / shortCodeは同じ論理PhysicalTagへ解決する
- タグには顧客名・電話番号等の個人情報を保存しない
- NFC UIDは検索キーとして扱い、認証情報・秘密鍵として扱わない
- QRには推測困難なtokenを使い、連番Repair IDを直接埋め込まない
- Repair情報の表示・更新には既存の管理画面認証を必須とする
- PhysicalTagとRepairの割当を分離し、タグを再利用可能にして履歴を残す
- 1 PhysicalTagにつきactiveな割当は最大1件、1 Repairにつきactiveな論理タグは原則1件とする
- タグは時計本体へ直接貼らず、収納袋・保管トレー等へ付ける
- 初期実装はブラウザWeb NFCへ依存せず、PC常設USBリーダーのkeyboard-wedge/HID入力を優先する
- 読み取りモードに応じて、案件表示・タイマー・一括選択・発送確認等へ同じscan基盤を再利用する
- 連続読取では重複scan抑止、未割当/無効タグ、別顧客混入等を明示する
- 納品書生成・Shipment確定・ステータス変更等の状態変更は、scanだけで即確定せず人間の確認操作を残す
- 詳細設計は `docs/ai-tasks/196-physical-tag-nfc-design.md` を参照する

### 作業順

1. 実機PoC（NFCタグ / USB NFCリーダー / QRリーダーの読み取り安定性）
2. PhysicalTag / PhysicalTagAssignmentの物理設計
3. NFC UID / QR token / shortCode解決API
4. タグ割当・解除・再利用
5. QR付き小型ラベル印刷
6. 共通scan receiver / ScanSession
7. 案件表示・タイマー開始/切替
8. 納品書・Shipment向け連続選択
9. 現物所在確認 / 棚卸しへの拡張

### 完了条件

- 時計現物のタグをNFCで読むと該当Repairへ到達できる
- QRとshortCodeでも同じPhysicalTag / Repairへ到達できる
- タグの再利用と過去の割当履歴を追跡できる
- 作業タイマー開始/切替を現物scanから行える
- 複数Repairを連続scanして納品書・Shipment対象へ安全に追加できる
- 別顧客混入、重複scan、未割当/無効タグを検知できる
- 管理画面の認証方針を壊さない

## Phase 4: 作業可能判定・優先順位・スケジュール

### 目的

現在の修理品の中から今作業できるものを自動で特定し、優先順位を決め、作業スケジュール案を作る。

### 対象

- Repair（修理案件）
- RepairLineItem（修理明細）
- OrderRequest（発注依頼）
- status（案件ステータス）
- scheduledDate（予定日）
- estimatedWorkMinutes（見積作業時間）
- priorityScore（優先度スコア）
- 今日の作業ボード

### 方針

- まず作業可能判定を作る
- 作業できない案件は停止理由を明示する
- 優先順位ロジックは時計修理実務に合わせてユーザーと設計する
- 優先順位の根拠を確認できるようにする
- 完全自動で作業順を確定せず、人間が最終判断できる設計にする
- 作業可能判定と優先順位が安定してから自動スケジュール案を作る

### 優先順位ロジックの設計候補

以下は未確定の検討対象であり、実装前に業務ルールを確定する。

- 納期
- 受付日
- 長期滞留期間
- 見積承認状態
- 必要部品の準備状態
- 発注待ち状態
- 作業中断案件の再開可否
- 想定作業時間
- B2B/B2C
- 取引先または顧客ごとの優先条件
- 同一工程をまとめて行う効率

### 作業順

1. 作業可能条件の業務定義
2. 作業停止理由の業務定義
3. 作業可能判定
4. 停止理由表示
5. 優先順位ロジック設計
6. 優先順位表示
7. 今日の作業ボード
8. 作業時間情報の設計
9. 自動スケジュール案作成

### 作業時間・スケジューラ精度向上の詳細設計

`estimatedWorkMinutes（推定作業時間）` の標準時間・実作業時間実績・複合作業補正・外装ブランドリスク係数・案件実績学習は `docs/ai-tasks/185-work-time-estimation-design.md` を参照する。

納期逆算、仕入先リードタイム、見積り/受付/問い合わせ等の業務時間、共通業務タイマー、複数日分割、作業中断/部品待ち、実効作業容量、および件数閾値・集計期間・標準時間・工程日数等を調整するスケジューラ専用設定画面は `docs/ai-tasks/186-scheduler-deadline-capacity-timer-design.md` を参照する。主要算出条件はコードへ固定せず、現在採用条件と根拠を確認できる設計を優先する。

### 完了条件

- 今作業できる案件が一覧で分かる
- 作業できない案件は理由が分かる
- 優先順位の根拠が分かる
- 今日やるべき作業候補を確認できる
- 現在の案件状態から作業スケジュール案を作れる

## Phase 5: 事例公開

### 目的

修理案件から公開事例を作成し、WEBサイトやInstagramへ活用できるようにする。

### 対象

- PublicCase（公開事例）
- WorkItem（公開作業項目）
- PartItem（公開部品項目）
- Image（公開画像）
- FMP過去修理データ
- WEB_APP案件
- WEB事例ページ
- Instagram投稿

### 方針

- 事例公開に合わせて業務アプリ設計を歪めない
- RepairLineItem（修理明細）の構造化データからPublicCase（公開事例）を作る
- B2BとB2Cで表示内容を分ける
- B2Cは価格非表示
- B2Bは条件を満たす場合のみ価格表示
- 公開前に人間が確認する

### 作業順

1. 現行RepairLineItem（修理明細）からPublicCase（公開事例）への接続確認
2. FMP過去修理データ移行資産の再確認
3. B2B/B2C表示分離確認
4. 投稿候補抽出
5. WEB事例出力
6. Instagram投稿用テキスト生成
7. 画像選定補助

### 完了条件

- 案件から公開事例を作れる
- FMP過去修理データを既存調査結果に沿って活用できる
- B2B/B2C表示ルールを守れる
- WEB事例とInstagram投稿に使える
- 公開前チェックができる

## 本格運用開始優先ロードマップ（2026-09-26）

### 方針変更

旧方針では、Schedule MVP完成時点で70〜80点の状態から実運用を開始し、運用後にScheduler精度・発送・LINE連携を追加する予定だった。

開発オーケストレーションが改善し、ChatGPT（カタリ）が要件整理・調査・Codex指示・独立レビューを担当し、Codexを実装担当として連続的に進められるようになったため、運用開始条件を引き上げる。

**本格Scheduler・発注/部品待ち連携・Shipment・ゆうプリR・LINE発送連携まで完成させてから本格運用を開始する。**

目標品質を上げても、1 Task = 1 commit、最小差分、独立レビュー、高リスク工程の承認ルールは維持する。
マスタデータ投入は別作業として並行継続してよい。schema / migration変更を伴うTaskとcommitを混ぜない。

### B2C優先 / B2B拡張方針

- 当面の本格運用開始対象はB2C（individual）を優先する
- B2Cの受付 → 見積り / 承認 → 修理 → 現物管理 → 発送までを一つの完成フローとして先に仕上げる
- B2B（business）はB2C完成後に現行業務を棚卸しし、B2Cとの差分だけを再評価して追加実装する
- B2B対応のために、現在のB2C開発を止めて受付・帳票・連絡フローを先行実装しない
- 一方で、Repair / RepairLineItem / PricingRule / WorkTimeSession / Scheduler / PhysicalTag / StorageLocation / Shipment等の共通基盤をB2C専用構造へ固定しない
- customerTypeの `individual` / `business` 区分を維持し、既存のB2B価格ルールや共通データを壊さない
- B2C固有のLINE Inquiry起点と、B2Bで想定される取引先からの複数本一括受付は入口が異なるものとして扱う
- B2B実装時は、取引先単位 / 受付バッチ / 取引先側管理番号 / 複数Repairのまとめ見積り・納品・発送等が本当に必要かを実運用ベースで取捨選択する
- B2B専用機能は必要性確認前にTask化・schema化せず、既存共通基盤で代替できるものを先に除外する
- B2B対応は現時点のB2C本格運用開始条件には含めない

### 現在地

以下のSchedule MVPはproduction完了済みであり、本格Schedulerの土台として維持する。

1. Task182: Schedule MVP基盤 — production完了
2. Task183: WorkCalendar MVP — production完了
3. Task184: シンプル自動スケジューラー — production完了
4. Task185 / 186: 作業時間推定・納期/容量/タイマー設計 — docs-only完了
5. Task187: 実装前調査・Task分割 — docs-only完了

現行Task184の自動スケジューラーは後続実装中も互換機能として維持する。
Task188以降で本格Schedulerへ段階的に拡張し、既存機能を一度に置き換えない。

### Stage A: 本格Scheduler

#### Task188: WorkTimeSession（作業時間セッション）基盤

- 修理・問い合わせ・見積・発注等の実作業時間を開始/終了区間として保存する
- 同時active sessionは1件に制限する
- RepairLineItem.idへ強く依存せず、計測開始時点の条件snapshotを保持する
- 秒精度で保存し、集計・スケジューラ利用時は分単位で扱う

#### Task189: 共通業務タイマーUI

- Repair（修理案件）
- Inquiry（問い合わせ）
- OrderRequest（発注依頼）
- 見積・事務等の共通業務

を同じタイマー基盤で計測できるようにする。

#### Task190: Scheduler設定・標準作業時間・実績学習

Task187追補のSchedulerSetting（スケジューラ設定）レイヤーを前提に物理設計を確定してから実装する。

設定対象には少なくとも以下を含む。

- 実績採用の件数閾値
- 平均 / 中央値 / P80等の集計方法
- 直近3ヶ月 / 6ヶ月等の集計期間
- 時計機能別・作業別の標準作業時間
- ランニングテスト日数
- 再調整・発送バッファ
- 見積り調査中の再確認を促す日数
- 見積り調査中の返却 / 継続判断を促す日数
- 問い合わせ等の予約容量
- Supplier（仕入先）リードタイム採用条件
- 取引先優先度
- 分割配置・中断・再計算ルール
- 現在採用中の算出条件と根拠表示
- 設定変更時のpreview → apply

実績0件では一般標準、少数実績では中央値、十分な実績件数では設定された集計方法を使用する方向を基本とする。

見積り調査中の日数設定は警告・判断促進に使用し、自動で返却確定しない。
返却判断日数へ到達した場合は「調査継続 / 顧客へ途中連絡 / 見積り困難として返却」等の人間判断を促し、継続時は継続理由と次回確認日を記録できる方向とする。

#### 見積り・承認フロー追補

- 受付処理完了後、通常案件は「見積り待ち」へ進む
- 通常見積りで即時判断できない案件は「見積り調査中」として分離する
- 見積り提示済み案件は「承認待ち」とする
- 見積り調査中は調査開始日・次回確認日・継続理由を追跡できるようにする
- 「見積り不要」を単純なbooleanだけで表現せず、料金確定済み / 上限金額まで事前承認等の承認方式を扱える方向とする
- 上限金額まで事前承認された案件は上限以内なら承認待ちを経由せず作業へ進め、上限超過時は承認待ちへ戻す
- 電池交換等の定型作業でも、見積り不要を作業種別へ一律ハードコードせず案件ごとの承認条件を正本とする
- 見積り調査中の返却判断は自動確定せず、明確な理由がある長期調査を継続できるようにする

#### Task191: 発注リードタイム・部品待ち・作業中断

既存 Supplier（仕入先）、OrderRequest（発注依頼）、orderedAt（発注日時）、receivedAt（入荷日時）、RepairPartAllocation（部品割当）を接続する。

- expectedArrivalDate（入荷予定日。OrderRequestに保存）
- receivedAt（実入荷日時の正本。actualArrivalDateは新設しない）
- partsReadyDate（OrderRequest + RepairPartAllocationから導出し、保存列は作らない）
- blocked（中断状態）
- blockReason（中断理由）
- remainingWorkMinutes（残作業時間）
- resumeEligibleDate（再開可能日）
- reviewDate（再確認日）

を扱い、部品が揃う前の案件を作業予定へ入れない。

Supplier（仕入先）の処理日数とProcurementShippingMethod（調達配送方法）の輸送日数は分離し、固定値のハードコードを避ける。

#### Task192: 納期逆算・実効容量 read-only preview

以下を組み合わせ、予定をまだ書き換えないread-only previewを先に作る。

- WorkCalendar（稼働カレンダー）
- 推定作業時間
- 部品入荷予定
- 工程リードタイム
- ランニングテスト
- 発送バッファ
- 既存予定
- 仮予定 / 確定予定
- 手動ロック
- 現在の混雑

見積時の顧客提示納期にも再利用できる計算基盤を作る。

#### Task193: 分割スケジュール基盤 + Scheduler v2

RepairScheduleSegment（予定明細・仮称）等を使い、1案件を複数日へ分割できるようにする。

- 複数日分割
- 中断 → 再開
- 残作業時間
- 日別容量
- 優先順位
- 納期逆算
- 自動再計算
- schedule lock（予定固定）
- preview → 人間確認 → apply
- revision不一致時の競合防止

既存 scheduledDate（予定日）は互換summaryとして残し、予定明細を正本とする方向で実装する。

#### Task194: 「今日の作業」画面

/repairs/today 等の独立画面で、今日実行すべき作業を集約する。

- 今日の予定
- 優先順位と根拠
- 使用予定時間 / 残容量
- 中断案件
- 再開可能案件
- 部品待ち
- 遅延見込み
- タイマー開始導線

既存Kanbanとは役割を分ける。

#### Task195: 実績フィードバック基盤

実績を将来案件の算出へ戻す。

- 実作業時間 → 推定作業時間
- 実到着日 → Supplier / ShippingMethodリードタイム
- 実績作業量 → 実効作業容量
- 遅延実績 → 納期・安全バッファ
- 見積り等の共通業務実績 → 予約容量

本格運用開始前に学習基盤まで実装するが、十分な件数が必要な統計精度向上そのものは運用後も継続する。

### Stage B: PhysicalTag・NFC / QR現物連携

詳細要件は `docs/ai-tasks/196-physical-tag-nfc-design.md` を参照し、実装前に実機PoCと現行schemaを再照合する。

#### Task196: PhysicalTag / NFC・QR基盤

- PhysicalTagとRepairのactive割当・履歴を分離する
- NFC UID / QR token / shortCodeを同じPhysicalTagへ解決する
- タグを再利用でき、交換・解除履歴を残せるようにする
- QR付き小型ラベルを収納袋・トレーへ付与する
- タグ上へ個人情報や推測可能なRepair IDを直接保存しない
- 初期構成はPC常設USBリーダーを前提とし、ブラウザWeb NFCへ依存しない
- schema / migration / RLS / GRANT変更は高リスク変更として独立レビューする

#### Task197: ScanSession・連続読取業務連携

- USB NFC / QRリーダーのkeyboard-wedge/HID入力を共通scan receiverで受ける
- 通常scanはRepair表示へ接続する
- scanからWorkTimeSessionの開始 / 切替へ接続する
- 複数Repairの連続scanで納品書対象を選択できる
- Shipment向けの複数Repair selectionを後続Taskへ渡せる共通契約を作る
- 実Shipment作成・梱包照合はTask199以降で接続する
- 重複scan、未割当/無効タグ、別顧客混入を検知する
- 状態変更はscanだけで即確定せず、確認操作を残す
- 将来の現物所在確認 / 棚卸しへ拡張可能にする

#### Task198: StorageLocation・現物保管場所管理

案件ステータス / 作業状態と、時計現物の実際の保管場所を分離して管理する。

初期の物理ゾーン表記は日本語を正本とし、少なくとも以下を想定する。

- 受付処理待ち
- 見積り待ち
- 見積り調査中
- 承認待ち
- 部品待ち
- 作業待ち
- ランニングテスト中
- 発送・引渡し待ち
- 要確認

方針:

- 「箱が案件ステータスを表す」運用から、「アプリが案件状態を管理し、箱は現物を効率よく置く場所」として使う運用へ移行する
- 受付処理待ち / 見積り待ち / 見積り調査中 / 承認待ちは、件数が増えた際に現物探索を発生させないため物理的にも分離する
- 見積り不要・料金確定済み・上限金額まで事前承認済みの案件は、不要な見積り待ち / 承認待ちを経由しない
- StorageLocationは案件ステータス、RepairWorkPlan、PhysicalTagとは独立して保持する
- ケース / 棚にもNFCまたはQR等のscan識別子を持たせ、移動先をscanして複数時計を連続移動できる方向とする
- 現在の案件状態から推奨 / 許容保管ゾーンを導出し、実際の保管場所と不一致なら移動を促す
- 不一致は自動移動せず、現物移動後にscanまたは確認操作で記録する
- 現在地だけでなく移動履歴を追跡できるようにする
- 「要確認」はタグ不良、案件情報との不一致、置き場所判断不能等の例外退避先として扱う
- 今日の作業、見積り、部品待ち、ランニングテスト、Shipmentと連携できる設計とする

### Stage C: Shipment・郵送・LINE連携

詳細設計はNotion「発送管理・自動スケジュール・発注連携 設計方針（2026-09-25）」を正本候補として参照し、実装前に現行schemaと再照合する。

#### Task199: Shipment（発送）基盤

Repair（修理案件）とShipment（発送1個口）を分離する。

- Repair ↔ Shipmentは多対多を前提とする
- 1個口に複数Repair
- 1Repairを複数個口
- carrier（配送会社）
- handoffMethod（集荷 / 郵便窓口持込等）
- plannedShipDate（発送予定日）
- actualShippedAt（実発送日時）
- trackingNumber（追跡番号）
- ShipmentStatus（発送ステータス）
- 配送会社非依存のRepairStatus
- Task197のScanSession / SHIPMENT_SELECTから複数RepairをShipment作成へ取り込める
- 宛先、配達希望日時、荷物情報等は配送会社へ渡す前の共通発送データとして保持する
- 日本郵便 / ヤマト運輸等のCSV・API固有項目はadapter層で変換し、Shipment正本を特定配送会社のフォーマットへ固定しない
- 配送会社固有の送り状発行結果・追跡イベントを共通ShipmentStatusへ正規化できる境界を設ける

Shipmentには将来の入庫郵送へ拡張可能な direction（配送方向）を持たせる方向を優先する。

- INBOUND（顧客 → 工房）
- OUTBOUND（工房 → 顧客）

初期自動化対象はOUTBOUND（返送）を優先し、INBOUND（入庫）はschema上の拡張余地を確保する。

#### Task200: 発送スケジュール

plannedShipDate（発送予定日）を基準に発送予定を一覧化する。

- 今日
- 明日
- 今週
- 来週
- 遅延
- 作業完了
- ランニングテスト完了
- 納品書発行状態
- 配達希望日時
- 送り状発行状態
- 集荷 / 窓口持込
- B2B / B2C
- 配送会社
- 同一顧客の近接発送予定
- PhysicalTagの連続scanによる梱包内容照合
- 発送前の再利用PhysicalTag release確認

同一顧客の複数Repairを自動で勝手に統合せず、まとめ発送候補を提示して人間がShipmentを確定する。

#### Task201: ゆうプリR CSV出力（配送会社adapter第1実装）

Task199の共通Shipmentデータを、既存PoCで確認済みの標準フォーマットV3へ変換し、アプリからゆうプリRへCSV出力する。
日本郵便固有の列・コード・validationはadapter内へ閉じ込め、Shipment正本へ持ち込まない。

- お客様側管理番号
- 宛先情報
- 配達希望日
- 配達希望時間帯
- その他送り状作成に必要な項目

Windows workerによる完全自動化は必須条件にせず、まずCSVベースの安定運用を完成させる。

#### Task201B: ヤマトB2クラウド CSV出力adapter

Task199の共通ShipmentデータをヤマトB2クラウド取込用CSVへ変換できるようにする。

- Shipment / Repair側へヤマト専用schemaを作らず、Task201と同じ共通発送データから変換する
- 初期実装はB2クラウドのCSV取込を優先し、公式B2クラウドAPIの導入を必須にしない
- B2クラウド固有の列・コード・validationはヤマトadapter内へ閉じ込める
- 将来B2クラウドAPIを採用する場合も、Shipment共通契約を維持したままCSV adapterをAPI adapterへ差し替えられる構造とする
- 佐川急便等を追加する場合も同じadapter境界を再利用できるようにする

Task201Bはヤマト利用開始時に独立Taskとして実装し、Task201のゆうプリR安定運用を壊さない。

#### Task202: 追跡番号回収・日本郵便配送状態同期

Task202A〜Cで、ゆうプリR発送履歴CSVのread-only解析、公式配達ステータス正規化候補、Shipment同期候補previewまではproduction実装済みとする。

ただし、日常運用で発送履歴CSVを何度も手動出力・再取込する方式は採用しない。

配送状態の主経路は以下へ変更する。

```text
Shipment.trackingNumber
↓
日本郵便 Web追跡
↓
引受 / 輸送中 / 持出中 / 配達完了 / 例外
↓
ShipmentStatusへ正規化
```

- 送り状印刷だけでは発送済みにしない
- 日本郵便の「引受」を実発送イベントとして扱う方針を維持する
- 発送履歴CSV parser / previewはfallback・検証資産として残す
- 配送状態監視のために人間が発送履歴CSVを繰り返し取得する運用は作らない
- `trackingNumber`取得後は日本郵便Web追跡を定期確認する
- Web追跡取得はOpenClaw必須依存にせず、業務アプリ側の定期worker / fetcherを第一候補とする
- tracking保存、Shipment状態更新、通知、Repair納品完了は冪等性・監査・再実行安全性を持たせる

現在の最大課題は、配送状態そのものより**送り状発行時に採番されたtrackingNumberをShipmentへ自動で戻すこと**である。

#### ゆうプリクラウド移行候補

Windows版ゆうプリRのGUI自動化は2026-10-06実機PoCで安定運用できなかったため、本命にしない。
今後はブラウザ型の**ゆうプリクラウド**を第一候補として検証する。

目標フロー:

```text
Shipment
↓
ゆうプリクラウド用CSV
↓
カタリ + Playwright
↓
CSV upload
↓
送り状PDF発行 / download
↓
指定A4プリンタへ固定印刷
↓
SHP-{Shipment.id}で照合
↓
trackingNumber取得
↓
Shipmentへ保存
↓
日本郵便Web追跡で配送状態同期
```

方針:

- 現行ゆうプリR V3 adapterはfallbackとして維持する
- ゆうプリクラウド固有CSVは新しいadapter境界へ閉じ込める
- `SHP-{Shipment.id}` をお客様側管理番号として維持できるかPoCで確認する
- PlaywrightはDOM操作可能なブラウザ業務に限定して使い、Windows GUI座標クリックへ戻さない
- PDF取得後はPlaywrightで印刷ダイアログを操作せず、ローカル固定印刷処理から指定プリンタへ送る
- 専用サーマルプリンタ購入は前提にせず、既存A4レーザープリンタ + クラウド対応送り状シートを第一候補とする
- ラベル品番、注文方法、費用、料金後納契約/運賃条件、login/session/MFAは実サービスPoCで確認する
- 発行後のtrackingNumberをDOMまたは公式出力データから機械取得できるかを確認する

R-PS連携は有料fallback候補、ゆうパックプリントSkyは現事業規模では優先度を下げる。

#### Task203: LINE作業完了連絡・配達希望日時

RepairStatusが作業完了になった瞬間には自動送信しない。
任意の「作業完了をLINE連絡」操作を明示トリガーとし、既存Outbox → Windows sender → lineoa → CONFIRMED基盤を使う。

顧客へ以下を案内する。

- 修理作業完了
- 発送準備へ入ること
- 希望配達日時の確認

配達希望は「希望なし / 日付希望 / 時間帯希望」を扱い、「希望なし」も選択画面で明示確定する。

同一顧客に複数Repairがある場合は**原則まとめて発送**とし、配達希望日時もShipment単位で1回取得する。
分割発送は例外操作として明示的に分ける。

作業完了LINE → 顧客の配達希望日時回答までの本番E2E確認済みのフローを維持し、Shipment作成・送り状発行へ接続する。

- completionNoticeSentAt（作業完了連絡送信日時）
- requestedDeliveryDate（希望配達日）
- requestedDeliveryTimeSlot（希望時間帯）

はRepairStatusとは分離して管理する。

#### Task204: 発送・配達自動連携

配送会社の「引受」を検知した時点で、

- Shipmentを実発送状態へ更新
- actualShippedAt（実発送日時）を保存
- Repairを発送済みへ更新
- 追跡番号付きLINE発送通知を送信

する。

shippingNoticeSentAt（発送連絡送信日時）等で二重送信を防止する。

1Repairが複数Shipmentに紐づく場合、関連Shipmentすべてが配達完了した場合のみRepairを納品済みにする。

### Stage D: Customer Communication Hub・B2B受付・運用自動化

B2C/B2Bの顧客コミュニケーションを別々の会話システムに分けず、Customerを中心とした共通Hubとして扱う。
業務データの正本は時計修理業務アプリに置き、OpenClaw等のAIエージェントへCustomer / Repair / Inquiryの別台帳を作らない。

#### Customer Communication Hub / Task206系

現在有効な共通方針:

- LINE原文の正本は `InquiryMessage`
- Customerに紐づくLineUser配下の複数Inquiryを横断表示する
- CLOSED Inquiryも履歴から消さない
- 案件化後に別Inquiryへ入った新着もCustomer全体履歴へ含める
- Repair画面はCustomer Hubのprojectionとし、そのRepairに関連する会話だけを表示する
- 1メッセージを複数Repairへ関連付けられる
- Repair未割当、新規相談、再修理、請求・一般連絡をCustomer全体履歴から消さない
- B2C/B2Bで別LINE ID基盤を作らず、共通 `LineUser` / verified `LineManagerChat` を使う
- 将来GmailをB2B向けchannelとして同じCustomer Communication Hubへ追加する

Task206A〜Eで、共通Hub設計、Customer単位read、post-intake関連付け、Repair projection、Customer単位LINE返信まで進めた構成を維持する。

LINE通常トーク送信は以下の既存基盤を正本とする。

```text
Customer / Inquiry / Repair
↓
APPROVED LineManagerSendOutbox
↓
Windows sender
↓
lineoa
↓
LINE Official Account Manager
↓
reconciliation
↓
CONFIRMED
↓
OUTBOUND InquiryMessage確定
```

- Next.jsからLINEへ直接POSTしない
- `APPROVED`を送信済みと扱わない
- 実送信成功は`CONFIRMED`だけ
- `POST_UNCONFIRMED`を盲目的に再送しない
- Messaging API Push 200通/月を通常運用で消費しない方針を維持する
- LineManagerChat verificationはManager inbound message.idと`InquiryMessage.externalMessageId`の完全一致だけをidentity evidenceとして使い、表示名/本文/時刻による曖昧matchingを行わない

#### Task206F / 206G

- Task206F: Gmail channel foundation。B2B向けにCustomer / Repair単位Hubへ追加する
- Task206G: AI post-intake classification、Repair要約、未対応事項、顧客指定、決定事項、返信案を整備する
- 人間が確定した分類・Repair関連付けをAIが上書きしない

#### Task206H1 / H2 / H3

- **H1 reply bridgeは残す**。`context / approve / status`の3操作でstale送信、二重送信、APPROVEDとCONFIRMEDの混同を防ぐ
- H2 Personal Plugin / remote MCP / Supabase OAuth 2.1 / Auth Hook案は本番化せず保留する
- **Task206H3としてOpenClaw local agent integration PoCを優先する**

OpenClawの役割:

```text
時計修理業務アプリ
= Customer / Repair / Inquiry / Shipment等の正本

OpenClaw
= LINE / Gmail / 通知 / AI判断 / 操作オーケストレーション

n8n
= Webhook / 定期処理 / 機械的配管

カタリ + Playwright
= ゆうプリクラウド等の決定的なブラウザ自動操作
```

OpenClawはローカルWindows PC常駐を第一候補とし、Customer Communication HubのDBを置き換えない。
OpenClaw → H1で最新文脈取得、返信案提示、ヨシダの明示承認後だけapprove、最後にCONFIRMED確認まで行うPoCを先に実施する。

#### 1. B2B受付フローの完成

- 取引先起点で複数本をまとめて受け付けられるようにする
- 時計情報は既存Repairと同じマスタdrill-downを再利用し、自由入力と既存候補の絞り込みを両立する
- 依頼内容を受付時に入力できるようにする
- Cal / メーカー、base Cal / メーカーを扱えるようにする
- 新規入力値を次回候補へ再利用する場合も、既存マスタの正本性を壊さない方法で行う

#### 2. B2B一括PhysicalTag発行・ラベル連続印刷

- B2B一括受付で作成した複数RepairへPhysicalTagを安全に割り当てる
- Brother QL-800 + DK-2205を前提に、複数本の修理袋ラベルを連続印刷できるようにする
- 既存のb-PAC直接印刷基盤を再利用し、プリンター選択や印刷ダイアログ等の手数を減らす
- 一括処理でもRepair / PhysicalTag対応関係を明示し、誤印刷・取り違えを防止する

#### 3. Shipment / ゆうプリクラウド移行・残工程の仕上げ

- 既存のShipment、ゆうプリR fallback、ゆうプリクラウド、追跡番号、配達希望日時、LINE発送連絡を一つの運用フローとして仕上げる
- 同一顧客の複数Repairは原則まとめ発送とし、例外時だけ明示操作で分割発送できるようにする
- 郵便局へ引き渡した後の手作業を増やさず、可能な範囲で自動同期・自動通知を優先する
- CSVの再取得・再取込等を人間が何度も繰り返す運用は避ける

#### 4. OpenClawによるCustomer Communication Hub操作の省力化

- 現在残っている「Slack通知を確認 → ChatGPTを開く → カタリへ処理依頼」の手動一手を減らす
- OpenClawをCustomer Communication Hubの正本にはせず、業務アプリ/H1を操作するローカルAIエージェントとして使う
- LINE受信webhook、Slack、n8nからOpenClawを起動し、Customer履歴取得、Repair文脈整理、返信案準備までを省力化する
- LINE実送信はヨシダの明示承認後のみH1 `approve`を実行する
- H1のsecretをLLM prompt / memory / logへ露出させない
- `CONFIRMED`までstatus確認し、APPROVEDだけで送信済みと報告しない
- PoC成功後にH2 Personal Plugin / OAuth案を正式に廃止するか判断する

#### ハードウェアfollow-up

- R65 NFCリーダーは到着済みで、USB変換アダプター経由のPC接続とHID UID読取まで確認済み
- 今後はPC据置運用でScanSessionとの実業務接続を確認する
- NFCはQR / shortCodeの既存運用を壊さず追加し、NFC実運用確認を理由にB2B受付・発送の進行を止めない

#### ドキュメント運用

- 取扱説明書は実装に追従して継続更新する
- 原本をGit管理し、必要に応じてDOCX / PDFへ出力できる状態を維持する

### 本格運用開始条件

本格運用開始前に、少なくとも以下が一つの業務フローとして接続されていることを目標とする。

- WorkCalendar（稼働カレンダー）
- WorkTimeSession（実作業時間）
- 共通業務タイマー
- 標準作業時間
- Scheduler設定
- 実績学習基盤
- 発注リードタイム
- 部品待ち
- 作業中断 / 再開
- 複数日分割
- Scheduler v2
- 今日の作業
- 納期逆算
- PhysicalTag（現物識別）
- NFC / QR / shortCodeによるRepair解決
- ScanSession（連続読取）
- scanからのタイマー開始 / 切替
- StorageLocation（現物保管場所）
- 案件状態と保管場所の不一致検知 / 移動促進
- 見積り待ち / 見積り調査中 / 承認待ちの物理分離
- 納品書・Shipment対象の連続選択
- plannedShipDate（発送予定日）
- Shipment（発送）
- 発送スケジュール
- 現行ゆうプリR V3 CSV fallback
- ゆうプリクラウド + Playwrightによる送り状PDF発行PoC
- 追跡番号のShipment自動回収
- 日本郵便Web追跡による引受・配送状態同期
- LINE作業完了連絡
- LINE発送通知
- 配達完了 → Repair納品済み

### 目標業務フロー

受付処理待ち → 現物受領 / PhysicalTag割当 → 見積り待ち → 必要時は見積り調査中 → 承認待ち（見積り不要 / 事前承認済みは省略）→ 部品待ち / 作業待ち → Scheduler v2 → NFC/QR scan → 今日の作業 / 実績計測 → ランニングテスト中 → 発送・引渡し待ち → 納品対象連続scan → plannedShipDate → Shipment / 梱包確認 → ゆうプリクラウド（fallback: ゆうプリR）→ trackingNumber自動回収 → 日本郵便Web追跡で引受検知 → 発送LINE → 配送追跡 → 配達完了 → Repair納品済み

### 実施順

Stage A〜Cの主要基盤はproduction実装済みのため、今後は残っている手作業削減とCommunication Hub完成を優先する。

1. **Task206H3 OpenClaw local agent integration PoC**
   - 既存OpenClaw環境確認
   - OpenClaw → H1 `context / approve / status`
   - secret非露出、明示承認、CONFIRMED確認
2. **ゆうプリクラウド実サービスPoC**
   - 利用条件 / ラベル / 既存A4プリンタ確認
   - 手動でCSV登録 → PDF発行 → 印刷 → tracking確認を1件通す
3. **ゆうプリクラウドadapter + Playwright PoC**
   - Shipment → クラウド用CSV
   - upload → PDF download → `SHP-{id}`照合 → tracking取得
   - PDF指定プリンタ固定印刷
4. **trackingNumber保存 + 日本郵便Web追跡同期**
   - trackingNumberをShipmentへ安全に保存
   - 引受 / 輸送中 / 持出中 / 配達完了 / 例外を定期同期
5. **Task204 発送・配達自動連携の完成**
   - 引受時actualShippedAt / Repair発送済み / LINE発送通知
   - 配達完了時Repair納品済み
6. **Task206F Gmail channel foundation**
7. **Task206G AI post-intake classification / summaries**
8. B2B受付・一括PhysicalTag / ラベル連続印刷等の残工程を、実運用上必要な差分だけ仕上げる
9. 本格運用開始後、Scheduler・納期・リードタイム・Communication Hubの精度を運用実績で改善する
10. 事例公開・その他未完機能

Task番号・境界は各Task実装前の調査で必要に応じて再分割してよい。
schema / migration / RLS / GRANT / LINE自動送信 / production DBを伴う高リスクTaskでは、実装担当と独立レビュー担当を分離し、本番変更前にユーザー承認を必須とする。

## 常時守る全体方針

- 現在Task対象外を変更しない
- 帳票/PDF/LINE/共有ページ/PublicCase（公開事例）は対象Taskでない限り触らない
- 内装/外装を混ぜない
- 作業マスタと部品マスタを混同しない
- RepairWorkAction（処置マスタ）を推測で追加しない
- RepairWorkCategory（作業カテゴリ）を推測で追加しない
- customerType（顧客区分）はbusiness（B2B）またはindividual（B2C）のみ
- customerType=nullの新規データを作らない
