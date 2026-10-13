# CURRENT TASK

## 現在のcheckpoint — 2026-10-14

このファイルは、現在のproduction到達点、未完了事項、次に着手する候補だけを管理する。
過去Taskの詳細は `docs/ai-tasks/`、全体の優先順位は `docs/ai/02_PRODUCT_ROADMAP.md`、B2B通しテストは `docs/ai/06_B2B_E2E_RUN_LOG.md` を参照する。

## Production current state

- Latest application change: `5e67a35bdb187da6a2fe97ad0b0170ea5ca0aea6` — Task211D手入力内装部品の区分整合。Task211C / Task196G / Task205C-FIX1 / Task207A-Fを祖先に含む。後続docs-only commitでもこのapplication到達点を維持する。
- Application rollout deployment: `74ac3185-d76d-44a4-a3ab-d8d700920fdb` — SUCCESS。後続docs-only rolloutのlatest deploymentはRailwayで確認する。
- Railway production build SUCCESS。Task211D Local対象test 29件 / TypeScript PASS。
- Runtime smoke: `/`=200、未認証 `GET /api/invoices/postal-print-targets`=401。認証済みK-002の保存再試行は未確認。
- production tag: `production-task211d-20261014`。既存Task211C / Task207A-F等のtagsも維持。
- Task211Dはschema / migration / env / production DB変更なし。E2E再開位置はK-002明細の保存再試行。
- Task211C production master追加: `RepairWorkAction.id=25` / `movement_repair` / 動作修理 / sortOrder 25 / active。既存repair / adjust維持、1行だけ追加。schema / migration / env変更なし。
- Task207B/C production migrations: `20261013021135 add_b2b_company_billing_foundation` / `20261013021204 add_consolidated_invoice`。Task207D-Fはschema / migration / env / production DB変更なし。
- Task207A-C rollout前backup: `C:\Users\yoshi\clock-repair-backups\task207abc-20261013T020650Z`。Task207D-Fはmigrationなしのため追加backup不要。

## B2C current state

B2Cの「問い合わせ → 受付 → 共有 → 見積/承認 → 修理 → 発送判断 → 配達希望 → Shipment → ゆうプリクラウド → 追跡 → LINE発送通知 → 配達完了」は、software productionとして一連で接続済み。

### Communication / intake

- LINE webhook / Inquiry / InquiryMessage / R2画像保存 / Slack通知: production運用基盤あり。
- Customer Communication Hub Task206B-E: production complete。
- Task206G1 Communication AI Brief: production complete。`production-task206g1-20261012`。
- AI briefはOpenClaw等のtrusted local agentから生成・保存する。Next.jsから従量課金AI APIへ直接接続しない。
- LINE実送信の正本は `APPROVED LineManagerSendOutbox -> Windows sender -> lineoa -> reconciliation -> CONFIRMED`。
- Task206H1D - LINE Manager dedicated browser runtime alignment: **future / not started**. 2026-10-13 hourly mapping health repeatedly returned `manager_live_read_unavailable`; read-only diagnosis found fixed storage restore raising `InteractiveLoginRequired`. Normal Microsoft Edge is authenticated, but the dedicated recovery path is fixed to Playwright `channel="chrome"` and Chrome executable is not currently available on this PC. Preserve the isolated dedicated profile/storage and fail-closed auth boundary while aligning to an explicit allowlisted browser runtime. Confirm recovery before the next real LINE send.

### B2C customer journey

- Task210A: 同一受付の複数Repairを1共有ページへgrouping — production complete。
- Task210B: 受付完了後の共有ページURL LINE通常トーク案内 — production complete。
- Task210C: 顧客単位の発送判断 — production complete。
- Task210D: Shipment / 発送グループ単位の配達希望 — production complete。
- Task210E: 配達希望からDRAFT Shipment自動作成 — production complete。
- Task210F: DRAFT中の配達希望変更 / READY以降lock — production complete。

### Shipping / delivery

