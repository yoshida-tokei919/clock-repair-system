# 外部配送・決済等の接続編 印刷見本

版: 0.1

対象: 詳細版[第34章 外部配送・決済等の接続](../full/34_external-integrations.md)。**A4縦・カラー、全6ページ**。実顧客画面のスクリーンショットは使わず、共通SVGと表・短い処理図で組む。青＝アプリ／現行通信、緑＝DB正本、橙＝人の確認、灰色点線＝未接続。

## 1ページ目 — 外部サービスの接続一覧

**見出し:** 接続方式と、結果を確定する人・処理を分ける。

| 接続先 | 現在の経路 | 現在の状態 |
| --- | --- | --- |
| 日本郵便／ゆうプリR | ShipmentからCSV出力、履歴CSVをread-only preview | ファイル連携のみ |
| ヤマトB2クラウド | 固定順97項目の調査 | 出力未実装・契約値待ち |
| Stripe | B2C請求書のカードCheckoutと署名Webhook | 決済の実装経路 |
| 銀行振込 | 人の着金確認後、Adminが手動登録 | 銀行APIなし |
| PayPay／KOMOJU | 実行可能な決済経路なし | 未実装 |
| LINE／n8n／Slack | 受信・送信、定期起動、通知を別々に担当 | 第27～30章参照 |

<img src="../assets/diagrams/external-services-boundary.svg" alt="中央のNext.jsとSupabase、周辺の配送・決済・通知サービスの接続境界" style="display:block;width:175mm;max-width:100%;margin:3mm auto 0;" />

**図下:** 実線は現行経路。灰色点線は、運用に使えるAPIやCSVの矢印ではない。図幅175mmを上限にし、文字を読める縮尺で置く。

<div style="page-break-before: always;"></div>

## 2ページ目 — ゆうプリRとヤマトB2クラウド

**見出し:** 同じShipmentを使っても、配送会社ごとの実装状態は異なる。

| 日本郵便／ゆうプリR | 確認点 |
| --- | --- |
| `GET /api/shipments/[id]/yupuri-v3` | Admin認証、OUTBOUND・発送前のShipmentから読取専用出力。共通画面に出力ボタンはない |
| V3 CSV | 100列、headerなし、CP932／Shift_JIS、BOMなし、CRLF。管理番号`SHP-{Shipment.id}` |
| `POST /api/shipments/yupuri-history/preview` | Admin認証、履歴のraw値・照合候補・エラーを表示するだけ |
| 状態の確定 | `10/0A = 引受予定`だけ意味を確認済み。実引受、追跡保存、配達更新は未実装 |

**下段の区切り枠:** ヤマトB2クラウドは**調査完了／実装保留**。公式の固定順97項目を確認したが、契約ごとの請求先情報、依頼主情報、サービス設定と、受理済みテンプレート／実サンプルが不足する。現行アプリにB2 CSV出力UI・APIはない。実契約コードを印刷しない。

**参照:** [第25章 ゆうプリR](../full/25_yupuri.md)。CSV取得と郵便局引受は別の事実として組む。

<div style="page-break-before: always;"></div>

## 3ページ目 — Stripe Checkoutの要求経路

**見出し:** 請求額をserverで確認し、カードCheckout Sessionを作る。

```text
顧客の請求画面 → POST checkout
  → B2C／発行済み／正の総額・未入金残高を確認
  → 処理中・部分入金を拒否
  → Payment(STRIPE, CARD, PENDING) ＋ 単一Allocation
  → PaymentAttempt(idempotency key)
  → Stripe Checkout Session(card, JPY) → URLを返す
```

| 既存Session | APIの扱い |
| --- | --- |
| `open` | 同じCheckout URLを再利用 |
| `complete`だがDB未確定 | 409、結果確認中 |
| closed／expired | 古いpendingのPayment／Attemptをcancelして置換 |
| 新規作成失敗 | `FAILED`を記録し、URL生成失敗を返す |

