# B2B E2E RUN LOG

## Purpose

このファイルは、B2B案件を実運用に近い形で「受付登録 → 案件化 → 見積 → 作業 → 納品 → 請求」まで通すE2E確認専用の引き継ぎログである。

通常TaskやB2C作業では読まない。B2B通しテストを継続するチャットでのみ追加読込する。

このファイルは `02_PRODUCT_ROADMAP.md` / `03_CURRENT_TASK.md` / `04_IMPLEMENTATION_RULES.md` の正本を置き換えない。実装Task化する内容は、必要に応じて別のTask docsへ切り出す。

## B2B通しテスト開始時の読込順

1. `AGENTS.md`
2. `docs/ai/04_IMPLEMENTATION_RULES.md`
3. `docs/ai/03_CURRENT_TASK.md`
4. `docs/ai/02_PRODUCT_ROADMAP.md`
5. `docs/ai/06_B2B_E2E_RUN_LOG.md` ← B2B通しテスト時のみ

## 進め方

- まず現行productionフローで実際に1件を通す。
- 途中で不足要件・使いにくさ・自動化漏れ・業務ルール差分を見つけたら、このファイルへ記録する。
- 通しテストを継続できる不足は、その場で大きく実装せず backlog として蓄積する。
- その不足が原因で先へ進めない場合だけ、独立Taskとしてその場で最小修正する。
- その場修正でも 1 Task = 1 commit、Task境界、独立レビュー、高リスク変更の承認ルールを守る。
- schema / migration / auth / 決済 / production DB / deploy / 破壊的操作は通常ルールどおり扱う。
- チャット内で確定したB2B運用判断は、会話だけに残さずこのファイルへ追記する。

## 現在のE2E目的

B2B案件を1件、以下の流れで実運用に近い形で通して確認する。

1. B2B受付登録
2. Repair / 時計情報登録
3. PhysicalTag / ラベル
4. 見積・承認
5. 作業・進捗
6. 納品書
7. Shipment / まとめ発送
8. 請求書
9. 入金確認（現時点では手動運用）

各工程で以下も確認する。

- 入力しにくい箇所
- B2B固有情報の不足
- 本来自動化できるのに手作業になっている箇所
- LINE / Gmail等の連絡経路
- 納品書・請求書の実務適合
- 複数店舗・まとめ発送・まとめ請求の扱い

## 確定したB2B運用判断

### 1. 複数店舗を持つ取引先

同一会社に複数店舗がある前提で扱う。

- Repairは実際の依頼元店舗へ紐づける。
- 会社ごとに、請求を集約する指定店舗を持てるようにする方向とする。
- 例: 神戸店・大阪店から修理依頼を受けても、本店へ請求を集約できる。

### 2. 請求集約は既存請求書を束ねる

新しい請求書生成フローを一から作り直すのではなく、既存の各店舗向け請求書を指定請求先へ集約するレイヤーを追加する方向とする。

- 元の請求書を削除しない。
- 元請求書と集約先請求の関係を追跡できるようにする。
- 将来「この店舗だけ個別請求」「この請求だけ集約対象外」等へ拡張できる構造を優先する。

### 3. 請求書の明細単位

請求書の明細は時計 / Repair単位ではなく **納品書単位** とする。

想定例:

- 神戸店 / 納品書 D-001 / 金額
- 神戸店 / 納品書 D-002 / 金額
- 大阪店 / 納品書 D-003 / 金額

時計単位の詳細は各納品書側で確認する。

### 4. 入金確認

現時点では銀行口座と業務アプリを連携しない。

- 入金確認は従来どおり手動で行う。
- 口座連携・自動消込は今回のB2B通しテストの必須要件にしない。
- 必要性が出た段階で別Taskとして検討する。

## 追加要件 backlog

| ID | 要件 | 状態 | 通しテスト阻害 | 備考 |
| --- | --- | --- | --- | --- |
| B2B-E2E-001 | 同一会社に複数店舗を登録・識別できる | production complete / Task207B | 解消済み | Repairは依頼元店舗へ紐づける |
| B2B-E2E-002 | 会社単位で請求集約先店舗を指定できる | production complete / Task207B | 解消済み | 指定請求先店舗 + standalone fallback |
| B2B-E2E-003 | 既存請求書を指定店舗へ集約できる | production complete / Task207C | 解消済み | 元請求書を保持したままbundle化 |
| B2B-E2E-004 | 集約請求の明細を納品書単位にする | production complete / Task207C | 解消済み | DeliveryNote単位snapshotを保持 |
| B2B-E2E-005 | 元請求書と集約先請求の紐付けを保持する | production complete / Task207C | 解消済み | 元Invoiceとのlinkを保持 |
| B2B-E2E-006 | 依頼書・時計画像からAI入力候補を作成し、確認後に案件化する | future / Task205E | いいえ | ScanSnap iX1300 + 既存Webカメラ。依頼書なしは従来入力。AIはOpenClaw + ChatGPT Plus枠 |
| B2B-E2E-007 | B2B取引先登録時のLINE紐付け導線を分かりやすくする | future UX | いいえ | 現行は相手から公式LINEへ1通受信 → /line-users で既存/新規Customerへ明示紐付け可能。手入力LINE ID欄は誤解を招く |

## その場修正記録

まだなし。

修正した場合は以下を残す。

