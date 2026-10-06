# Task206A — B2C/B2B共通 Customer Communication Hub 設計・影響範囲調査

Production: pending

## Status

- investigation / design complete
- runtime implementation: not started
- schema / migration / RLS / GRANT / production DB mutation: none
- LINE real send / Gmail real send: none

## Goal

B2C/B2Bを分けた会話機能にせず、Customerを起点にLINE・メールを継続して確認できる共通Communication Hubを設計する。

案件化前後にかかわらず顧客・取引先との全会話を失わず、Repair画面ではその全会話のうち案件へ関連付けられた内容だけを投影する。AI分類は補助であり、案件に分類できない相談・再修理・新規問い合わせ・請求関係・未特定メッセージも全体画面には必ず残す。

## User requirements fixed in this Task

- B2C/B2B共通で、案件画面とは別に「顧客との全やり取り」を表示する専用画面を持つ。
- 見た目・操作感は現行B2C InquiryのLINE画面を基本にする。
- B2CはLINEを中心に扱う。
- B2BはLINEに加えてGmailメールを扱えるようにする。
- Repair画面には、そのRepairに関連付けられた会話だけを表示する。
- 全体画面ではRepair未割当・新規相談・再修理相談・一般連絡等も含めた全履歴を表示する。
- カタリの案件要約、未対応事項、顧客指定、承認・決定事項等をRepair画面へ表示できるようにする。
- 人間が確定した分類はAIが上書きしない。
- B2BでもLINE identityはB2Cの既存基盤を再利用し、別系統のLINE ID管理を作らない。

## Current findings

### 1. CLOSED Inquiryのデータは消えないが、一覧からは消える

`/inquiries` は `status != CLOSED` のInquiryだけを表示する。案件化して全InquiryWatchがterminalになると `reconcileInquiryClosure()` がInquiryをCLOSEDへ変更するため、通常の問い合わせ一覧からは見えなくなる。

一方 `/inquiries/[id]/review` 自体はCLOSEDを拒否しておらず、URLまたはRepair側のリンクから元Inquiryを開くことはできる。問題は履歴消失ではなく「顧客単位の継続画面がない」こと。

### 2. 案件化後の新着LINEは新しいInquiryへ入ることがある

LINE inbound processorは同じLineUserにactive Inquiryが0件なら新しいInquiryを作成する。CLOSED Inquiryはactive対象外なので、案件化後の新着LINEは元Inquiryへ追加されず、新しいInquiryへ保存される。

これは新規相談・再修理・別案件の混在を考えると妥当な区切りだが、現行Repair LINEタブは元Inquiryしか読まないため後続会話がRepairから見えない。

### 3. 現行Repair LINEタブはoriginating Inquiry依存

`RepairLineConversation` / `repair-line-chat.ts` は `Repair.inquiryWatchPromotion -> Inquiry` を唯一のoriginとして扱う。

そのため以下は現状そのままでは利用できない。

- B2B一括受付から作られ、Inquiry originを持たないRepair
- B2C案件化後に別Inquiryへ入った後続メッセージ
- 同じCustomerの複数Inquiryを横断した全履歴

### 4. LINEの原文正本は既に安全に保存されている

`InquiryMessage` はLINE受信・確認済み送信のimmutable source recordとして扱われている。既存履歴をCommunication Hub用にコピーし直す必要はない。

Customer HubのLINE read modelは、`Customer -> LineUser[] -> Inquiry[] -> InquiryMessage[]` を横断して時系列統合できる。初期のread-only Hubはschema変更なしで構築可能。

### 5. LINE identityはLineUserを正本にする

既存の安全な経路は以下。

`LINE webhook userId -> LineUser.lineUserId -> LineUser.linkedCustomerId -> Customer`

通常トークの送信先はさらに、immutable inbound message evidenceから検証された `LineManagerChat` を必要とする。

`Customer.lineId` は現行UIから手入力可能で、processorのauto-link補助にも使われているが、verified chat destinationそのものではない。Communication Hubでは `Customer.lineId` 単独を送信先根拠にしない。

### 6. 現行のRepair関連付けはpost-intake用途には不足