- Task201G-OPS: ゆうプリクラウド自動発行のproduction operational activation complete。
- Workerは `NEC MultiWriter 5750C` 固定。送り状発行だけでは発送済みにしない。
- Task204A-E: Japan Post tracking取得、Shipment同期、引受時LINE通知、共有ページ配送状況、配達完了からRepair納品済み — software production complete。
- **残る確認:** 実際の荷物で「tracking取得 -> 引受 -> LINE発送通知 -> 輸送 -> 配達完了 -> Repair納品済み」まで通すreal-shipment E2E。
- persistent `-AllowTrackingSync` は実発送E2E確認までOFFを維持する。

## B2B current state

### Production complete

- Task205A: B2B一括受付。既存取引先を選び1〜30本をatomicに登録。
- Task205B: ブランド -> モデル -> Ref / Cal のmaster drill-down。
- Task205C: 自由入力 + 既存候補検索、movement maker / Cal、base maker / Cal、依頼内容入力。
- Task205D: 一括PhysicalTag準備 + Brother QL-800 / DK-2205直接印刷経路。
- Task207A: B2B納品書を `NEC MultiWriter 5750C` へ固定印刷するlocal helper / UI — production complete。紙の実出力確認のみ未完了。
- Task207B: B2B company / 複数店舗 / 指定請求先店舗の基盤 — production complete。
- Task207C: 既存各店舗Invoiceを保持したまま指定請求先へ集約し、DeliveryNote単位snapshotを保持する集約基盤 — production complete。
- Task207D: 月次請求の対象月保存、月末締め、翌月末支払期日自動設定 — production complete。
- Task207E: B2B請求書のLINE通常トーク / 郵送振り分け。LINEは既存Outbox経路へ統一し、未確定送信中の取消・PDF差替えをfail-closedで防止 — production complete。独立レビューblocking findingなし。
- Task207F: 郵送請求書を選択し `NEC MultiWriter 5750C` 固定helperへ順次投入する一括印刷 — production complete。紙の実出力のみ未確認。
- Repair / 見積 / Scheduler / WorkTimeSession / PhysicalTag / StorageLocation / Shipment等の基幹機能はB2C/B2B共通基盤を利用する。

### B2B remaining gaps

- Task205E — B2B依頼書・画像AI入力候補: **future**。ScanSnap iX1300 / 既存Webカメラから任意で資料を取り込み、OpenClaw + ChatGPT Plus枠でbrand / model / Ref / serial / Cal / 依頼内容等の候補を作り、人間確認後に案件化する。現行E2Eのblockerにはしない。
- Task211A — Repair photo capture reliability / quality: **future**。B2B E2Eで、スマホQR撮影のアップロード失敗と、4K対応済みの既存撮影機材が現在1920×1080で取得される画質退行を確認。撮影時の解像度診断表示は現存するため追加不要。camera device選択 / capabilities / 4K negotiation、保存品質、PC/スマホ撮影経路の重複をRepair共通基盤として整理する。現行E2Eのblockerにはしない。
- Task211B — Pre-approval work execution / 先行作業: **future**。電池交換等の低額・短時間作業を、見積/承認完了前に工房判断で先に作業する実務を正式に扱う。見積・承認状態と実作業進捗を分離し、見積り中 / 未承認 / 作業完了 を許容する一方、事前承認と未承認先行作業を混同せず、承認済みへ偽装しない。現行E2Eのblockerにはしない。
- B2B取引先LINE紐付けUX: **future UX改善**。現行機能では公式LINE受信後に /line-users から既存/新規Customerへ安全に紐付け可能だが、新規取引先登録画面のLINE ID欄だけでは正しい手順が分かりにくい。

