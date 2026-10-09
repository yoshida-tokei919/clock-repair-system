# 第36章 二重送信・二重作成を防ぐ仕組み

## 36.1 処理ごとに異なる安全柵を使う

重複防止は一つの万能ロックではない。受信イベント、業務メッセージ、通知intent、外部送信、Shipment作成、タグ解放、決済には別々の識別子と確定条件がある。DBのunique制約、transaction、lockは並行更新を抑えるが、**外部POSTや通信断の結果不明を自動で解決しない**。

![重複防止と結果不明時の確認フロー](../assets/diagrams/duplicate-safety-flow.svg)

## 36.2 受信・通知・LINE送信

| 層 | 実装済みの重複防止 | 結果の読み方 |
| --- | --- | --- |
| LINE Webhook | `LineWebhookInbox.webhookEventId`のuniqueと重複挿入の抑止 | eventの受信保存。Inquiry処理の完了とは別 |
| LINE業務メッセージ | `InquiryMessage.externalMessageId`のunique。processorはLineUser単位のtransaction lock下で既存IDを確認し、競合時も既存記録を再取得 | 同じLINE message IDを別の本文として増やさない。Webhook event IDとは別のdedupe |
| Slack通知intent | `SlackNotificationOutbox.dedupeKey`のunique。通常通知はmessage ID由来のkeyでupsert | 同じ通知intentを増やさない。Slack投稿の外部結果までunique制約で証明するものではない |
| LINE Manager送信intent | `LineManagerSendOutbox.idempotencyKey`と`sendId`が各々unique。既存keyのintentと宛先・本文が食い違えば拒否 | UIの承認や送信待ちは送信完了ではない |

LINE Manager senderはclaim後、外部POST前に**durable fence**を記録し、`POST_UNCONFIRMED`にする。固定した`sendId`、宛先、文面を使い、POST試行後はManager履歴を照合する。履歴の実message ID・完全一致の文面・宛先などが揃った場合だけ`CONFIRMED`とし、`OUTBOUND InquiryMessage`を作る。`POST_UNCONFIRMED`はfence後・POST前の停止も実POST後の通信断も含み得るため、**未送信と決めて盲目的に再送しない**。この状態は送信claim対象ではなく、履歴照合の対象である。現行senderは未解決の`POST_UNCONFIRMED`が一件でもある間、新しいsend claimとfenceも止める。詳細は[第27章](27_line-webhook.md)、[第28章](28_line-manager-sender.md)、[第30章](30_slack.md)。

見積LINEは`estimate-document-line:{documentId}:{snapshot digest}`形式のintent keyを使い、同じ見積書で異なる送信条件のkeyが既にあれば拒否する。作業完了LINEのkeyは`repair-completion-notice:{repairId}`に固定されている。どちらも送信intentの重複防止であり、送信確認は共通の履歴照合に従う。作業完了statusへの変更だけでは送信しない。[第20章](20_completion-line.md)も参照。

## 36.3 Shipment・PhysicalTag・Stripe

| 処理 | 確認・更新の境界 | 結果不明時 |
| --- | --- | --- |
| Shipment作成 | `SHIPMENT_SELECT`はscanと人の選択確認までread-only。明示POST時にserverがRepair・顧客・返送先snapshotを再検証 | 通信断、または成功応答からShipment IDを確認できなければ、同じ選択の再confirmを画面でblock。発送一覧と既存個口を確認する。Shipment作成に外部送信のような万能idempotency keyがあるとは扱わない |
| 梱包照合・タグrelease | 梱包対象の全件一致を確認し、release previewはread-only。明示POST時もShipmentとRepair集合、active assignment、タグ`ACTIVE`をserver側で再検証。`Serializable` transactionとguarded updateで全件atomic release | 通信断、5xx、成功応答不明は`uncertain`。同sessionからの再POSTをblockし、割当とShipmentを再取得して確認する |
| Stripe Checkout・Webhook | `PaymentAttempt.idempotencyKey`をStripe Session作成にも渡す。既存open Sessionは再利用し、completeでWebhook未確定なら結果確認中。署名付きpaid Webhookは登録Session、金額等をtransaction内のPayment行lock下で再照合 | success画面だけで入金登録しない。Session作成・保存の結果不明は同じkeyで再照合し、別Sessionを盲目的に作らない |
| Stripe返金 | 外部POST前に`PaymentRefund(PENDING)`とidempotency keyをdurableに保存。1 Paymentにつき未解決の`PENDING`返金は最大1件として返金可能額を予約する | provider例外を即`FAILED`にせず`PENDING`で保持。「Stripe照合」は同じrefund IDまたは同じkeyで確認し、新しい返金を重ねない |

Shipment作成の通信結果不明を「失敗した」と決めて再送すると、別IDの個口を二重作成し得る。`ShipmentRepair`の複合キーは同一個口内の同じRepairの重複を抑えるが、異なるShipment IDの二重個口は防がない。PhysicalTagのactive割当は`releasedAt IS NULL`のpartial unique indexでも制限する。releaseは再検証とatomic処理で部分解放を防ぐが、応答を失ったclientは成功か失敗かを推測できない。StripeのkeyとWebhookの冪等確定も、画面のsuccess表示を決済根拠へ変えるものではない。詳細は[第22章](22_shipment.md)、[第23章](23_shipment-packing.md)、[第24章](24_physical-tag-release.md)、[第34章](34_external-integrations.md)。

## 36.4 retry可／再送禁止／要確認

| 状況 | 判断と次の操作 |
| --- | --- |
| LINE Inboxの`FAILED`で試行上限未満 | `externalMessageId`等のdedupeを前提にprocessorが再試行できる。上限到達・競合は原因調査 |
| LINE Managerのfence前`PRE_SEND_FAILED` | 送信前失敗として、実装されたbackoff・claim条件に沿って再試行可能。手動で新しいintentを作る判断とは分ける |
| LINE Managerの`POST_UNCONFIRMED` | **再送禁止**。Manager履歴とのreconciliationで確認する。証拠不足・曖昧な候補は要確認 |
| Shipment作成またはタグreleaseのHTTP結果不明 | **同じ操作を盲目的に再送しない**。Shipment一覧、個口ID、active assignment等を再取得し、実状態を調べる |
| Stripeのcomplete SessionでWebhook未確定 | **追加Checkoutや手動入金確定を急がない**。Webhookと`Payment`／`PaymentAttempt`を照合する |
| Stripe返金が`PENDING`／通信結果不明 | **新しい返金を作らない**。保存済み返金をStripe照合する。外部IDなしで長時間不明ならprovider側を手動確認 |
| 銀行振込の返金記録 | アプリが送金する操作ではない。実際の外部返金を確認してから、同じ手動操作を記録する |
| ゆうプリR履歴previewで未知code・重複・競合 | 候補のまま要確認。`10/0A`も実引受ではない。previewはtracking・statusを更新しない |

read-only preview → 人の確認 → 明示mutationという順序も、誤操作と重複処理を抑える安全柵である。scanやCSV previewだけを確定操作にしない。判断の前提となる正本は[第35章](35_status-source-of-truth.md)を参照する。
