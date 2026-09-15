# CURRENT TASK

## 現在Task

Task169M: in progress

## 目的

B2C請求共有ページを個人顧客向けに整理し、Stripe Hosted Checkoutのsandbox/test modeを接続する。

## Task境界

- B2C共有画面のみ整理
- B2B共有画面は変更しない
- Invoice.grossTotalAmountを支払額の正本とする
- Stripe Hosted Checkoutを使用
- Payment / PaymentAllocation / PaymentAttemptを既存schemaで使用
- success URLだけではSUCCEEDEDにしない
- WebhookはTask170
- PayPayはまだ実装しない
- schema / migrationは原則変更しない

## 次Task

Task170: Stripe Webhook

## 対象外

- Webhook
- refund
- partial payment UI
- B2B決済UI
- PayPay
- Stripe production化