- Task206F — Gmail channel foundation: **未実装**。現時点ではメール送受信が必要な取引先案件がないため、優先度を下げる。必要案件が発生した時にCustomer Communication Hubへ統合し、見積書Gmail送信も同時に扱う。
- B2B一括PhysicalTagのBrother QL-800実機複数枚連続印刷はsoftware経路はproduction済みだが、実機での複数枚連続出力確認は未完了。
- B2B帳票の `NEC MultiWriter 5750C` 固定印刷経路はproduction済み。納品書・郵送請求書とも紙の実出力確認は実案件時に行う。
- B2B E2EはK-002〜K-005の一括受付・PhysicalTag準備（4/4成功）と、NFC UID登録 / R65 HID読取 / 対象Repair解決の実機確認まで進行済み。次は案件情報確認 / 見積・承認工程。NFCの4タグ全件確認や紙の連続出力成功を意味しない。`docs/ai/06_B2B_E2E_RUN_LOG.md` を正本に、納品・Shipment・請求・手動入金確認まで通す。
- 入金確認は手動を正式運用とし、銀行口座API連携・自動消込は実装対象にしない。

## Other major completed foundations

- Scheduler / WorkTimeSession / WorkCalendar / Scheduler v2関連 Stage A: production基盤あり。
- PhysicalTag / NFC / QR / ScanSession / StorageLocation Stage B: production基盤あり。
- Shipment / packing / PhysicalTag release / ゆうプリR fallback / ゆうプリクラウド Stage C: production基盤あり。
- Task208A-E 前受金・Stripe・返金/照合: production complete。
- Task209A-B route/token security hardening: production complete。
- PublicCase / Web事例公開: 既存production機能あり。現在の主要残Taskには含めない。

## Closed / deferred items

- Task206H2 — Personal Plugin / remote MCP / Supabase OAuth案: **廃止**。OpenClawからChatGPT Plus枠を利用でき、主要用途を既存LINE Outbox / Customer Communication Hub / OpenClaw連携で満たせるため追加実装しない。OpenAI API等の従量課金AI APIへはフォールバックしない。
- Task206H3 / H4 — OpenClaw local agent / Command Bridge PoC: **完了**。必要箇所で成果を再利用する。
- Task206H5A — Slack -> n8n即時化: **完了**。
- Task206H5B — Repair等のread-only実業務PoC: **PoC完了**。OpenClawを恒久的な構造化データreadの正本にはせず、固定取得はAPI / DB / n8nを優先する。
- Task206H5C — Bridge API拡張: **未実装のまま終了**。H5Bまでで目的を確認できたため自動着手しない。具体的な業務上の不足が出た場合のみ新Taskとして再評価する。
- Instagram連携・投稿自動化: 現時点では実施予定なし。残Taskに含めない。
- ヤマトB2クラウドadapter: ヤマトとの契約後、実利用が必要になった時点で検討する。現時点では残Taskに含めない。
- 銀行口座連携・自動消込: 実装しない。入金確認は手動運用を維持する。
- PublicCaseの追加拡張: 事例公開自体は利用可能。新しい要件が出た場合のみ別Task化する。

## Next recommended order

1. **B2B E2E継続** — `docs/ai/06_B2B_E2E_RUN_LOG.md` に沿って実案件を受付 → 案件化 → 見積 → 作業 → 納品 → Shipment → 請求 → 手動入金確認まで通す。
2. **実発送E2E** — 実発送可能な案件が出た時にTask204のlive end-to-endを確認し、問題なければtracking sync常時運用へ移す。
3. **Task206F — Gmail channel foundation** — メール対応が必要なB2B取引先が発生した時点で着手し、見積書Gmail送信も同時に扱う。
4. 本格運用後のScheduler / Communication Hub精度改善。
5. 事例公開・その他の新規要件は必要性が出た時点でTask化する。

## Task boundary

- 一つのTaskが完了しても、ユーザー承認なしに次Taskを連続実装しない。
- schema / migration / auth / 決済 / production DB / LINE実送信等の高リスク変更は、実装担当とレビュー担当を原則分離する。
- production migration、deploy、破壊的・不可逆操作はユーザー明示承認前に行わない。
- 作業開始時は必ず `git status` を確認し、既存の未commit / 未push差分を保護する。