`InquiryMessageRepairLink` は `InquiryMessageClassification` から派生し、WATCHESなら同一InquiryのInquiryWatch promotion、COMMONなら同一Inquiry内のpromoted Repairsから再構築される。

したがって、案件化後に別Inquiryへ入ったメッセージを「既存Repair Aへ直接関連付ける」正本としては使えない。既存のpre-intake分類を壊さず、post-intake用の直接Repair associationを別Taskで設計する必要がある。

### 7. 現行LINE outboxもInquiry依存

`LineManagerSendOutbox.inquiryId` は必須。`createApprovedLineManagerSendOutbox()` はInquiryとverified LineManagerChatのLineUser一致を検証し、Repair由来送信ではそのRepairがoriginating Inquiryから昇格したことまで検証する。

確認済みOUTBOUNDも `InquiryMessage` として保存されるため、Customer Hubからの送信を単純にCustomer直結へ変更できない。sender/reconciliationの安全性を維持したまま、会話segmentとしてInquiryをどう扱うかを別Taskで決める。

## Architecture decision

### A. Inquiryは削除しない

Inquiryは今後も以下を担う。

- LINE webhook inboundの保存segment
- 新規相談のreview / AI intake
- InquiryWatchによる案件化前の時計単位分類
- InquiryWatchPromotionによる「このInquiryからこのRepairが生まれた」という出生記録

Communication Hub化のために既存Inquiry/InquiryMessageを一括移行・削除・置換しない。

### B. Customer Communication Hubを全会話の閲覧入口にする

Customer単位の専用画面を追加し、channelごとのsource recordを表示時に共通DTOへ正規化する。

概念上の表示DTO例:

- channel: `LINE | EMAIL`
- direction: `INBOUND | OUTBOUND`
- sourceId / sourceConversationId
- occurredAt
- subject（emailのみ）
- body
- attachments
- relatedRepairIds
- classification source: `AI | MANUAL | NONE`
- pending / confirmed等の送信状態

DB上でLINEとEmail原文を無理に1 tableへ統合しない。原文正本はchannelごとに保持し、UI/read modelで統合する。

### C. Repair画面はCommunication Hubのprojectionにする

Repair画面の「LINE」タブは最終的に「やり取り」へ拡張する。

- このRepairに明示関連付けされたLINE/Email
- Repair単位のカタリ要約
- 未対応事項
- 顧客指定事項
- 承認・決定事項
- 直近の重要会話
- 「この顧客との全やり取りを見る」導線

を表示する。

Repair画面に表示されないメッセージもCustomer Communication Hubから消してはならない。

### D. AI分類は補助であり、全件分類を要求しない

post-intakeでは1メッセージが以下を同時に含み得る。

- 既存Repair A
- 既存Repair B
- 再修理相談
- 新規時計相談
- 請求・納品関係
- 一般連絡

そのため1メッセージ=1Repairを強制しない。複数Repair関連、案件外、未特定を許容する。

AIが曖昧と判断した場合は未特定のまま残す。MANUAL確定をAIで上書きしない既存原則を継承する。

### E. B2BもLINE identityは既存B2Cと共通

B2B一括受付からRepairを作成した場合でも、LINE利用時はCustomerに紐づく既存LineUser/verified LineManagerChatを使用する。

B2B専用のLINE ID、B2B専用chat mapping、Customer名やdisplayNameによる曖昧matchingは追加しない。

### F. EmailはGmail channel adapterとして追加する

現行repoにはGmail送受信実装は存在しない。Communication HubのLINE基盤を先に完成させ、その後Gmailを別channelとして追加する。

メールのみを使うB2B取引先でもCustomer Communication Hubを同じ入口として使用する。Gmailのmessage/thread identity、OAuth、同期、添付、送信確認、返信thread維持はLINE senderとは独立したTaskに分離する。

## Document / billing follow-up requirements

Communication Hub本体と帳票送信・印刷は同一Taskに混ぜない。ただし後続設計は以下を前提とする。

