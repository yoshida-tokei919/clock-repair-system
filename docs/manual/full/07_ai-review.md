# 第7章 AI分析・受付レビュー

## 7.1 現在のAI処理方式

現在のInquiry AI分析は、n8nが自動でAIへ問い合わせる方式ではない。

Slack通知等で新しいInquiryを確認した後、カタリがローカルの `scripts/inquiry-ai-bridge.ps1` を使用して、productionの内部APIから対象Inquiryを取得し、画像を確認し、暫定分析を保存する。

```text
新規Inquiry
    ↓
Slack通知
    ↓
カタリへ確認指示
    ↓
inquiry-ai-bridge.ps1 pending / detail
    ↓
保存済みLINE全文・画像を取得
    ↓
AI暫定分析
    ↓
inputFingerprint付きでsave
    ↓
Inquiry AI analysis = PENDING
    ↓
管理画面で人がレビュー・確定
```

## 7.2 bridgeの役割

bridgeはproduction内部APIとの安全な窓口であり、主な操作は次の5種類である。

- `status`: 接続モードや必要設定の有無を確認
- `pending`: 未処理Inquiry候補を取得
- `detail`: Inquiry全文と画像を取得
- `save`: 構造化したAI暫定分析を保存
- `clear-cache`: 一時画像cacheを削除

認証には `N8N_INTERNAL_TOKEN` を使用するが、値をコマンド引数、チャット、Slack、マニュアルへ表示しない。

## 7.3 画像確認

`detail` 実行時、内部APIから短時間有効なR2署名URLを受け取り、bridgeが画像をローカル一時cacheへダウンロードする。

カタリが確認するのは `localImagePath` であり、署名URL自体は出力データから除去される。

一時cacheは `%LOCALAPPDATA%\clock-repair-system\inquiry-ai-cache` 配下に置かれ、古いcacheは整理される。

## 7.4 AIが作るもの

AI分析は正式データではなく、受付レビュー用の暫定情報である。

例:

- 会話全体の要約
- 問い合わせ内の時計本数
- ブランド候補
- モデル候補
- 商品Ref候補
- ケースRef候補
- Cal.候補
- Base Cal.候補
- 駆動方式や年代等の候補
- 不具合候補
- 顧客の希望作業
- 不足情報
- 不足写真
- 各候補の確信度
- 根拠・観測内容

AI候補をそのままBrand / Model / Caliber等の正式masterへ登録しない。

## 7.5 stale分析を保存しない仕組み

`detail` で取得したInquiryには `inputFingerprint` が含まれる。

分析中に新しいLINEメッセージや画像が追加され、入力内容が変わった場合、古いfingerprintによる保存は409で拒否される。

```text
Inquiry取得
    ↓
inputFingerprint=A
    ↓
分析中に新しいLINE受信
    ↓
現在fingerprint=B
    ↓
Aの分析をsave
    ↓
409 stale → 保存しない
    ↓
最新Inquiryを取り直して再分析
```

古い会話だけを見たAI結果で最新情報を上書きしないための仕組みである。

## 7.6 Inquiryレビュー画面

レビュー画面のURLは `inquiries/[id]/review` である。認証済み管理者のみ利用する。

画面上部では以下を確認する。

- Inquiry番号
- 会話要約
- 「問い合わせ対応開始」タイマー
- LINEやり取り
- B2C受付判断
- 時計ごとの確認状態

![Inquiry review](../assets/screenshots/inquiry-review-full.png)

## 7.7 時計ごとの確認

Inquiry内の各時計は `InquiryWatch` として確認する。

AI由来の候補と、人が確定した受付前データを分離して保存する。時計ごとに次の情報を確認できる。

- 未確認・不足情報
- 不足写真
- 不具合候補
- 依頼内容
- ブランド
- モデル
- Ref
- ケースRef
- Cal
- Base Cal
- その他の候補項目

## 7.8 AI候補・根拠・確信度

各フィールドには、AI候補がある場合「AI候補・根拠」を展開して確認できる。

候補値だけでなく、確信度、情報源、根拠、観測文字列等を見て判断する。

AI候補をクリックすると入力値へ反映できるが、その時点ではまだ正式確定ではない。

## 7.9 「この値を確定」

確認した値は「この値を確定」でCONFIRMEDにする。

確定済みの値や手入力値はAI再解析から保護される。逆に、未確定のAI候補は再解析で更新される可能性がある。

必要に応じて「未確定に戻す」こともできる。

## 7.10 正式masterの選択と新規登録

ブランド、モデル、Ref、ケースRef、Cal、Base Calは、既存masterを選択して正式なIDへ接続する。

AI文字列をそのままmasterとして自動登録しない。

未登録の場合は「新規○○として登録」を押し、登録内容を人が確認した後に明示登録する。既存の完全一致候補がある場合は新規作成せず既存masterへ接続する。

## 7.11 B2C受付判断

時計ごとに次の判断を保存する。

- 保留
- 受付希望
- お断り

受付リンクを発行できるのは、必要な確認を終えた `受付希望` の未案件化時計である。

## 7.12 この章のスクリーンショット

詳細版では最低3枚を使用する。

1. `inquiry-review-full.png` — 画面全体
2. `inquiry-review-watch.png` — AI候補・根拠・確定操作
3. `inquiry-review-line.png` — LINE履歴、分類、送信状態

画像には「AI候補」と「正式値」の境界が分かる色付き注釈を入れる。
