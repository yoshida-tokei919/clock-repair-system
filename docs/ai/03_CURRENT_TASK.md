# CURRENT TASK

## 現在のcheckpoint — 2026-10-13

このファイルは、現在のproduction到達点、未完了事項、次に着手する候補だけを管理する。
過去Taskの詳細は `docs/ai-tasks/`、全体の優先順位は `docs/ai/02_PRODUCT_ROADMAP.md`、B2B通しテストは `docs/ai/06_B2B_E2E_RUN_LOG.md` を参照する。

## Production current state

- Runtime application source: `2052f218d2268b5fa02fea423020a2324242988d` — Task204E application commit。
- Railway deployment: `fb00bade-aecb-44bf-a9a0-3e18a23baa01` — SUCCESS、region `sin`。
- Railway build: Prisma Client generation PASS、Next.js 15.5.27 compile / lint / type validation PASS、static generation 59/59 PASS。
- Runtime smoke: `/`=200、`/login`=200、未認証 `/repairs`=307、`/shipments`=307、invalid customer share token=404、Task204 internal routes未認証=401。
- `origin/main` の最新production記録commitは `9fdaf664af5b5e73df1fe8357fd6ddd1c6353f5c`。これはTask204A-Eのproduction記録を追加したdocs commitで、runtime application sourceは上記 `2052f21` のまま。
- production tags: `production-task204a-20261013` 〜 `production-task204e-20261013`。
- Task204 rolloutではschema / migration / RLS / GRANT / environment variable変更なし。

## B2C current state

B2Cの「問い合わせ → 受付 → 共有 → 見積/承認 → 修理 → 発送判断 → 配達希望 → Shipment → ゆうプリクラウド → 追跡 → LINE発送通知 → 配達完了」は、software productionとして一連で接続済み。

### Communication / intake

- LINE webhook / Inquiry / InquiryMessage / R2画像保存 / Slack通知: production運用基盤あり。
- Customer Communication Hub Task206B-E: production complete。
- Task206G1 Communication AI Brief: production complete。`production-task206g1-20261012`。
- AI briefはOpenClaw等のtrusted local agentから生成・保存する。Next.jsから従量課金AI APIへ直接接続しない。
- LINE実送信の正本は `APPROVED LineManagerSendOutbox -> Windows sender -> lineoa -> reconciliation -> CONFIRMED`。

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
- Repair / 見積 / Scheduler / WorkTimeSession / PhysicalTag / StorageLocation / Shipment等の基幹機能はB2C/B2B共通基盤を利用する。

### B2B remaining gaps

- Task206F — Gmail channel foundation: **未実装**。B2BメールをCustomer Communication Hubへ統合する。
- Task207系 — 帳票delivery channel / 5750C明示印刷 / 月次請求送付: **未実装**。
  - 見積書 Gmail送信
  - 納品書 `NEC MultiWriter 5750C` 明示印刷
  - 請求書 LINE通常トーク / 郵送振り分け
  - 郵送請求書の5750C一括印刷
  - 月末締め翌月末支払期日の自動設定
- B2B一括PhysicalTagのBrother QL-800実機複数枚連続印刷はsoftware経路はproduction済みだが、実機での複数枚連続出力確認は未完了。
- B2B E2Eで確定済みの複数店舗請求集約は未実装。
  - 同一会社の複数店舗識別
  - 会社単位の請求集約先店舗指定
  - 既存各店舗請求書を保持したまま集約請求へ束ねる
  - 集約請求の明細は納品書単位
  - 元請求書と集約先請求の紐付け保持
- 入金確認は当面手動。銀行API連携は必須要件にしない。

B2B通しテストの専用正本は `docs/ai/06_B2B_E2E_RUN_LOG.md`。実案件を受付から納品・請求まで通し、進行不能の不足だけ独立Task化する。

## Other major completed foundations

- Scheduler / WorkTimeSession / WorkCalendar / Scheduler v2関連 Stage A: production基盤あり。
- PhysicalTag / NFC / QR / ScanSession / StorageLocation Stage B: production基盤あり。
- Shipment / packing / PhysicalTag release / ゆうプリR fallback / ゆうプリクラウド Stage C: production基盤あり。
- Task208A-E 前受金・Stripe・返金/照合: production complete。
- Task209A-B route/token security hardening: production complete。

## Hold / optional items

- Task206H2: Personal Plugin / remote MCP / Supabase OAuth案 — 保留。
- Task206H5B / H5C — 保留。B2C/B2Bの主要導線のblockerにしない。
- ヤマトB2クラウドadapter — 一次資料 / 実利用の必要性が出るまで保留。
- PublicCase / Instagram等の事例公開は、B2C/B2B本格運用導線より後順位。

## Next recommended order

1. **実発送E2E** — 実発送可能な案件がある時にTask204のlive end-to-endを確認し、問題なければtracking sync常時運用へ移す。
2. **Task206F — Gmail channel foundation** — B2Bのメール連絡をCustomer Communication Hubへ統合する。
3. **Task207系 — 帳票delivery / 5750C / 月次請求送付** — B2Bの見積・納品・請求の送付運用を完成させる。
4. **B2B E2E継続** — `docs/ai/06_B2B_E2E_RUN_LOG.md` に沿って実案件を最後まで通す。
5. **B2B複数店舗・請求集約** — E2Eで必要性と現行schema差分を確認してTask分割する。
6. 本格運用後のScheduler / Communication Hub精度改善。
7. 事例公開・その他後順位機能。

## Task boundary

- 一つのTaskが完了しても、ユーザー承認なしに次Taskを連続実装しない。
- schema / migration / auth / 決済 / production DB / LINE実送信等の高リスク変更は、実装担当とレビュー担当を原則分離する。
- production migration、deploy、破壊的・不可逆操作はユーザー明示承認前に行わない。
- 作業開始時は必ず `git status` を確認し、既存の未commit / 未push差分を保護する。
