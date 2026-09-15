# CURRENT TASK

## 現在Task

Task172: in progress

## 目的

Stripe本番運用へ向けたproduction設定・Webhook endpoint・本番決済確認を安全に進める。

## 前Task

Task171: 完了

確認済み:

- B2C請求一覧でPaymentAllocationベースの支払状態表示
- Stripe支払済み → 入金済み表示
- 銀行振込手動入金登録
- 管理詳細で支払額・残高・支払方法・入金日時表示
- 支払Allocationあり請求書の取消ボタン非表示
- B2C共有ページで支払済み表示
- 支払済み時はオンライン決済・銀行振込案内を非表示
- 銀行振込時も「お支払い状況」として正しく表示
- お支払い額（税込）を表示
- npx tsc --noEmit --incremental false 成功
- invoice-payment.test.ts 21件成功
- 実画面確認成功

## 次Task

Task172: Stripe production化
