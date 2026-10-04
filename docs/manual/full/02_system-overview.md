# 第2章 全体業務フローとシステム構成

## 2.1 受付から納品までの業務フロー

```text
顧客からLINE問い合わせ
        ↓
Inquiry / InquiryMessage / 画像保存
        ↓
AI暫定分析 → 人が受付レビュー
        ↓
時計受領・Watch / Repairへ案件化
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
ゆうプリR CSV → 送り状・発送履歴
        ↓
日本郵便の引受・追跡・配達完了
        ↓
Repair納品完了
```

後半の「日本郵便引受 → LINE発送通知 → 配達完了 → Repair納品済み」はTask202/204の完成状況に合わせて更新する。

## 2.2 データの中心はRepair

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

## 2.3 主要システム構成

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
     │ internal API / automation
     │
[ローカル n8n 等の自動化]
     │
     ├──────────────→ [Slack]
     │
     └─ LINE送信系とは役割を分離

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
```

LINE通常トーク送信ではMessaging API Pushを正本にせず、OutboxとManager履歴照合を使う。
## 2.4 n8nの位置付け

n8nはローカル自動化基盤として利用する。アプリの正本データはSupabase側に置き、n8n自身を案件データの正本にはしない。

内部APIでは `N8N_INTERNAL_TOKEN` を利用する領域があるが、token値はマニュアル・ログ・Slack・画面キャプチャへ載せない。

このマニュアルでは、実際に稼働しているローカルn8nコンテナを確認したうえで、次を図解する。

- workflow一覧と役割
- 起動条件 / polling間隔
- 呼び出す内部API
- Slack通知との接続
- 成功時・失敗時の分岐
- retryの有無
- アプリ側のどの状態を正本とするか

ノード名やworkflow IDは推測で書かず、実コンテナ確認後に確定する。

## 2.5 LINE送信の安全ロジック

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

## 2.6 外部サービスとの境界

- Supabase: PostgreSQLの正本データ
- Railway: Next.jsアプリのproduction実行環境
- Cloudflare R2: 問い合わせ画像等のファイル保存
- Slack: 通知用。問い合わせ本文の正本ではない
- LINE Official Account / LINE Manager: 顧客との会話
- lineoa: 現行LINE Manager通常トーク送信系で使用するローカルライブラリ
- n8n: ローカル自動化・連携処理
- ゆうプリR: 日本郵便送り状作成と発送履歴連携
- Brother QL-800: PhysicalTag修理袋ラベル印刷

## 2.7 印刷版の図解方針

最終PDFでは上記text図をそのまま使用せず、カラーのフロー図へ置き換える。図の原本は `assets/diagrams/` へ置き、詳細版と簡易版で再利用する。