- Task名 / Task番号
- 発見した問題
- なぜ通しテスト継続に必須だったか
- 変更ファイル
- commit
- 独立レビュー結果
- production反映有無
- E2E再開位置

## E2E進捗

### 2026-10-10

- B2B通しテスト開始を決定。
- 実案件を「登録から納品・請求まで」一度通す方針。
- 不足要件は原則このログへ蓄積し、進行不能のものだけ都度修正する。
- 最初の追加要件として、複数店舗の請求集約と納品書単位の請求明細を確定。
- 入金は当面手動確認のままとする。

### 現在の再開位置

**B2B受付登録の開始前。**

次は実際のB2B受付画面から1件登録し、現行フローを確認する。

## チャット切替時の運用

B2B通しテストを新しいチャットへ移す際は、引き継ぎプロンプトに必ず以下を入れる。

- repo: `C:\Users\yoshi\clock-repair-system`
- 通常の必須読込4点
- `docs/ai/06_B2B_E2E_RUN_LOG.md` をB2B E2E専用ログとして追加読込すること
- 現在のE2E再開位置
- 直前に見つかった不足要件
- 実装中TaskがあればそのTaskとGit状態

通しテスト中に重要な決定・追加要件・修正が発生したら、チャット終了前にこのファイルを更新する。

### 2026-10-13 — Task207A-C 先行実装・本番反映

B2B E2Eを開始する前に、既知の未実装分のうちメール以外を先行して実装した。

- Task207A — B2B納品書 `NEC MultiWriter 5750C` 固定印刷: production complete (`0802bd1`)。ローカルhelperは固定プリンタ指定、loopback/origin/PDF検証あり。実機の紙排出のみ実案件時に確認する。
- Task207B — 複数店舗 / 請求先基盤: production complete (`4ce5d27`)。同一会社の複数business Customer、指定請求先店舗、standalone fallbackを実装。
- Task207C — 既存請求書の集約: production complete (`cf991c0`)。元Invoiceを保持し、指定請求先へimmutableな集約bundleとして束ねる。DeliveryNote単位のsnapshot breakdownを保持する。
- Production backup: `C:\Users\yoshi\clock-repair-backups\task207abc-20261013T020650Z`。
- Supabase migration: `20261013021135 add_b2b_company_billing_foundation` / `20261013021204 add_consolidated_invoice`。
- Railway deployment: `db417b3b-2220-4a03-80b2-bf41d413cd54` — SUCCESS。
- Production smoke / security validation: PASS。新規5テーブルはserver-onlyでRLS有効、Data API rolesへ権限付与なし。
- 独立レビュー: 207B/Cともblocking findingなし。

Follow-up（通しテストblockerではない）:

- Customer typeを保存前に切り替えた瞬間だけcompany設定UI表示がpersisted typeとずれる場合がある。DB/APIはfail closed。
- 集約候補invoiceは現状300件、過去bundleは100件取得上限。規模拡大時はpaginationを別Task化する。
- 今回新規FKのcovering index候補はPerformance Advisor INFOとして残る。実データ量・query実績を見て別途判断する。

B2B E2Eの再開位置は引き続き **実案件のB2B受付登録開始前**。Task207A-Cは先行完了済みとして扱う。

### 2026-10-13 — Task207D-F 先行実装・本番反映

Task207A-Cに続き、メールを必要としないB2B月次請求・送付運用を先行してproductionへ反映した。

- Task207D — 月末締め / 翌月末支払期日: production complete (`d14b521`)。`billingMonth`を保存し、B2B支払期限を対象月の翌月末へサーバー計算する。schema / migrationなし。
- Task207E — 請求書LINE通常トーク / 郵送振り分け: production complete (`7715bec`)。旧Messaging API Push経路を請求書から外し、既存 `LineManagerSendOutbox -> Windows sender -> lineoa -> reconciliation -> CONFIRMED` へ統一。未確定Outbox中は請求書取消・PDF差替えをfail-closedで防止する。独立レビューの初回指摘2件を修正後、限定再レビューでblocking findingなし。
- Task207F — 郵送請求書 `NEC MultiWriter 5750C` 一括印刷: production complete (`cea7fcc`)。admin-only候補API、印刷直前再判定、順次投入、最初の失敗で停止、自動再試行なし。実プリンタの紙出力は未確認。
- Railway deployment: `13ab5c66-fbbc-4604-9c7a-2303e8de6326` — SUCCESS、region `sin`。
- Production build: Prisma Client generation、Next.js compile / lint / type validation、static generation 59/59 — PASS。
- Production smoke: `/`=200、`/login`=200、未認証 `/invoices`=307、`/api/invoices/postal-print-targets`=401、`/api/invoices/preview?...`=401 — PASS。
- Task207D-Fはschema / migration / env / production DB変更なし。追加backup不要。実LINE送信・実プリンタ出力はrollout中に実施していない。
- Production tags: `production-task207d-20261013`、`production-task207e-20261013`、`production-task207f-20261013`。

Hardware follow-up（通しテストblockerではない）:

- `NEC MultiWriter 5750C`で納品書・郵送請求書が実際に紙出力されることを実案件の該当工程で確認する。
- Brother QL-800のB2B複数ラベル連続印刷を実案件で確認する。

B2B E2Eの再開位置は変わらず **実案件のB2B受付登録開始前**。Task207A-Fは先行完了済みとして扱う。
