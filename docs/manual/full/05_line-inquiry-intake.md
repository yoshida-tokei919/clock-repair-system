# 第5章 LINE問い合わせ受付

## 5.1 この章の目的

B2CのLINE問い合わせが届いてから、アプリ上のInquiryとして保存され、管理画面とSlackで確認できる状態になるまでを説明する。

重要な点は、LINEから届いたデータをn8nが直接正本化するのではなく、まずRailway上のNext.jsアプリがLINE Webhookを受け、署名を検証したうえでSupabaseへ保存することである。

## 5.2 全体フロー

```text
顧客がLINE送信
    ↓
LINE Platform
    ↓ Webhook
Next.js /api/line/webhook
    ↓ x-line-signature検証
LineWebhookInboxへ保存
    ↓
n8n「LINE Inquiry Inbox Processor」
    ↓ 1分ごと
/api/internal/line-inbox/process
    ↓
LineUser / Inquiry / InquiryMessageを作成・更新
    ↓
画像の場合はLINEから画像取得 → WebP変換 → Cloudflare R2保存
    ↓
SlackNotificationOutboxを作成
    ↓
n8n「Slack Notification Outbox Processor」
    ↓
Slackへ新規問い合わせ通知
```

## 5.3 LINE Webhookで最初に行うこと

LINE Webhookの受信口は `/api/line/webhook` である。

受信時はJSONへ変換する前の生bodyを使用し、`x-line-signature` と `LINE_CHANNEL_SECRET` によるHMAC-SHA256署名検証を行う。署名が正しくない場合は保存処理へ進まない。

保存対象のイベントは現在次の4種類である。

- message
- follow
- unfollow
- postback

WebhookイベントにはLINEの `webhookEventId` を保持し、重複イベントはDB側で重複保存しない。

この段階では問い合わせ本文を業務データへ展開せず、まず `LineWebhookInbox` に `RECEIVED` として安全に受け止める。

## 5.4 n8nによるInbox後処理

ローカルn8nの `LINE Inquiry Inbox Processor` が1分ごとに内部APIを呼び出す。

```text
Every Minute
    ↓
POST https://yoshidawatchrepair.com/api/internal/line-inbox/process
```

内部APIは `N8N_INTERNAL_TOKEN` のBearer認証を要求する。token値はマニュアル・画面キャプチャ・ログへ記載しない。

1回の呼出しでは最大20件をclaimする。処理中のまま10分以上経過した項目は再取得対象となり、最大試行回数は5回である。

## 5.5 LineUserとInquiryの作成

messageまたはfollowイベントにLINE user IDが含まれる場合、`LineUser` を作成または更新する。

既存Customerの `lineId` と完全一致するCustomerが1件だけ存在する場合は、そのCustomerを候補として自動リンクできる。複数Customerが同じLINE IDを持つ場合は自動リンクしない。

テキストまたは画像メッセージでは `InquiryMessage` を作成する。LINE側のmessage IDを `externalMessageId` として保持し、同じメッセージを二重作成しない。

同じLineUserに処理中Inquiryが1件だけ存在する場合は、そのInquiryへ追加する。複数のactive Inquiryが競合する場合等は、誤った問い合わせへ勝手に統合せず `NEEDS_REVIEW` を利用して人の確認へ回す。

## 5.6 テキストメッセージ

テキストメッセージは `InquiryMessage` に以下の考え方で保存する。

- direction: INBOUND
- messageType: TEXT
- body: 顧客が送った本文
- receivedAt: LINEイベント時刻を優先
- externalMessageId: LINE message ID

顧客の原文は正本データであり、AI要約や後続の編集で上書きしない。

## 5.7 画像メッセージ

画像メッセージでは、まず `InquiryMessage` をIMAGEとして保存した後、LINE Content APIから画像本体を取得する。

受信可能サイズは最大20MB。画像はSharpで回転補正し、縦横3000px以内・拡大なし・WebP品質85へ変換する。

変換後の画像本体はCloudflare R2へ保存し、DBの `InquiryFile` にはR2上の保存先、mime type、容量、幅、高さ、保存状態等を記録する。

画像保存が完了していない場合は「保存済み」と扱わない。失敗時はFAILEDとして残し、再処理できる設計になっている。

## 5.8 Slack通知の作成

LINE本文をそのままSlackへ流すのではなく、アプリ側で `SlackNotificationOutbox` を作成する。

通知種別は状況により次のように分かれる。

- NEW_INQUIRY
- IMAGE_ADDED
- INQUIRY_UPDATED
- NEEDS_REVIEW
- INBOX_PROCESSING_FAILED

通常の問い合わせ通知には、Inquiry番号、既存顧客か未登録LINEユーザーか、受信メッセージ件数、保存画像件数、Inquiry status等を含める。LINE本文そのものをSlackの正本にはしない。

## 5.9 エラーと再試行

Inbox処理に失敗した場合、`LineWebhookInbox` はFAILEDとなり、後続のn8n実行で再試行される。

最大試行回数へ到達した場合は `INBOX_PROCESSING_FAILED` のSlack通知Outboxを作り、受信済みLINEデータ自体は削除せず調査できる状態を維持する。

## 5.10 操作時に見る画面

日常運用では、LINE Webhookやn8nを直接操作する必要はない。

1. Slackの新規問い合わせ通知を確認する。
2. 管理画面のInquiry一覧を開く。
3. 対象Inquiryの「時計情報の確認」画面を開く。
4. LINE本文・画像・AI分析を確認する。

`[画面画像予定: inquiry-list.png]`

![LINE conversation](../assets/screenshots/inquiry-review-line.png)

### 印刷版の注釈予定

- ① Inquiry番号
- ② LINEやり取り
- ③ 受信画像
- ④ 送信待ち / 送信済み表示
- ⑤ お客様へのLINE返信欄
- ⑥ 時計情報確認エリア
