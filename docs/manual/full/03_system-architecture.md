# 第3章 システム構成とデータの流れ

## 3.1 この章の見方

[第2章](02_system-overview.md)は受付から納品までの業務順序を示す。本章は、画面から届いた操作や外部イベントが**どの実行環境を通り、どこに記録され、何をもって確定するか**を説明する。図の矢印は現行の経路である。CSVの読取プレビューと、未実装の配送状態自動更新は同じ段階として描かない。

![管理画面、Railway、保存先、Windowsローカル処理、外部サービスの現行接続図](../assets/diagrams/system-architecture.svg)

## 3.2 管理画面から業務データまで

管理者のbrowserはRailway上のNext.jsへアクセスする。認証・入力検証・業務処理を経て、Next.js serverはPrisma ClientでSupabase PostgreSQLを読み書きする。Customer、Inquiry、Repair、Shipment、Inbox、Outbox、ファイルの保存先情報など、**業務レコードの正本**はPostgreSQL側に置く。browser表示やRailwayの一時filesystemだけを保存完了の根拠にしない。

顧客向けページもNext.jsの公開範囲にあるが、管理画面と同一の権限を持たない。画面ごとの認証、公開token、server側の検証を分けて扱う。管理画面のログイン境界は[第4章](04_login-common-ui.md)、DBと権限の詳細は[第31章](31_supabase-prisma.md)を参照する。

## 3.3 DBのレコードとファイル本体を分ける

| 対象 | レコード・保存先情報 | ファイル本体 |
| --- | --- | --- |
| 顧客、問い合わせ、修理、発送、送受信状態 | Supabase PostgreSQL | 対象外 |
| 見積PDF・請求書PDF | PostgreSQLの文書レコード等 | Supabase Storage `documents` |
| LINE Inquiry画像 | PostgreSQLの`InquiryFile`と保存状態 | Cloudflare R2のInquiry画像経路 |
| RepairPhoto | PostgreSQLの`RepairPhoto`等 | Cloudflare R2の写真経路 |

画像とPDFは保存先が異なる。「DBにファイルのkeyがある」と「bodyを開ける」も別の事実である。Inquiry画像は`uploadStatus=STORED`まで確認する。保存・閲覧時の詳細は[第31章](31_supabase-prisma.md)・[第32章](32_cloudflare-r2.md)を参照する。接続文字列、object keyの実値、署名URLはマニュアルへ転記しない。

## 3.4 LINE受信、後処理、Slack通知

顧客のLINEイベントはRailwayの`/api/line/webhook`へ届く。Next.jsは署名を検証し、対象イベントを`LineWebhookInbox`へ保存する。この時点の成功応答は**受信保存**を示し、Inquiry作成・画像保存・Slack投稿の完了ではない。

Windowsローカルのn8nは定期的にNext.jsの内部processorを起動する。処理件数が正の場合と定期health checkでは、別のmapping workflowからLINE Managerのchat・履歴照合を起動する。mappingは保存済みINBOUND message IDとManagerの受信message IDの完全一致だけを根拠にし、LINEは送信しない。Inquiryへの割当、`InquiryMessage`保存、画像のR2保存、再試行判定はアプリ側で行う。通知はPostgreSQLの`SlackNotificationOutbox`へ記録し、別のn8n workflowがSlackへ投稿して結果をアプリへ返す。Slackは通知先であり、LINE本文やInquiryの正本ではない。n8nのSQLiteや実行履歴も業務データの正本にしない。詳しくは[第27章](27_line-webhook.md)・[第29章](29_n8n.md)を参照する。

## 3.5 LINE送信は別のWindows senderで確認する

管理画面で送信を明示すると、Next.jsは`LineManagerSendOutbox`に`APPROVED`の送信intentを保存する。`APPROVED`は送信待ちであり、送信済みではない。別のWindowsローカルsenderがoutboxを取得し、fenceとローカル証拠の保存を経て、lineoaからLINE Manager通常トークへ送信を試みる。**n8nはこの送信を行わない。**

senderとmappingは共通の短時間`lineoa-operation.lock`でManager操作を直列化する。送信試行の応答だけでは成否を確定しない。senderがLINE Manager履歴の送信先・文面・識別情報を照合し、一致したときだけoutboxを`CONFIRMED`にする。その時に実Manager message IDを持つ`OUTBOUND InquiryMessage`が作られる。結果不明の`POST_UNCONFIRMED`を未送信と決めて再送しない。状態遷移と障害対応は[第28章](28_line-manager-sender.md)を参照する。

## 3.6 Inquiry AIの明示実行

現行のInquiry AI暫定分析は、カタリが`inquiry-ai-bridge.ps1`を**明示実行**して保存済み本文・画像を読み、候補を保存する経路である。n8nのLINE Inbox後処理からAIが全自動で正式なWatchやRepairを確定する構成ではない。入力が変わった場合の古い分析保存は拒否し、暫定候補を人がレビューする。原文とAI候補の境界は[第5章](05_line-inquiry-intake.md)・[第6章](06_inquiry-line-storage.md)を参照する。

## 3.7 決済と配送の外部境界

Stripeの現行カード決済は、B2CのRepair前受金と最終請求書にCheckout Sessionを作成し、**署名を検証したWebhook**で支払結果を照合してからアプリのPaymentを確定する。入金済み前受金の請求書充当は別の明示操作である。Checkoutからの戻り画面だけで入金済みとはしない。

日本郵便のゆうプリRは、現行ではShipmentからのV3取込CSV出力と、発送履歴CSVの**read-only preview**で接続する。CSV出力やプレビューで追跡番号・実発送・配達完了を自動保存しない。日本郵便の実引受に基づく配送状態同期とLINE発送通知は後続実装であり、現在使える機能として案内しない。詳細は[第25章](25_yupuri.md)・[第34章](34_external-integrations.md)を参照する。

## 3.8 障害時に追う順序

画面の結果が分からない場合は、操作した画面、Next.jsの応答、PostgreSQLの対象レコードと状態、必要ならStorage・R2・Windows worker・外部サービスの証拠を順に分ける。画面の表示、DBへの保存、外部での送信・入金・引受は別の事実である。連打や盲目的な再送を避ける判断は[第35章](35_status-source-of-truth.md)・[第36章](36_duplicate-safety.md)を参照する。
