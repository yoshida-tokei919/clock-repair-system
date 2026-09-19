# CURRENT TASK

## 現在Task

Phase 2 / Task 2: 実装・独立レビュー完了 / Production pending

## 目的

Supabaseに保存済みのInquiryMessage / InquiryFileを正本として、カタリがLINE会話・画像から作成した暫定AI分析を、原文や正式なWatch / Repair情報と分離した状態で安全に保存できる基盤を整える。

## 実装済み

commit subject: `feat: persist inquiry AI analysis`

- Inquiryへ最新 `conversationSummary` を追加
- AI分析snapshot用の `InquiryAiAnalysis` / `InquiryAiWatch` / `InquiryAiCandidate` を追加
- AI候補で以下を区別
  - BRAND
  - MODEL
  - PRODUCT_REF
  - CASE_REF
  - CALIBER
  - MOVEMENT_TYPE
  - ERA
- confidence / evidence / observedText / sourceMessageIds / sourceImageIds / reviewStatus を保持可能
- CUSTOMER_STATED / IMAGE_OBSERVED / WEB_INFERRED / AI_INFERRED / TECHNICIAN_CONFIRMED のsource typeをschemaへ追加
- Phase 2のAI書込みAPIでは `reviewStatus=PENDING` のみ許可
- Phase 2のAI書込みAPIでは `TECHNICIAN_CONFIRMED` を拒否
- CUSTOMER_STATED は実際のINBOUND InquiryMessageを根拠として必須化
- IMAGE_OBSERVED はSTORED済みInquiryFileを根拠として必須化
- `GET /api/internal/inquiry-ai/[id]` に `inputFingerprint` を追加
- `POST /api/internal/inquiry-ai/[id]/analysis` を追加
- inputFingerprint不一致時は409で保存拒否
- idempotencyKeyでAI分析の二重保存を防止
- AI入力snapshotはサーバー側で生成
- LINE本文はAI snapshotへ二重保存せず、本文hashのみ保持
- AI fingerprint / snapshotの画像対象はSTORED済みInquiryFileのみ
- signed R2 URLはsnapshotへ保存しない
- LINE受信処理とAI分析保存で同一LineUser単位のPostgreSQL advisory lockを共有
- fingerprint再確認をlock取得後・保存直前に行い、新着LINEとの競合による古い分析保存を防止
- AI_PROCESSED後に新着LINEが来た場合は同じInquiryを再利用しAI_PENDINGへ戻す
- NEEDS_REVIEWは新着LINE後もNEEDS_REVIEWを維持
- CLOSED Inquiryは再利用しない
- 複数active Inquiry時に選択したNEEDS_REVIEWのlastReceivedAtを更新
- COMPLETED / NEEDS_REVIEWでは最新conversationSummaryを必須化
- FAILEDでは既存conversationSummaryを消さない
- `docs/ai/05_INQUIRY_AI_RUNBOOK.md` をTask 2仕様へ更新
- Repair作成・正式Watch値・master値・人手確認済み値への書込みは未実装

## migration

追加migration:

`prisma/migrations/20260919_add_inquiry_ai_analysis/migration.sql`

内容:

- AI分析用enum追加
- `Inquiry.conversationSummary` のnullable追加
- `InquiryAiAnalysis` / `InquiryAiWatch` / `InquiryAiCandidate` の新規追加
- index / FK追加
- destructive SQLなし

重要:

- production migration未適用
- `prisma migrate dev` 未実行
- `prisma migrate deploy` 未実行
- `prisma migrate resolve` 未実行
- `prisma db push` 未実行
- production DB変更なし

## 確認済み

- Notion正本「LINE問い合わせ自動化・AI時計識別 要件定義（2026-09-18）」再確認
- Codexが実装
- カタリが独立差分レビュー
- 独立レビュー指摘をCodexが修正
- カタリが最終差分レビュー
- `npx prisma validate` 成功
- `npx prisma generate` 成功
- `npx tsc --noEmit --incremental false` 成功
- 関連Node test 23件成功
- Task対象 `git diff --check` 成功
- `npm run build` exit code 0
- build時に既存 `/api/repairs/recent` のDynamic Server Usageログが出るが、build自体は正常完走し今回差分外
- Browserslist data-age warningのみ

## 未確認 / Production

- production migration未適用
- production deploy未実施
- 実環境の `POST /api/internal/inquiry-ai/[id]/analysis` 未確認
- 実Inquiryを使った「読取 → R2画像確認 → AI分析 → 保存」の一連smoke test未実施
- ChatGPT側からproduction内部APIへ安全に接続する実運用経路は次Taskで確認が必要
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

Phase 2 / Task 3: 未開始

実運用でカタリがInquiryを読み取り、画像確認・AI分析・保存まで実行できる接続経路と運用フローを確定する。

候補境界:

- ChatGPT側からproductionのInquiry AI内部APIへ安全にアクセスする方式の確認
- Bearer tokenを会話本文・Slack・ログへ露出させない認証経路
- 実Inquiryでpending取得 → detail取得 → R2画像確認 → AI分析 → POST保存の一連確認
- stale 409時の再取得・再分析フロー確認
- NEEDS_REVIEW時の表示と人手確認導線の整理
- Phase 3のRepair作成・正式値反映はTask 3で勝手に開始しない
