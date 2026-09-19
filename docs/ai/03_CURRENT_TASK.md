# CURRENT TASK

## 現在Task

Phase 2 / Task 1: commit済み / Production pending

## 目的

「Slackの新しい問い合わせ処理して」等の指示を受けたカタリが、未処理Inquiryを特定し、Supabaseに保存済みのLINE会話全文・顧客紐付け状態・R2画像の一時URLを安全に読み取れる基盤を整える。

## 実装済み

commit: `175fb82 feat: add inquiry AI read context`

- `docs/ai/05_INQUIRY_AI_RUNBOOK.md` を追加
- LINE / Slack / AI intake処理時にRunbookを追加参照するよう `AGENTS.md` を更新
- `GET /api/internal/inquiry-ai/pending` を追加
- `GET /api/internal/inquiry-ai/[id]` を追加
- InquiryMessageを実会話時刻順で返却
- STORED済みInquiryFileだけR2 signed URLを発行
- LINE Profile APIから表示名をbest-effort取得
- Slack通知の顧客表示を「既存 / 未登録」で実運用向けに整理
- Slack通知へLINE本文を含めない
- schema / migration変更なし

## 確認済み

- `npx prisma validate` 成功
- `npx tsc --noEmit --incremental false` 成功
- 関連Node test 18件成功
- Task対象 `git diff --check` 成功
- `npm run build` 完走確認
- カタリによる独立差分レビュー実施
- レビュー指摘修正後に再検証済み

## 未確認 / Production

- 実LINE Profile API通信は未確認
- 実R2 signed URLを使ったカタリ画像確認は未確認
- production deploy未実施
- `main`へのpushはRailway production deployを伴うため、ユーザー明示承認なしにpushしない

Production: pending

## 保留中Task

Task172: Stripe production化

Inquiry / AI intake対応を優先するため一時保留。

未完了:

- Stripe production設定
- Webhook endpointのproduction確認
- 本番決済確認
- production deploy / smoke test

Stripe側を再開する際は、Task171までの実装済み内容とproduction状態を再確認してから開始する。

## 次Task

Phase 2 / Task 2: 未開始

InquiryのAI分析・要約側を進める。

開始前にNotion正本「LINE問い合わせ自動化・AI時計識別 要件定義（2026-09-18）」と現行schema/APIを再確認し、以下をTask境界として具体化する。

- LINE全文から問い合わせ概要・依頼内容・症状・要望・不足情報を構造化
- 時計を個体ごとに分離
- 画像から時計情報候補を抽出
- CUSTOMER_STATED / IMAGE_OBSERVED / WEB_INFERRED / AI_INFERRED / TECHNICIAN_CONFIRMED 等の情報出所を区別
- confidence / evidence / observedText / sourceImageIds を保持
- LINE原文とAI分析結果を別データとして保持
- 人間確定値をAIが上書きしない
- Repair作成・正式時計情報書込みは、Task 2の設計確認なしに開始しない
