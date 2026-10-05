# 第28章 LINE Manager Outbox / local sender / lineoa / 履歴照合

## 28.1 正本と適用版

管理画面で返信を送信待ちへ追加すると`LineManagerSendOutbox`に送信intentを保存する。実際の送信確認までは`OUTBOUND InquiryMessage`を作らない。会話の正本は[第6章](06_inquiry-line-storage.md)、作業完了連絡の画面操作は[第20章](20_completion-line.md)を参照する。本章は送信の内部状態と障害対応を扱う。

Task203Eに関する本章の実行時仕様は、2026-10-05に確認されたremote main / sender runtime `3ac7067dad80d4463f9e897167cad46d270fb4ab`を基準とする。作業ツリー内の古い実装断面や[Inquiry AI Runbook](../../ai/05_INQUIRY_AI_RUNBOOK.md)の過去checkpointだけで、この版のguard・backoff・起動状態を判断しない。

![LINE Manager送信intentから履歴確認まで](../assets/diagrams/line-manager-sender-flow.svg)

## 28.2 verified LineManagerChatの根拠

送信先mappingは、保存済み**INBOUND** `InquiryMessage.externalMessageId`と、LINE Manager履歴の受信`message.id`が完全一致するという変更されない証拠で作る。LINE表示名、Customer名、本文の類似、Webhookのuser IDだけではManager上のchatを特定しない。証拠が複数のbot/chatへまたがる、または同じ送信先が複数LineUserの証拠と一致する場合は曖昧としてfail closedにする。

確認済み`LineManagerChat`がInquiryのLineUserに対応しなければ、UIは送信intentを作れない。送信時にもInquiry、mapping、固定した送信先の整合を再検証する。

## 28.3 承認から送信確認まで

UIの明示操作はLINEを直接送らず、`APPROVED`のoutbox intentを作る。作成時に`sendId`、Manager bot/chat送信先のsnapshot、文面を固定する。Inquiry返信とRepairの作業完了連絡は同じ送信基盤を使う。

| 状態・段階 | 意味 |
| --- | --- |
| `APPROVED` | UIで承認した送信待ちintent。送信済みではない |
| `CLAIMED` | local senderが内部APIからclaim。送信前の履歴とローカル証拠を準備する |
| `PRE_SEND_FAILED` | durable fence前の失敗。後述のbackoff後に再claim可能 |
| durable fence → `POST_UNCONFIRMED` | POSTを許可する前にDBへ永続記録。結果は未確定 |
| lineoa private `textV2` POST attempt | 固定した宛先・文面・`sendId`でManager通常トークへのPOSTを1回試みる |
| Manager履歴reconciliation → `CONFIRMED` | 履歴の実メッセージを厳密照合して送信確認 |
| `CANCELLED` | 送信前状態で取り消したintent |

`POST_UNCONFIRMED`は「POST済み確定」を表さない。fence後・POST前の停止も含み得る一方、POSTが到達した可能性もある。結果不明のまま手動再送・自動再送すると重複送信の恐れがあるため、**まず履歴照合を解消する**。この状態はsend claimの対象ではない。

## 28.4 local senderと再試行制御

local senderはWindows上のPython workerで、既定のpoll間隔は30秒。各cycleでreconciliationを先に試み、候補がなければ送信claimへ進む。CLIの既定はreconciliation-onlyで、送信には明示的な`--allow-send`が必要である。single-instance OS file lockで同時起動を防ぐ。n8nはこのsender serviceではなく、LINE送信を行わない。

Task203Eのglobal unresolved-post guardにより、**1件でも`POST_UNCONFIRMED`がある間は、新たなsend claimとfenceがfail closed**になる。後続の`APPROVED`が進まない場合、先に未確定の履歴照合を調べる。

`PRE_SEND_FAILED`はattempt 1～4に対して、それぞれ30秒・60秒・120秒・300秒のbackoffを置いて再試行する。5回目はautomatic send claim対象外。送信前失敗と、fence後の結果未確定を同じ「再送可能」にまとめない。

workerはfence前に送信先の履歴とローカル証拠を保存する。fence成功後も、POST呼出し直前の時刻markerを耐久保存できなければPOSTせず、outboxを`POST_UNCONFIRMED`のまま照合対象に残す。POSTの呼出し結果が例外・通信断でも成功/失敗を推測しない。

## 28.5 lineoaと履歴reconciliation

送信はlineoa **7.7.18のprivate実装にversion-coupled**した`ChatService.send_message`経路で、`textV2` payloadにoutboxの固定`sendId`を渡す。LINE公式Messaging API Push機能ではなく、LINE Managerの公式公開APIとして案内しない。lineoaの高水準senderは別の`sendId`を生成するため、この経路では用いない。現行のUI送信対象はtextのみである。

reconciliationは`POST_UNCONFIRMED`をclaimし、ローカル証拠とManager履歴を照合する。履歴に`sendId`があれば固定宛先・完全一致の`sendId`・完全一致の文面・実message IDを要求する。履歴に`sendId`がない場合だけ、送信前watermarkと証拠取得時刻より後からserverのfence時刻を基準とした有界window内にある、同じ宛先・完全一致の文面の候補を使う。workerとserverの時刻差は定められた最大2分の許容範囲で検証する。候補が0件または複数件、timestampや履歴形式が不正、ローカル証拠が欠落・不一致ならfail closedにする。

`CONFIRMED`時は、実Manager message ID、完全一致の文面・送信先、有効なtimestamp、mapping、outbox状態を検証し、**そのとき初めて**実message IDを`externalMessageId`とする`OUTBOUND InquiryMessage`を作る。既に別の正本データへ結び付いたIDや曖昧な履歴では確認しない。UI操作やPOST試行だけを「送信済み」として正本化しない。

## 28.6 実環境の稼働確認と障害時の順序

2026-10-05確認時点でWindows Scheduled Task `ClockRepair-LineManagerSender`は**Running / Enabled**。actionは`powershell.exe -File "C:\Users\yoshi\line-manager-sender-service\start-line-manager-sender.ps1" -AllowSend`、WorkingDirectoryは`C:\Users\yoshi\line-manager-sender-service\runtime`。`runtime\VERSION.txt`は上記Task203E版、ログの場所は`C:\Users\yoshi\line-manager-sender-service\logs`。launcherはUser環境変数の内部API認証tokenをchildへ渡す。値は表示しない。同日時点でstdoutにPOST試行から次cycleで履歴確認に至る正常完了を1件確認し、stderrは空だった。これはその時点の稼働確認であり、現在の全送信の成功保証ではない。

停止・滞留を疑うときは次の順に確認する。

1. Scheduled TaskのstateとEnabledを確認する。
2. Python workerが起動し、single-instance lockにより二重起動していないか確認する。
3. 上記logsのstdout / stderrを確認する。本文や識別子、secretを転記しない。
4. outboxの`APPROVED` / `PRE_SEND_FAILED` / `POST_UNCONFIRMED` / `CONFIRMED`を確認する。`POST_UNCONFIRMED`が1件でもあれば、global guardで後続送信も止まるのでそのreconciliationを最優先する。
5. 最後にlineoaのauth storage / sessionの有効性を確認する。cookieやstorage内容、token値を表示・共有しない。

認証不一致や履歴取得失敗、mapping・文面・`sendId`・windowの不一致は、根拠を揃えるまで送信済みと判定しない。`POST_UNCONFIRMED`を手動で再送する操作は行わない。