**注意枠:** 請求画面はApple Pay／Google Payも案内するが、この版のコード契約は`payment_method_types: ["card"]`。walletの可用性は保証しない。success URLへの帰着は入金確定ではない。

<div style="page-break-before: always;"></div>

## 4ページ目 — Stripe Webhookの検証と冪等確定

**見出し:** 署名と支払済みSessionを確認してからPaymentを確定する。

```text
Stripe → POST /api/stripe/webhook
  → raw bodyとstripe-signatureをWebhook secretで検証
  → checkout.session.completed かつ payment_status=paid のみ
  → 登録済みSessionを検索 → transactionでPayment行をlock
  → provider／status／金額／通貨／単一Allocationを再照合
  → 顧客・Invoice・metadata・記録済みPaymentIntentを照合
  → PaymentAttemptとPaymentをSUCCEEDED、paidAtを保存
```

| 再受信・不一致 | 扱い |
| --- | --- |
| 両レコードが既に`SUCCEEDED` | idempotentに終了し、重複入金にしない |
| 署名不正・secret欠落 | Webhookを受け付けない |
| Session・metadata・金額等が不一致 | 確定を拒否し、根拠を確認する |
| paidでない／対象外イベント | Paymentを確定しない |

**図下:** 顧客画面の入金済額は`SUCCEEDED`なPaymentのallocationから計算。画面遷移やWebhook到着だけで支払済み表示を作らない。

<div style="page-break-before: always;"></div>

## 5ページ目 — 銀行振込と未接続の支払方法

**見出し:** 銀行の着金確認は人、登録はAdminの明示操作。

```text
顧客への振込案内 → アプリ外で着金を人が確認
  → Admin認証 POST /api/invoices/[id]/payments/manual
  → B2C・発行済み・正の請求額などを検証
  → Payment(MANUAL, BANK_TRANSFER, SUCCEEDED, paidAt=現在時刻)
```

銀行API、銀行取引feed、自動着金照合はこの経路にない。振込案内の表示と着金済み登録を同一視しない。実口座番号・名義などはこのプレビューに載せない。

| 支払方法 | 現行repoで確認できること | 利用可能性 |
| --- | --- | --- |
| PayPay | `PaymentMethod.PAYPAY`と表示ラベルはある。顧客Checkout routeは`CARD`のみ作成 | 現行の実行経路に含まれない |
| KOMOJU | 本Taskで確認したrepo証拠に実装参照なし | 現行の実行経路に含まれない |

**注意枠:** この記載は現行実装の境界であり、将来の採用を否定しない。実装と設定が存在してから契約を更新する。

<div style="page-break-before: always;"></div>

## 6ページ目 — 失敗箇所の切り分けと秘密情報

**見出し:** 外部操作、プレビュー、正本更新のどこで止まったかを確認する。

| 症状 | 確認先 |
| --- | --- |
| ゆうプリRの出力・照合が失敗 | Shipment条件・宛先snapshot・CSV仕様・管理番号・raw status。`10/0A`で実引受とは判定しない |
| B2出力を求められた | Task201Bの不足契約値と実サンプル。現行UI・APIを案内しない |
| Checkoutが始まらない | 請求書条件、既存Payment／Session、Stripe Session作成結果 |
| Stripe後も未入金 | 署名、paid event、Session・Attempt・metadata照合、`SUCCEEDED`状態 |
| 銀行振込が未反映 | 人の着金確認とAdminの手動登録結果 |
| LINE／Slackの通知が見えない | Inbox／Outbox／local sender／n8nの各境界を別々に確認 |

**秘密情報枠:** API key、Webhook secret、Bearer token、公開URLの実token、LINE認証情報、実顧客情報、配送契約コード、銀行口座情報を印刷・ログ・調査メモへ転記しない。

**参照:** [第27章 LINE Webhook](../full/27_line-webhook.md)／[第28章 LINE Manager sender](../full/28_line-manager-sender.md)／[第29章 n8n](../full/29_n8n.md)／[第30章 Slack](../full/30_slack.md)。n8nはorchestration、Slackはnotification、local senderは別の送信経路。
