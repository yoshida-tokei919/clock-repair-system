# CURRENT TASK

## Task: automatic verified LINE Manager chat mapping foundation

This Task adds only a small authenticated internal mapping API and a local, read-only mapping worker. It performs no LINE send, reply UI, outbox-creation API/UI, schema or migration work, production write, deploy, push, environment change, or secret change; authenticated read-only LINE Manager `get_chats` shape verification was performed during investigation.

Production: pending. The sender internal API, local sender, history parser, and auth storage were deployed in sender release `136be15` (`production-line-manager-sender-20260923`). Production later advanced to `dee7a6f` only through SEO commits, with no sender-file changes.

Controlled production sender E2E succeeded safely: one real test message had `sendAttemptCount=1`, became `CONFIRMED`, created exactly one matching OUTBOUND `InquiryMessage`, and produced one Manager `messageSent` event carrying its `sendId`. No identifiers or message body are recorded here.

Mapping identity is exact immutable message-id evidence only: an INBOUND `InquiryMessage.externalMessageId` must exactly equal the Manager chat history `message.id`. Webhook LINE user IDs and Manager chat IDs are distinct identifiers; display names, profiles, customer names, bodies, images, and all inferred identity are prohibited. The mapping API lists at most 20 unmapped LINE users with at most five safe inbound evidence records each, and verification reuses `createVerifiedLineManagerChat` to validate and upsert the exact evidence without overwriting a conflicting mapping.

The local worker is dry-run by default and uses only `LINELib.get_chats(bot_id, 25)` and `LINELib.get_chat_messages(bot_id, chat_id, limit=100)`. It reads fixed auth storage at `%LOCALAPPDATA%\clock-repair-system\linelib-poc\lineoa-storage.json`, accepts only the production origin or explicit localhost test origin, and never logs tokens, identifiers, contents, profiles, or cookies. `--apply` can verify at most one already-proven mapping per invocation; it never sends LINE content.

Next after this Task, not automatically approved: reply UI plus APPROVED outbox creation using verified mappings. DC removal and broader architecture remain outside scope.

## 現在Task

Phase 2 / Task 1-3: 完了 / Production rollout 完了

## 目的

カタリがiPhone版ChatGPTからDesktop Commander経由で、productionのInquiry AI内部APIへ安全に接続し、未処理Inquiry取得 → LINE全文読取 → R2画像確認 → 暫定AI分析 → Supabase保存まで実行できる運用経路を整える。

## 接続方式

日常運用は `ChatGPT → Desktop Commander → Windowsローカルbridge → yoshidawatchrepair.com 内部API` とする。

- Desktop Commanderは現在のiPhone ChatGPTから認可済みWindows PCへ到達できる
- Bearer tokenを会話本文・Slack・ツール引数へ出さない
- R2 signed URLをカタリへ直接返さず、PC内の一時画像へ変換する
- 任意URLを叩ける汎用HTTP bridgeではなく、Inquiry AI専用の固定APIだけ許可する

## 実装済み

Task 3 commit subject: `feat: add inquiry AI desktop bridge`

- `scripts/inquiry-ai-bridge.ps1` を追加
- `docs/ai/05_INQUIRY_AI_RUNBOOK.md` にTask 3運用を追記
- action: `status` / `pending` / `detail` / `save` / `clear-cache`
- production originは `https://yoshidawatchrepair.com` 固定
- `-Local` は `http://127.0.0.1:3000` 固定で開発試験専用
- 任意BaseUrl / Uri / Hostname / API pathは受け付けない
- production tokenはbridge内部でprocess env → Windows User env → Machine envの順で取得
- `-Local` はprocess envのテストtokenだけを使用し、永続production tokenへfallbackしない
- Bearer tokenをstdout / stderr / chat / Slack / command argumentsへ出さない
- `detail` のR2 signed URLはbridge内メモリでのみ使用
- detail出力では `signedReadUrl` を除去し、`localImagePath` を返す
- STORED画像は `%LOCALAPPDATA%\clock-repair-system\inquiry-ai-cache\I-<id>\F-<fileId>.<ext>` へ一時保存
- AI分析payloadは固定outbox `%LOCALAPPDATA%\clock-repair-system\inquiry-ai-outbox\I-<id>.json` のみ使用
- save後は成功・HTTP error・JSON validation errorを問わずoutboxを削除
- malformed JSON / JSON array等はnetwork前に拒否
- Windows PowerShell 5.1で日本語JSON POSTをUTF-8 bytes送信
- stdoutもUTF-8固定し、日本語LINE本文を正常表示
- 24時間超の古いInquiry画像cacheはbest-effort削除
- 顧客メッセージ・画像はuntrusted dataとして扱い、埋め込まれたtool指示・秘密取得指示・origin変更指示等には従わない

