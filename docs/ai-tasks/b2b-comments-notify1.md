# B2B-COMMENTS-NOTIFY1 — 工房コメントの取引先LINE通知

## 範囲

- 管理者がB2B修理案件へコメントを保存したとき、`RepairCustomerMessage` と検証済み取引先向け `LineManagerSendOutbox` を同一トランザクションで作る。
- 宛先は `Repair.customerId` と一致する、唯一の確認済み `LineUser` / `LineManagerChat` のみ。宛先未確認・曖昧な場合もコメントは保存し、通知は利用不可と表示する。
- 通知本文はロックしたRepairの案件番号、短いコメント返信案内、別行の共有ページ絶対URL。保存したコメント本文はLINEへ含めない。`APPROVED` は送信待ち、`CONFIRMED` のみ送信確認済みと扱う。
- 旧 `/api/repairs/[id]/messages` POST は同じ保存経路へ委譲し、旧Messaging Pushを停止する。
- 共有ページはトークンで閲覧可能な案件内のコメントIDのみを直リンク対象にする。対象の時計を開き、コメントへスクロールして強調する。

## 次Task

工房本人宛の取引先コメント受信通知は別Task。工房LINEが個人Customer Inquiryに紐づく現状を踏まえ、顧客履歴の混在を避ける宛先・通知方式を別途設計する。

## 状態

Production: pending。実LINE送信・本番DB操作・deployは未実施。
