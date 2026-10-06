# Task206B — Customer Communication Hub LINE read-only

Production: complete

## Scope

- 顧客一覧と顧客編集画面から `/customers/[id]/communications` へ遷移できる。
- `Customer -> linked LineUser[] -> Inquiry[] -> InquiryMessage[]` を読み取り、CLOSED を含む全 Inquiry から顧客単位で新しい保存済み LINE 原文 500 件を初期表示する。`Customer.type` による B2C/B2B の除外はしない。
- 全 linked LineUser を横断する 1 クエリで `createdAt desc, id desc` の最大 501 件を取得し、501 件目があれば古い履歴の存在を警告して新しい 500 件のみ表示する。表示順は `occurredAt asc, id asc` とする。
- 受信の `receivedAt`、送信の `sentAt`、欠損時の `createdAt` を表示時刻とする。同時刻は `InquiryMessage.id` で安定化する。
- direction、messageType、Inquiry ID/status、既存 review への導線を表示する。保存済み添付ファイルは既存の認証付き同一 origin route を使う。
- 存在しない Customer は 404、LINE 未紐付けとメッセージ 0 件は別の空状態を表示する。

## Safety

- Server Component の read model のみ。Hub に送信、分類、Repair 関連付け、AI の mutation はない。
- `Customer.lineId` を会話 identity に使用しない。`LineUser.linkedCustomerId` の明示的な紐付けだけを参照する。
- メッセージ取得時にも message / Inquiry 双方の LineUser が対象 Customer に linked されている条件を再確認し、画面取得中の紐付け変更で別顧客の履歴を表示しない。
- pending / uncertain `LineManagerSendOutbox` は送信済み原文として表示しない。`CONFIRMED` 後に保存された OUTBOUND `InquiryMessage` のみを履歴に含める。
- R2 object key、signed URL、LINE Manager destination、外部 message ID を Hub payload に含めない。
- 既存 `/inquiries/[id]/review`、Repair LINE tab、LINE sender、Gmail は変更しない。
- schema / migration / RLS / GRANT / production DB mutation はない。

## Validation

- Review correction: LineUser の再紐付けが読み取り間に起きても別 Customer の履歴を表示しないよう、メッセージ取得クエリで現時点の紐付けを再検証。read model に `channel=LINE` を明示。
- Focused Node tests: 3/3 PASS（時刻優先順、501件取得・500件表示・古い履歴の警告状態/CLOSED/B2B/複数LineUser、Customer不在/未紐付け）。
- TypeScript `tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Production build (`node node_modules/next/dist/bin/next build`): PASS。新規routeは動的生成。
- ローカル未認証 smoke: Hub GET 307（sign-inへ）、既存添付ファイル GET 401。
- 独立Codex review: blocking findingなし。cross-customer leakage、auth/privacy、ordering/truncation、attachment安全性、既存画面へのregressionを確認。
- 認証済みの実データ画面表示: 未確認。未紐付け/0件の分岐は read model test で確認。

## Production

- Status: complete.
- Application commit: `6d59d8d19ffc8ba87e956b8f23f4cec08c311d73` (`feat: add customer LINE communication hub`).
- Railway deployment: `608f5ca0-7e50-4da2-8f71-22d7d5de1e86` — SUCCESS.
- Production tag: `production-task206b-20261007`.
- Railway production build: Prisma generate / Next.js compile / lint・type check PASS。
- Production runtime: Next.js 15.5.27、`Ready in 227ms`、deployment status SUCCESS.
- Production smoke: `/`=200、`/login`=200、`/customers`未認証=307、`/customers/1/communications`未認証=307。対象HTTP logsの `upstreamErrors` なし。
- schema / migration / RLS / GRANT / production DB変更なし。LINE実送信なし。
- 認証済み実データの手動画面確認は未実施。AI側のfocused test、type check、production build、未認証route smokeを完了条件とした。