- 見積書: `LINEで送信` / `Gmailで送信`
- 納品書: 紙同梱を基本。`NEC MultiWriter 5750Cで印刷`をprimary、`LINEで送信`を補助
- 請求書: B2B月末締め翌月末払い。LINE利用先は通常トーク、LINE非利用先は普通郵便
- 入金確認はユーザーが銀行側で行い、銀行API連携はしない
- 月次請求書生成自体は既存機能を再利用する
- 5750Cはブラウザ既定プリンターに依存させず、専用ローカル印刷bridgeから明示指定する

Customerには既にemail / zipCode / address等がある。現行 `updateCustomer()` は画面上のzipCode変更を保存していないため、郵送運用前の別Taskで修正対象とする。

## Proposed implementation Tasks

### Task206B — Customer Communication Hub LINE read-only

- schema変更なしを第一候補とする
- `/customers/[id]/communications` 等のCustomer単位画面を追加
- CustomerにlinkedされたLineUser配下の全InquiryMessageをInquiry横断で時系列表示
- CLOSED Inquiryも含む
- 現行Inquiry reviewへのリンクを保持
- pending outboxの表示範囲は安全性を確認してから決める
- 送信・分類mutation・AI自動分類はまだ行わない

### Task206C — post-intake Repair association foundation

高リスクschema Task。

- 新しいInquiryに入ったLINEを既存Repairへ直接関連付け可能にする
- pre-intakeのInquiryWatch分類を壊さない
- multi-Repair / unassigned / general communicationを許容
- source=`AI | MANUAL`とmanual priorityを持つ
- 既存 `InquiryMessageRepairLink` を拡張するか新しいassociation modelを追加するか、migration前に独立レビューで決定
- server-internal tableならRLS enabled / browser Data API grantなしを基本とする

### Task206D — Repair「やり取り」projection + summary foundation

- 現行 `RepairLineConversation` を段階移行
- originating Inquiryだけでなくpost-intake associationも表示
- Customer Hubへの導線追加
- AI要約保存・更新のdata shapeを定義
- 原文は変更しない

### Task206E — Customer-level LINE send continuation

高リスクLINE Task。

- Customer Hubから通常トーク返信できるようにする
- verified `LineManagerChat` 必須を維持
- current outbox / fence / reconciliation / immutable OUTBOUND source recordingを維持
- `LineManagerSendOutbox.inquiryId` と `InquiryMessage.inquiryId` の既存契約をどう継続するかを先に決定
- dummy Inquiryを無条件作成する設計は禁止
- 実LINE送信はproduction前に明示承認必須

### Task206F — Gmail channel foundation

- Customer.emailをidentity候補として利用するが、送受信message identityはGmailの正式IDで保持
- Gmail OAuth / token storage / scopes / sync / send / reply / attachmentを分離設計
- Customer HubにLINE/メール切替と統合時系列を追加
- メールだけのB2B取引先をサポート
- Gmail実送信は明示確認を残す

### Task206G — AI post-intake classification / summaries

- LINE / Email共通の正規化read contextを入力にする
- 既存Repair候補、新規相談、再修理候補、一般連絡、未特定を扱う
- confidence不足時は未特定
- manual associationは上書きしない
- Repairごとの要約・未対応・顧客指定・決定事項を更新

### Task207系 — 帳票delivery channel / 5750C印刷 / 月次請求送付

Communication Hub安定後に分離実装する。

- 顧客ごとの見積送付方法 `LINE | EMAIL`
- 請求書送付方法 `LINE | POSTAL`
- 見積書Gmail送信
- 納品書5750C明示印刷 + optional LINE
- 請求書LINE通常トーク化
- 郵送請求書の5750C一括印刷
- 月末締め翌月末支払期日の自動設定

## Migration / rollout policy

- 既存B2C Inquiry/InquiryMessage/LineManagerChat/outboxを一括置換しない。
- 最初はread-only Hubを追加し、既存B2C画面と併存させる。
- post-intake associationを追加した後にRepair表示を切り替える。
- LINE送信経路の変更はread pathから分離する。
- GmailはLINE安定後にchannel追加する。
- schema / migration / RLS / GRANT / LINE sender変更は実装担当と独立レビュー担当を分離する。
- production migration / LINE実送信 / deployはユーザー明示承認前に実行しない。
