# Inquiry AI Runbook

## Task 2: structured analysis write

- Task 2 permits Katari to save only structured, provisional analysis through `POST /api/internal/inquiry-ai/{id}/analysis`, using the same internal Bearer authentication as the read APIs.
- `InquiryMessage` and `InquiryFile` remain immutable source records. The server generates the saved input snapshot from current message/file IDs, timestamps, statuses, and relevant input data; it never trusts a client-provided snapshot.
- Read context includes `inputFingerprint`. Katari must send it back unchanged. If messages or stored image inputs changed, the API returns `409` and writes nothing; fetch fresh context and analyze again.
- Candidates are provisional snapshots, never formal Watch or Repair values, and cannot create or update master records. The AI endpoint can only write `PENDING` review status and cannot claim `TECHNICIAN_CONFIRMED`; human confirmation and formal writes are Phase 3 and out of scope.
- After a successful save, ChatGPT displays the summary, watch count, per-watch candidates, faults, requested work, missing information/photos, and confidence/evidence.
- Never expose the Bearer token or signed R2 URLs in prompts, logs, Slack, or user-visible output.

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

- `InquiryMessage`/`InquiryFile`の原文・原画像データは読み取り専用で不変です。Task 2で許可される書き込みは、最新のinputFingerprintに基づく暫定AI分析のPOST保存だけです。Repair作成、正式なWatch/master値、人手確認済みの書き込みはPhase 3まで禁止し、AIは候補の承認・却下や技術者確認を主張できません。
- 見積りやAI推論を正式値として扱いません。
- secret、Bearer token、その他の認証情報を出力・ログ記録しません。内部APIはローカルWindowsの`N8N_INTERNAL_TOKEN`をBearer tokenとして用いますが、値は表示しません。
- Slack通知にLINE本文を含めません。

## 将来の拡張

Phase 3では、人手レビューと正式なWatch/Repair値への書き戻しを追加します。以後のPhaseで、承認済みの送信メッセージを扱います。原文、正本データ、暫定AI分析、正式値の境界は分離したまま維持します。
