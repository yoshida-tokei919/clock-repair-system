# B2B-COMMENTS-UI1 — 案件別コメントUIと共通ディープリンク

## 対象

- 工房側の案件詳細「LINE」タブを通常LINEトークと案件コメントに分ける。
- 管理者認証のある軽量コメント画面 `/repairs/{repairId}/comments` を設け、デスクトップでは既存案件のLINEタブへ誘導する。
- B2B `Repair` に `Inquiry` の紐付けがなくても案件コメントを利用可能とする。
- コメントは既存 `RepairCustomerMessage` に保存。新テーブル・migrationは不要。
- コメント閲覧・返信 API は管理者限定。コメント表示時に当該案件の表示済み取引先メッセージだけ既読化する。
- 案件一覧の未読コメント通知から該当コメントへ開けるようにする。

## このTaskでは行わないこと

- LINE通常トークでの自動通知、宛先選定、LINE実送信、送信再試行、管理者本人向け通知。
- 旧 `/api/repairs/[id]/messages` に残るMessaging API Push送信処理の変更。
- 本番DB操作、schema・migration・env変更。

## 次の独立Task候補

1. 工房返信時の取引先宛通知を、取引先に紐付いた**検証済み**LINE Manager宛先への `LineManagerSendOutbox` に統一する。送信済みは照合結果 `CONFIRMED` のみで判断する。
2. 取引先コメント受信時、工房本人のLINEへ管理者専用のコメントURL付き通知。工房向け宛先はB2C顧客への通常トーク履歴と混同せず独立して管理する。
3. 同時発生通知の重複抑止、宛先未確認時のfail-closed、通知状態・既読・差戻し/キャンセルE2Eテストを実施する。

## ローカル確認

- `npx tsc --noEmit`: PASS
- `npx tsx --test src/lib/repair-comments.test.ts`: 3/3 PASS
- `git diff --check`: PASS
- Production: pending（デプロイ・本番実送信未実施）
