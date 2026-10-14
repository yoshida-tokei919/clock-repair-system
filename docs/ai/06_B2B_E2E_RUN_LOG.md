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

- Task212A-FIX1（production complete / J-001再保存確認待ち）: Repair J-001 で訪問しただけの中間ステータス日付が履歴訂正として送られ、ステータス保存を阻害。保存済み履歴と最終選択ステータスだけを日付訂正対象にする局所修正。対象: `src/components/repairs/RepairEntryForm.tsx`、`src/lib/repair-status-transition.ts` と関連test、Task文書。最終19件test・型チェックPASS、カタリ独立レビュー済み。ユーザー承認後に本番反映済み（`6697845`、Railway `a0e0f8ae-b862-471b-b510-941912497d1e` SUCCESS、production smoke PASS）。J-001のステータス保存を再試行する。

- Task212A（production complete / 実案件確認待ち）: 口頭等で得た承認を指定日時・操作者とともに記録・訂正し、手動ステータス変更と日付訂正を保存できるように修正。カタリ独立レビュー済み、blocking findingなし。`6586417`、Railway `7525ef2b-86f0-4a76-a896-cd70b344edbb` SUCCESS、production smoke PASS。実案件の承認操作は未実施。K-002の見積・承認工程からE2Eを継続する。

- Task211D（production complete、K-002再保存確認待ち）: K-002の修理明細保存時、手入力した内装交換部品行が `category=part_external` / `partType=interior` となりサーバーで拒否された。見積・承認工程を続けるためのblocker。新規行分類のみを修正し、サーバーの矛盾拒否は維持。対象: `src/components/repairs/RepairEntryForm.tsx`、`src/lib/repair-entry-item-classification.ts` と同test、Task文書。カタリ独立差分レビュー完了、blocking findingなし。本番反映済み（`5e67a35`、deployment `74ac3185-d76d-44a4-a3ab-d8d700920fdb` SUCCESS）。K-002の明細保存からE2Eを再開する。

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

**K-002〜K-005の一括受付・PhysicalTag準備と、NFC UID登録 / R65 HID読取 / 対象Repair解決の実機確認後。**

Task211Dは独立レビュー・本番反映済み。次はK-002の明細保存を再試行し、見積・承認工程へ進む。詳細は末尾の実案件確認記録を参照する。

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

この先行反映時点のB2B E2E再開位置は **実案件のB2B受付登録開始前**。Task207A-Fは先行完了済みとして扱う。

### 2026-10-13 — 実案件一括受付・PhysicalTag・NFC確認

以下はユーザーの実案件操作・実機確認報告に基づく記録。今回の文書追記では実案件DBや実機操作を再実行していない。

| 案件番号 | PhysicalTag |
| --- | --- |
| K-002 | PT-000005 |
| K-003 | PT-000006 |
| K-004 | PT-000007 |
| K-005 | PT-000008 |

- 上記4件のB2B一括受付登録済み。
- QL-800一括準備処理は4/4成功。準備処理の成功と紙の実出力確認は区別する。
- Task196G (`928a7961c3888204b5953fdf209ccd71e55a63ae`) の本番反映後、既存PhysicalTagへのNFC UID登録成功、R65 HIDによるUID読取成功、対象Repair解決に問題がないことを実機確認済み。
- NFC確認が4タグすべてで行われたか、各UID値は引き継ぎ情報にないため、全件確認済みとは記録しない。
- 案件詳細のmovement maker / base movement maker自由入力不具合はTask205C-FIX1 (`8ace2add22c0fa641610d5e61b4b7f658065f385`) でproduction反映済み。
- 確認時のmain / production commit: `d2fab3ac75af067864805790a045ef8237ecb278`。Railway deployment: `a20bec45-e203-4be2-87ea-f74d00f9bec9` — SUCCESS、region `sin`。両実装commitを祖先に含む。
- 写真撮影の不足はTask211A、未承認先行作業の要件はTask211Bに記録済み。いずれもfuture / not started、現時点のE2E blockerにはしない。

再開位置: **受付・PhysicalTag準備・NFC実機確認後 → 案件情報確認 / 見積・承認工程**。
見積・承認 → 作業 → 納品書 → Shipment → 請求 → 手動入金確認は、この記録では完了扱いにしない。

### 2026-10-14 — K-002明細保存blocker / Task211D

- K-002の手入力した内装交換部品行で保存時に区分矛盾エラーが発生。新規行が `category=part_external` / `partType=interior` となることをコード上で確認した。PartsMasterに一致しない手入力経路で表面化する。
- Task211Dで新規行の分類を修正。サーバー側の矛盾拒否は維持。ローカル対象test 29件、型チェック、`git diff --check` はPASS。カタリ独立差分レビュー完了、blocking findingなし。ユーザー承認後にproduction反映済み（`5e67a35`、deployment `74ac3185-d76d-44a4-a3ab-d8d700920fdb` SUCCESS、production smoke PASS）。認証済み画面での保存再試行は未確認。
- 再開位置: **Task211D本番反映済み。K-002の明細保存から再試行 → 見積・承認工程**。後続工程は未確認。
