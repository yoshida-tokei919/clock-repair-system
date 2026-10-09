# 第2章 全体業務フローとシステム構成

## 2.1 受付から納品までの業務フロー

```text
顧客からLINE問い合わせ
        ↓
Inquiry / InquiryMessage / 画像保存
        ↓
AI暫定分析 → 人が受付レビュー
        ↓
受付希望の時計を確定
        ↓
顧客用受付リンクを発行・LINE案内
        ↓
顧客が住所・返送先等を入力して送信
        ↓
Watch / Repair作成（送付待ち）
        ↓
顧客が時計を発送 → 工房へ現物到着
        ↓
Repairを「受付」へ変更
        ↓
PhysicalTag発行・保管場所登録
        ↓
見積作成
        ↓
顧客承認
        ↓
必要に応じて部品発注・部品待ち
        ↓
Scheduler / 今日の作業
        ↓
PhysicalTag scan → タイマー → 修理作業
        ↓
ランニングテスト・作業完了
        ↓
管理者がLINE作業完了連絡を確認・送信
        ↓
顧客が配達希望日時を回答
        ↓
Shipment作成・発送予定
        ↓
PhysicalTag連続scanで梱包照合
        ↓
ゆうプリR CSV → 送り状発行・現物引渡し
        ↓
発送履歴CSVをread-only preview
        ↓
[後続実装] 日本郵便の実引受を確定・追跡番号を保存
        ↓
[後続実装] LINE発送通知
        ↓
[後続実装] 配達完了を確定 → Repair納品済み連携
```

現行のゆうプリR連携は、V3 CSV出力と`/shipments`から使える発送履歴CSVのread-only previewまでである。Task202Bで公式配送status codeの組の説明、Task202CでShipment現在値と候補の画面比較が加わったが、追跡番号・実発送日時・配達完了日時・Shipment / Repair statusは書き戻さない。上図の`[後続実装]`部分はTask204等の範囲であり、現在使える操作として扱わない。

## 2.2 「送付待ち」と「受付」の違い

B2C Inquiry起点では、Repairは時計現物が届く前に作成される。

顧客が受付リンクを送信した時点で、正式なCustomer / Watch / Repairを作成し、Repair statusを `送付待ち` とする。この段階の `receptionDate` は未設定である。

時計現物が工房へ到着した後、Repairを `受付` へ変更する。

この2段階により、「受付情報は登録済みだが未着」と「工房が現物を受領済み」を区別する。

## 2.3 データの中心はRepair

Repairは修理案件の中心であり、次の情報を接続する。

- Customer / Watch
- Inquiry起点情報
- RepairLineItem
- 見積・承認
- WorkTimeSession / RepairWorkPlan / Scheduler
- PhysicalTag / StorageLocation
- LINE会話
- Shipment

ただし、各情報をRepairの1テーブルへ詰め込むのではなく、役割別のデータとして分離している。

## 2.4 主要システム構成

```text
[顧客 LINE]
     │ inbound webhook
     ▼
[Next.js アプリ / Railway] ────── [Cloudflare R2]
     │                              画像・ファイル
     │
     ▼
[Supabase / PostgreSQL]
     ▲
     │ internal API
     │
[Windowsローカル n8n 2.19.5]
     │
     ├─ LINE Inbox Processor → LINE Manager mapping
     └──────────────→ [Slack]

[管理画面]
     │ 明示送信操作
     ▼
[LineManagerSendOutbox]
     ▼
[ローカル LINE Manager sender]
     ▼
[lineoa / LINE Official Account Manager]
     ▼
[LINE Manager履歴照合]
     ▼
CONFIRMED → OUTBOUND InquiryMessage

[カタリ / inquiry-ai-bridge.ps1]
     │ 明示実行
     ▼
[Inquiry AI暫定分析]
```

LINE通常トーク送信ではMessaging API Pushを正本にせず、OutboxとManager履歴照合を使う。

## 2.5 n8nの位置付け

n8nはローカル自動化基盤として利用する。アプリの正本データはSupabase側に置き、n8n自身を案件データの正本にはしない。

2026-10-04確認時点ではDockerではなく、Windowsローカルのn8n 2.19.5を使用している。Windowsタスクスケジューラ `YoshidaClockRepair-n8n` がログオン時に `C:\Users\yoshi\n8n-service\start-n8n.ps1` を起動する。

2026-10-08のactivation記録では、主要なactive workflowは3本である。

1. `LINE Inquiry Inbox Processor` — 1分ごとにLINE Webhook Inboxの後処理APIを呼ぶ。
2. `Slack Notification Outbox Processor` — 1分ごとにSlack通知Outboxをclaimし、Slack投稿後にsent / failedをアプリへ返す。
3. `LINE Manager Mapping Processor` — Inboxでメッセージを処理した後と定期health checkで、保存済みINBOUND message IDとManager履歴のexact IDを照合する。LINE送信はしない。

AI暫定分析とLINE Manager通常トーク送信はn8nの役割ではない。

内部APIでは `N8N_INTERNAL_TOKEN` を利用するが、token値はマニュアル・ログ・Slack・画面キャプチャへ載せない。

詳細は第29章「n8n連携」で説明する。

## 2.6 AI処理の位置付け

現在のInquiry AI分析は、n8nによる完全自動処理ではない。

新規Inquiryを確認した後、カタリが `scripts/inquiry-ai-bridge.ps1` を使用して保存済みLINE全文と画像を取得し、暫定分析を作成する。

AI分析にはinputFingerprintを使用し、分析中に新しいメッセージや画像が増えた場合は古い分析の保存を409で拒否する。

AI候補は正式値ではなく、人がInquiryレビュー画面で確認・確定する。

## 2.7 LINE送信の安全ロジック

```text
管理画面で送信内容を確認
        ↓
APPROVED Outboxを作成
        ↓
local senderがclaim
        ↓
fence成功
        ↓
lineoa経由でLINE Managerへ1回POST
        ↓
送信直後は「送れた」と決めつけない
        ↓
LINE Manager履歴を取得
        ↓
送信先・本文・sendId・時刻等を照合
        ↓
一致した場合だけCONFIRMED
        ↓
実際のManager message IDを持つ
OUTBOUND InquiryMessageを作成
```

`APPROVED` は送信待ちであり送信成功ではない。`CONFIRMED` を実送信確認済みの状態として扱う。

## 2.8 外部サービスとの境界

- Supabase: PostgreSQLの正本データ
- Railway: Next.jsアプリのproduction実行環境
- Cloudflare R2: 問い合わせ画像等のファイル保存
- Slack: 通知用。問い合わせ本文の正本ではない
- LINE Official Account / LINE Manager: 顧客との会話
- lineoa: 現行LINE Manager通常トーク送信系で使用するローカルライブラリ
- n8n: Windowsローカルの定期処理・mapping起動・Slack連携
- inquiry-ai-bridge / カタリ: Inquiry AI暫定分析の明示実行
- ゆうプリR: 日本郵便送り状作成と発送履歴連携
- Brother QL-800: PhysicalTag修理袋ラベル印刷

## 2.9 全体図

システム全体の役割分担は次の図で確認する。

![システム全体構成](../assets/diagrams/system-architecture.svg)

受付・LINE・AI・発送準備・外部サービスの責任境界は第3章「システム構成とデータの流れ」で詳しく説明する。