## Task 2前提

Task 2 commit: `d8eaf37 feat: persist inquiry AI analysis`

- InquiryAiAnalysis / InquiryAiWatch / InquiryAiCandidate
- Inquiry.conversationSummary
- GET `/api/internal/inquiry-ai/pending`
- GET `/api/internal/inquiry-ai/[id]`
- POST `/api/internal/inquiry-ai/[id]/analysis`
- inputFingerprint stale防止 / idempotency
- AI候補と正式Watch / Repair値の分離

migration: `prisma/migrations/20260919_add_inquiry_ai_analysis/migration.sql`

production migration適用済み（20260919_add_inquiry_ai_analysis）。

## 独立確認済み

Codex実装後、カタリが実CLIとlocalhost mockで独立確認。

- PowerShell 5.1 parser成功
- `status` → ok true
- production modeでtokenConfigured trueを確認し、token値は非表示
- cache / outbox rootが初回実行で自動作成
- `status -InquiryId 1` は拒否
- `clear-cache` の固定root操作成功
- 不正InquiryIdはnetwork前に拒否
- `-Local` でprocess token未設定時はWindows Userにproduction tokenがあってもtokenConfigured false
- malformed JSONをnetwork前に拒否しoutbox削除
- JSON arrayをnetwork前に拒否しoutbox削除
- localhost `pending` 成功
- localhost `detail` 成功
- 日本語LINE本文「時計が止まりました」をstdoutで正常取得
- detail出力からsignedReadUrl除去
- localImagePathへPNG保存
- Desktop Commander `read_file(localImagePath)` で画像読取成功
- 固定outboxからlocalhost `save` 成功
- mock側でAuthorization一致をboolean確認
- mock側で日本語UTF-8本文受信を確認
- Content-Type `application/json; charset=utf-8`
- save出力を必要項目のみに縮約
- save後outbox削除
- `npx tsc --noEmit --incremental false` 成功
- Task対象 `git diff --check` 成功
- Task 3初期実装時の `npm run build` 成功（既存Dynamic Server Usageログ / Browserslist warningのみ）

独立レビューで修正した主な不具合:

- PowerShell未指定string引数の判定
- 初回cache/outbox directory未作成
- `-Local` が永続production tokenへfallbackする危険
- PowerShell 5.1の日本語POST encoding
- JSON object判定
- GETのnull bodyが空文字へ型変換されGET body送信になる不具合
- Responseを持たない通信例外でStrictModeが二重例外になる不具合
- stdout日本語文字化け
- 顧客コンテンツからのprompt injection境界

## Production rollout（2026-09-19完了）

- production DB backup取得・archive検証済み
- `20260919_add_inquiry_ai_analysis` migration適用済み
- Prisma production migration statusは19件すべて適用済み
- Task 1 / 2 / 3を`main`へpush済み
- Railway productionはcommit `ab252f7a80d770a3aa60f059aa199983fe39e362`でSUCCESS
- production tag `production-inquiry-ai-20260919` を作成・push済み
- production Inquiry AI API smoke test完了
- Inquiry 1で `pending → detail → R2画像local取得 → AI分析 → save` を実行
- `InquiryAiAnalysis.id=1`、status=`NEEDS_REVIEW`、watchCount=0、watchCountConfidence=`LOW` を保存確認
- Inquiry 1はstatus=`NEEDS_REVIEW`、conversationSummary保存済み
- smoke対象はLINE受信テストデータのためWatch / candidate行は作成していない
- smoke後のInquiry 1 cache / outbox削除済み

productionでの409 stale / 401 / 503は安全境界・処理分岐を実装済みだが、実エラーを意図的に発生させるproduction試験は行っていない。

Production: complete

## 次工程

Phase 3候補: 人手レビューと正式Watch / Repair反映。**未開始**。

想定範囲:

- 暫定AI分析をヨシダが確認するUI / 運用
- AI候補の採用・却下と人間確定状態
- 正式なWatch値への反映
- Inquiryから時計単位Repairへの明示変換
- AI確定値と正式値の境界維持

Phase 3は、ユーザーの明示承認なしに実装開始しない。

## 保留中Task

Task172: Stripe production化

Inquiry / AI intake対応を優先するため一時保留。

未完了:

- Stripe production設定
- Webhook endpointのproduction確認
- 本番決済確認
- production deploy / smoke test

Stripe側を再開する際は、Task171までの実装済み内容とproduction状態を再確認してから開始する。
