# Task206H5 — AI / n8n / Playwright / OpenClaw 役割再整理

Date: 2026-10-10
Status: docs-only decision record
Production: pending / runtime changeなし

## 目的

Task206H1〜H5のPoCを進めた結果として整理できた、AI・n8n・Playwright・OpenClaw・H1の役割分担と、今後の自動化方針を記録する。

この文書は「OpenClawで何でも実行する」ことを目的にしない。固定実装前のAI汎用性を活かしつつ、安定した処理は適切な実装レイヤーへ段階的に固定化するための判断基準を残す。

## 会話から確定したこと

### 1. H1の本来の役割

H1 reply bridgeは単なるLINE送信APIではない。

- Messaging API Pushを通常運用で使うと無料枠200通/月を消費するため、既存のLINE Official Account Manager通常トーク送信基盤へ接続する専用経路として残す。
- stale送信、二重送信、APPROVEDとCONFIRMEDの混同を防ぐ安全装置でもある。
- OpenClawを導入してもH1を置き換えない。
- LINE実送信はH1の既存通常トーク経路を正本とする。

### 2. OpenClawをH1の前段に置く意味

OpenClawをH1の前段に置けば、案件・会話・外部画面を見て判断し、返信内容や次の処理を組み立てたうえでH1へ渡せる。

ただし、OpenClaw自身にLINE送信を自由実行させる設計にはしない。判断・情報収集と、重要な送信実行を分離する。

### 3. AI判断とOpenClawは別物

自然言語や文脈判断が必要でも、OpenClawが必須とは限らない。

- LINE本文やメール本文をWebhook / DB / APIで取得できる場合、内容理解・分類・要約・返信案はAIだけで処理可能。
- APIやDBから構造化データを取れる場合、AIへそのデータを渡して判断させればよい。
- OpenClawが必要なのは、AI判断に加えて、その場で画面を見ながら次の操作先や手順を変える必要がある場合。

### 4. 固定処理はn8n / API / Playwrightを優先

- API / DB / コード: 構造化データ取得、厳密な計算、状態更新。
- n8n: Webhook、定期処理、固定条件分岐、機械的な配管。
- Playwright: 手順と画面構造が決まっているブラウザ操作。ゆうプリクラウド等。
- AI: 自然言語理解、文脈判断、要約、分類、返信案。
- OpenClaw: AI判断 + 臨機応変なUI操作が両方必要な業務。
- H1 / 専用Bridge: LINE通常トーク送信、決済等の安全制御が必要な重要操作。

## 今回の重要な気付き

固定ルールで処理できる業務でも、そのAPI・n8n workflow・Playwright処理を実装するまでは利用できない。

その実装待ち期間を、AIの汎用性で埋められる。

例:

1. 案件画面や汎用DOM / accessibility snapshot等をAIへ渡す。
2. AIが「どの表示がブランド、Ref、Cal、status、予定日か」を意味として理解する。
3. まずAIで実務を仮運用する。
4. 実際の利用から頻出パターン、安定した条件分岐、必要項目を確認する。
5. 固まった処理だけAPI / n8n / Playwrightへ移す。
6. 例外・曖昧判断だけAIへ残す。

つまり、AIは最終ロジックだけでなく「固定実装前の暫定業務ロジック」としても使える。

## H1〜H5の意味の再整理

- H1: LINE Push 200通/月を避け、通常トークで安全に送信する専用Bridge。
- H3 / H4: AIへ手足を持たせ、カタリからOpenClawへ依頼し、結果を戻せることを確認。
- H5A: Slack → n8n → OpenClaw経路を即時化し、実用速度へ近づけた。
- H5B: 実際の業務アプリをread-onlyでAIが扱えるか確認する実業務PoC。
- H5BのRepair情報取得は、将来もOpenClawを正本のread手段にするという意味ではない。構造化データの恒久取得はAPI / DB / n8nを優先する。
- H5C以降はOpenClawありきで進めず、必要な業務ユースケースを棚卸ししてからTask API等の必要性を判断する。

## 判断フロー

```text
固定ルールだけで処理できる？
  yes -> API / code / n8n
  no  -> AI判断が必要？
          yes -> AI

ブラウザ操作が必要？
  手順固定 -> Playwright
  判断しながら操作先や手順が変わる -> AI + OpenClaw

重要操作？
  LINE通常トーク / 決済 / 高リスク更新 -> 専用Bridge / API + 明示承認
```

## 開発方針

今後は「最初から全ルールを実装する」ことを前提にしない。

```text
AIで仮運用
-> 実際の使い方を観察
-> 頻出・決定的な処理を固定実装
-> 例外・曖昧判断だけAIへ残す
-> 判断 + 臨機応変なUI操作が必要な部分だけOpenClaw
```

Task206H5までの流れは間違いではなかった。H5Bによって、OpenClawのread-only業務操作だけでなく「未実装業務をAIで先に利用できる」という汎用性を確認できた。

## 次の判断ポイント

H5Cを自動的に開始しない。

先に時計修理業務の自動化候補を棚卸しし、各候補について以下を決める。

- 固定処理で足りるか
- AI判断が必要か
- ブラウザ操作が必要か
- Playwrightで決定的に処理できるか
- OpenClawの臨機応変なUI操作が本当に必要か
- 専用Bridge / 明示承認が必要な高リスク操作か
- まずAI仮運用で価値確認してから固定実装する方がよいか

## 変更範囲

- docs-only
- schema / migration / RLS / GRANT変更なし
- production DB変更なし
- LINE実送信なし
- deployなし
