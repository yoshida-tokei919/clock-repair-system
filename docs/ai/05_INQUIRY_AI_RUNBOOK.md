# Inquiry AI Runbook

## 目的と正本

- Slackは通知チャネルです。問い合わせの正本はSupabaseに保存された`Inquiry`、`InquiryMessage`、`InquiryFile`です。
- ここでいう「LINE全文」は、Supabaseに保存済みの`InquiryMessage`本文全体を指します。LINE APIから過去の会話履歴を後追い取得できる前提は置きません。
- OUTBOUNDメッセージは、送信機能側で`InquiryMessage`として記録されたものだけを対象にします。未保存の手動LINE履歴をAIが補完したものとは扱いません。
- R2 signed URLは、その場で画像を確認するための一時URLです。保存、転記、再配布はしません。

## 起動と対象の決定

- ユーザーの起動語（例:「Slackの新しい問い合わせを確認して」）をInquiry intakeの開始指示として扱います。
- 明示されたInquiry IDがある場合は、そのIDを最優先します。
- Inquiry IDがない場合だけ、pending inquiry APIから対象候補を取得します。

## 読み取り手順

1. 明示Inquiry IDがなければ、`GET /api/internal/inquiry-ai/pending`で未処理候補を取得します。
2. 選択したInquiryについて、`GET /api/internal/inquiry-ai/{id}`を呼び出します。
3. 返却された`InquiryMessage`のLINE全文を改変せずに読みます。時系列は保存作成時刻ではなく、INBOUNDの`receivedAt`、OUTBOUNDの`sentAt`を優先して扱います。
4. 既存Customerへの紐付け済みか、未登録LineUserかを確認します。
5. `InquiryFile`のR2 signed URLは即時確認に限って利用します。

## このTaskの安全境界

- このTaskはread-onlyです。AI分析の保存、Repair作成、正式値の書き込みはまだ行いません。
- 見積りやAI推論を正式値として扱いません。
- secret、Bearer token、その他の認証情報を出力・ログ記録しません。内部APIはローカルWindowsの`N8N_INTERNAL_TOKEN`をBearer tokenとして用いますが、値は表示しません。
- Slack通知にLINE本文を含めません。

## 将来の拡張

将来Phaseでは、この読み取り手順の下流に、明示的なAI分析・人手レビュー・書き戻しの工程を追加できます。原文、正本データ、正式値の境界はそれぞれ分離したまま維持します。
