# LINE問い合わせ自動化・AI時計識別 要件定義（2026-09-18）

# 位置づけ

この文書は、ヨシダ時計修理工房のB2C LINE問い合わせ受付を、LINE・n8n・Supabase・Cloudflare R2・Slack・ChatGPT（カタリ）で省力化するための現時点の要件定義である。

2026-09-18時点の決定を正本とし、従来の「LINEで相談 → 送付受付フォームで顧客情報＋時計情報を入力 → Repair作成」という受付フローは、本仕様へ段階的に置き換える。

**基本原則**
	- LINE = お客様との会話窓口
	- n8n = 受信・保存・通知・送信など機械的な自動処理
	- Supabase Database = 正式な業務データの正本
	- Cloudflare R2 = LINE画像の非公開保管
	- Slack = 内部通知
	- カタリ = 会話理解、画像判定、情報整理、要約、返信作成
	- ヨシダ = 最終判断・確定・送信承認

# 1. 目標

- LINE問い合わせを受けた時点から会話履歴を自動保存する。
- LINE user ID（LINEユーザーID）で既存顧客との紐付きを判定する。
- 問い合わせとRepair（修理案件）を分離し、1問い合わせから0件・1件・複数件のRepairを扱えるようにする。
- LINEで送られた時計画像を自動保存し、カタリが画像から時計情報候補を抽出できるようにする。
- ブランド、モデル、商品Ref、ケースRef、Calの候補を案件画面に仮入力し、ヨシダが少ない操作で確定できるようにする。
- LINE全文を読み返さなくても分かる会話要約を維持する。
- 返信文作成からLINE送信までを、ヨシダの明示承認を挟んで自動化する。
- ヨシダが普段操作する画面を原則 **LINE公式アプリ + ChatGPT** に絞る。

# 2. 現行フローと新フロー

## 現行

```text
LINE問い合わせ
↓
既存LINE ID確認
↓
必要に応じて手動でCustomerへ紐付け
↓
LINEで相談
↓
依頼確定
↓
送付受付フォーム
↓
お客様が顧客情報 + 時計情報を入力
↓
Repair新規作成
↓
入力内容をもとに時計情報を反映
```

## 新フロー

```text
LINE問い合わせ
↓
n8n
↓
LineUser / Customer照合
↓
Inquiry（問い合わせ）作成または既存Inquiryへ追加
↓
LINE本文をSupabaseへ保存
画像なら圧縮してCloudflare R2へ自動保存
↓
Slackへ内部通知
↓
ヨシダ「カタリ、Slackの新しい問い合わせ処理して」
↓
カタリ
├─ LINE会話確認
├─ 画像確認
├─ 時計本数判定
├─ ブランド候補
├─ モデル候補
├─ 商品Ref候補
├─ ケースRef候補
├─ Cal候補
├─ 不具合・依頼内容抽出
├─ 不足情報判定
└─ 会話要約更新
↓
依頼確定時に時計単位でRepair作成
↓
AI候補をRepairへ引継ぎ
↓
送付受付フォーム
↓
お客様は顧客・返送先情報を中心に入力
※時計情報の再入力は原則不要
↓
ヨシダが案件画面でAI候補を確認
↓
違う箇所だけ修正して確定
```

# 3. Inquiry（問い合わせ）をRepairから分離する

LINEの1会話が時計1本とは限らない。

```text
Inquiry I-001
├─ 時計候補A：ROLEX
├─ 時計候補B：OMEGA
└─ 時計候補C：TUDOR
```

依頼確定後は、

```text
Inquiry I-001
├─ Repair C-101：ROLEX
├─ Repair C-102：OMEGA
└─ Repair C-103：TUDOR
```

とする。

## 理由

- 1問い合わせで複数本の時計相談に対応できる。
- 「相談だけで終了」の場合、Repairを作らずInquiryだけで完結できる。
- n8nに時計本数の意味判断をさせなくてよい。
- カタリが文章と画像を見て時計単位へ整理できる。

# 4. 新規LINE受信時の処理

## 4.1 LINE Webhook

お客様からメッセージを受信するとLINE Webhookからn8nを起動する。

最低限扱う情報:

- lineUserId（LINEユーザーID）
- lineMessageId（LINEメッセージID）
- messageType（メッセージ種別）
- text（本文）
- 受信日時
- LINE表示名
- Webhookイベント情報

顧客識別には表示名ではなくlineUserIdを使用する。

## 4.2 LineUser / Customer照合

現行の `LineUser（LINEユーザー）` と `linkedCustomer（紐付け顧客）` の基盤を利用する。

- LineUserが既存、Customer紐付け済み → 既存顧客として扱う。
- LineUserが既存、Customer未紐付け → 未紐付け顧客として扱う。
- LineUser自体が未登録 → LineUserを作成する。

Customerをいつ正式作成するかは現行 `RepairIntakeInvite（送付受付招待）` 実装との整合を確認して実装時に確定する。問い合わせ受信だけで不要な正式Customerを量産しないことを優先する。

# 5. Inquiryのルーティング

同一LineUserから新しいメッセージを受信した場合:

## OPEN中のInquiryが0件

新規Inquiryを作成する。

## OPEN中のInquiryが1件

そのInquiryへ追加する。

## OPEN中のInquiryが複数件

n8nで勝手に決めず、`NEEDS_REVIEW（要確認）` としてSlack通知する。

誤ったInquiryへの自動紐付けを避ける。

# 6. LINE会話履歴

LINE本文は受信時点でSupabaseへ保存する。

概念モデル例:

```text
InquiryMessage

id
inquiryId
lineUserId
externalMessageId
direction
messageType
body
receivedAt
sentAt
status
```

- `direction = IN` : お客様から受信
- `direction = OUT` : 工房から送信
- `externalMessageId` は重複防止キーとして利用する。
- LINE Webhookが再送されても同じメッセージを二重保存しない。

LINEから後日全文を再取得する前提にはしない。

# 7. LINE画像保存

## 7.1 保存対象

MVPではLINE添付のうち **画像のみ保存**する。

- text: 保存
- image: 保存
- video: 保存しない
- audio: 当面保存しない
- file: 当面保存しない

動画はLINE上で必要に応じて人が確認するが、R2への自動保存処理は作らない。

## 7.2 画像が追加された場合

最初の問い合わせ時だけではなく、会話途中で追加された画像も毎回自動保存する。

```text
LINE画像受信
↓
n8n
↓
LineUser確認
↓
対象Inquiry判定
↓
LINEから画像取得
↓
圧縮・リサイズ
↓
Cloudflare R2 Private Bucketへ保存
↓
InquiryFile作成
↓
SupabaseでInquiryに紐付け
↓
Slackへ「画像追加」通知
```

カタリが画像保存を担当しない。**保存はn8n、画像の意味判断はカタリ**とする。

# 8. Cloudflare R2画像仕様

## 8.1 保存先

顧客LINE画像は公開事例画像と分離したPrivate Bucketを使用する。

例:

```text
public-cases
→ Web公開用

repair-private
→ LINE問い合わせ・修理用非公開画像
```

## 8.2 Supabaseに保存する情報

公開URLを正本として保存しない。

```text
provider
bucket
objectKey
mimeType
fileSize
width
height
createdAt
```

例:

```text
provider = CLOUDFLARE_R2
bucket = repair-private
objectKey = inquiries/<opaque-id>/line/20260918_001.webp
```

個人名、電話番号、LINE user IDなどをobjectKeyへ直接入れない。

## 8.3 画像圧縮

初期基準:

- 長辺最大: 3000px
- WebP
- Quality: 85前後
- 元画像が3000px未満なら拡大しない
- 「必ず1MB以下」などの強制容量制限は設けない

目的は容量最小化ではなく、次の情報を後から拡大して確認できること。

- ケース刻印
- 商品Ref / ケースRef
- 文字盤の小さい文字
- ムーブメント刻印
- 部品形状
- キズ、腐食、損傷

3000px / WebP 85は初期値であり、実際のLINE画像を使ってカタリの識別精度を検証したうえで調整する。

# 9. カタリがR2画像を見る方法

R2 BucketはPrivateのままとする。

必要時のみ一時URLを発行する。

```text
R2 objectKey
↓
期限付きGET URL
↓
Slack通知または取得API
↓
カタリが画像確認
```

一時URLは正式データとして保存しない。

将来はCloudflare Worker経由の専用閲覧URLへ変更してもよい。Supabase側は `provider / bucket / objectKey` を保持するため、取得方式を変更しても業務データへの影響を小さくする。

# 10. Slackの役割

Slackは業務データの正本ではなく、内部通知専用。

推奨チャンネル:

```text
#repair-inbox
#repair-errors
```

通知例:

```text
【新規修理問い合わせ】
Inquiry ID: I-xxxx
顧客: 既存 / 未紐付け
新着メッセージ: 3件
画像: 2枚
AI処理状態: 未処理
```

SlackへLINE全文を複製する必要はない。

ヨシダはLINE公式の通知を見た後、ChatGPTで次のように指示する。

```text
カタリ、Slackの新しい問い合わせ処理して。
```

# 11. カタリの問い合わせ処理

カタリはSlackからInquiry IDを特定し、Supabaseから以下を取得する。

- Inquiry
- LineUser
- Customer（存在する場合）
- InquiryMessage
- InquiryFile
- 過去Repair
- 必要に応じて過去の時計情報

一時URLからR2画像を確認する。

## 11.1 時計本数判定

文章と画像を総合して、問い合わせに何本の時計が含まれるか判定する。

明確:
- 時計ごとに候補情報を作成する。

不明:
- 無理に分割せず `NEEDS_REVIEW` とする。
- ヨシダへ確認点を表示する。

## 11.2 時計識別候補

時計ごとに次を候補化する。

- ブランド
- モデル
- 商品Ref
- ケースRef
- Cal
- ムーブメント種別
- 年代・世代の補足
- 画像から実際に読み取れた文字列
- 判定根拠
- 確度

特に **商品Ref / ケースRef / Calを別項目** として扱う。

例:

```text
ブランド候補: CARTIER
モデル候補: Calibre de Cartier
商品Ref候補: W7100015
ケースRef候補: 3389
Cal候補: 1904-PS MC

observedText:
- W7100015
- 3389
```

画像から読めた文字と、その文字をAIがどう解釈したかは分離する。

# 12. AI候補と正式時計情報を分離する

AIの推定値をそのまま正式データへ確定保存しない。

概念上は、

```text
AI候補
↓
案件画面へ仮表示
↓
ヨシダ確認
↓
正式時計情報へ確定
```

とする。

候補側に保持したい情報:

- 候補値
- confidence（確度）
- evidence（判定根拠）
- observedText（画像から読めた文字）
- sourceImageIds（根拠画像）
- reviewStatus（確認状態）

# 13. 案件画面の時計情報UI

Repair作成後、時計情報入力欄にはAI候補を最初から仮表示する。

例:

```text
ブランド
[ ROLEX ]
AI候補: ROLEX / 高

モデル
[ Explorer II ]
AI候補: Explorer II / 高

商品Ref
[ 16570 ]
AI候補: 16570 / 中

ケースRef
[ 16570 ]
AI候補: 16570 / 中

Cal
[ 3185 ▼ ]
AI候補:
- 3185
- 3186
```

操作方針:

- 正しければ手入力不要。
- 違う箇所だけ修正。
- `AI候補を採用` または通常保存で正式値へ確定。
- 候補が複数ある項目は選択できる。
- AI候補の根拠も確認できる。

# 14. 人間確定値をAIが上書きしない

最重要ルール。

```text
未確定
→ AI候補更新可

ヨシダ確定済み
→ 正式値はAIが変更禁止
→ 新しいAI判定は候補としてのみ提示
```

追加画像が届いて判定が変わっても、人間が確定したブランド・モデル・Ref・Calを自動上書きしない。

# 15. 追加画像と再判定

お客様が後から裏蓋写真やムーブメント写真を追加した場合:

1. n8nが自動保存。
2. InquiryFileへ追加。
3. Slackで追加画像を通知。
4. カタリが新着画像を確認。
5. AI候補の確度・候補リストを更新。
6. 人間確定済み項目は変更しない。

例:

```text
初回
商品Ref候補: 16570系 / 中

裏蓋画像追加後
商品Ref候補: 16570 / 高
```

# 16. 写真不足の自動判定

カタリは時計特定や問い合わせ対応に必要な写真が不足していれば提示する。

例:

```text
追加画像推奨
- 裏蓋
- リューズ側
- ムーブメント
```

ヨシダは、

```text
裏蓋写真だけお願いしよう。
```

のように必要なものだけ選べる。

# 17. 不具合・依頼内容・不足情報抽出

時計識別とは別に会話から次を抽出する。

## 不具合

- 止まり
- 遅れ
- 進み
- 巻上げ不良
- リューズ抜け
- 水入り
- 針外れ
- その他

## 依頼内容

- OH希望
- 点検希望
- 見積希望
- 部品交換
- 外装補修
- その他

## 補足

- 前回OH時期
- 購入時期
- 落下歴
- 浸水歴
- 使用状況
- 希望
- 予算
- 希望納期
- 思い入れなど

書かれていない内容を推測して正式値にしない。

# 18. 会話要約

Inquiryには常に最新状態の `conversationSummary（会話要約）` を持つ。

会話ログを追加し続けるだけではなく、現在の状況を短い文章へ更新する。

例:

```text
ROLEX Explorer II Ref.16570と思われる時計の修理相談。
5年以上OH歴なし。使用中に停止するが、振ると一時的に動作する。
裏蓋写真追加済み。現物確認のため送付案内を検討中。
```

案件作成後は時計ごとの要約もRepairへ引き継ぐ。

# 19. 既存顧客の場合

既存Customerへ紐付いている場合、カタリは必要に応じて過去Repairを確認する。

- 前回修理時計
- ブランド / モデル / Ref
- 過去OH
- 過去の不具合
- 直近修理時期

ただし過去案件と今回の時計を自動で同一と断定しない。

# 20. Repair作成タイミング

n8nはRepairを作らない。

n8nはInquiryまでを担当する。

Repairは、カタリによる時計本数・情報整理後、原則として **お客様の依頼が具体化した段階** で時計1本につき1件作成する。

これにより:

- 相談だけで終了 → Inquiryのみ
- 時計1本 → Repair 1件
- 時計3本 → Repair 3件

となる。

実装時には「依頼確定」の具体的トリガーを、現行送付受付導線と合わせて定義する。

# 21. 送付受付フォームの新しい役割

現行フォームは「顧客情報 + 時計情報を入力しRepairを作成する」役割を持つ。

新仕様では時計情報入力を原則廃止する。

フォームの主目的を、

**Customer / 返送・送付に必要な情報を完成させること**

へ変更する。

主な入力候補:

- 氏名
- 郵便番号
- 都道府県
- 市区町村
- 番地
- 建物名・部屋番号
- 電話番号
- 必要な同意項目

時計については必要なら、

```text
今回お送りいただく時計: 2点
```

程度の本数確認だけを残す。

ブランド、モデル、Ref、症状などをLINEで聞いた後に再入力させない。

# 22. 返信文作成

問い合わせ処理後、カタリはChatGPT上に次を表示する。

- 時計識別候補
- 不具合
- 依頼内容
- 会話要約
- 不足情報
- 追加で聞くべき内容
- 画像不足
- 必要なら返信案

ヨシダはこの画面で返信内容を相談する。

例:

```text
ヨシダ:
前回OH時期と、完全停止か振れば動くのか聞こう。

カタリ:
返信文を作成
```

# 23. LINE送信は人間承認必須

返信案を作っただけではLINE送信しない。

概念モデル:

```text
OutgoingMessage

DRAFT
↓
APPROVED
↓
SENDING
↓
SENT

失敗:
SENDING
↓
FAILED
```

ヨシダの、

```text
それで送って。
```

を明示承認として扱う。

送信条件:

```text
status == APPROVED
approvedAt != null
sentAt == null
```

を満たす場合だけn8nがLINE送信する。

内部通知にLINE Pushは使用せずSlackを利用する。

# 24. 二重送信・二重保存防止

## 受信

`lineMessageId（LINEメッセージID）` を一意キーとして二重保存防止。

## 送信

送信前に `APPROVED → SENDING` へ更新し、同じメッセージが複数回送られないようにする。

# 25. 自動化失敗時の処理

自動化は失敗する前提で設計する。

例:

```text
LINE受信
↓
Supabase保存成功
↓
Slack通知失敗
```

この場合でも受信データは残す。

処理状態例:

- PENDING
- PROCESSING
- PROCESSED
- NEEDS_REVIEW
- FAILED

重大エラーは `#repair-errors` へ通知する。

再実行しても重複データや二重送信が発生しないidempotent（二重実行安全）設計を必須とする。

# 26. 問い合わせ状態

Inquiry側では少なくとも次の状態を区別できるようにする。

- OPEN
- AI_PENDING
- AI_PROCESSED
- NEEDS_REVIEW
- WAITING_CUSTOMER
- READY_FOR_INTAKE
- CLOSED

表示名・状態数は実装時に現行Repair statusと混同しないよう最終整理する。

# 27. ヨシダの日常操作

## 新着

1. LINE公式アプリの通知を見る。
2. ChatGPTを開く。
3. 「カタリ、Slackの新しい問い合わせ処理して」と依頼。

## カタリ処理後

ChatGPT上で、

- 問い合わせ要約
- 時計本数
- ブランド候補
- モデル候補
- 商品Ref候補
- ケースRef候補
- Cal候補
- 不具合
- 不足情報
- 追加画像推奨

を確認。

## 返信

1. ヨシダが返信方針を指示。
2. カタリが返信文作成。
3. ヨシダが「それで送って」。
4. n8nがLINE送信。
5. Supabaseへ送信履歴保存。

原則としてSlack、R2、Supabase管理画面を日常操作しない。

# 28. システム別責務

## LINE

- 顧客との会話
- 画像受信
- 顧客への返信

## n8n

- LINE Webhook受信
- メッセージ正規化
- LineUser / Inquiryルーティング
- Supabase保存
- 画像取得
- 画像圧縮
- R2保存
- Slack通知
- 承認済みLINE返信送信
- エラー通知

## Supabase Database

- LineUser
- Customer
- Inquiry
- InquiryMessage
- InquiryFile情報
- AI処理状態
- AI時計識別候補
- Repair
- OutgoingMessage
- 正式な時計情報

## Cloudflare R2

- LINE画像本体
- Private Bucket
- 一時閲覧URLの元データ

## Slack

- 新着問い合わせ通知
- 画像追加通知
- AI処理待ち通知
- エラー通知

## カタリ

- Slack通知確認
- Supabaseデータ確認
- 一時URL画像確認
- 時計本数判定
- 画像から時計識別
- 会話要約
- 不足情報抽出
- 写真不足判断
- Repair候補情報作成
- 返信文作成
- ヨシダ承認後の送信データ確定

## ヨシダ

- AI候補の最終確認
- 時計情報の正式確定
- 不明点への技術判断
- 顧客返信の最終承認

# 29. AI時計識別の安全ルール

- AIは候補を出す。
- 不明なものは「不明」とする。
- 商品RefとケースRefを混同しない。
- Calを外観だけで断定しない。
- 複数候補が妥当なら複数出す。
- 画像から読めた文字列を別途保存する。
- 判定根拠を短く残す。
- 人間確定値は上書きしない。
- 画像だけで確定できない場合は追加画像や現物確認を提示する。

# 30. 将来拡張

受付フロー安定後に次を検討する。

- 画像から過去修理事例検索
- Ref / CalからPartsMaster候補検索
- PricingRuleから概算候補提示
- 過去同型Repairから修理内容・価格参考表示
- 修理優先順位・スケジュール作成との連携
- Cloudflare Workerによる画像閲覧ゲートウェイ
- 高解像度刻印部分の再切り出し処理

# 31. 実装優先順位

## Phase 1: 受信基盤

- Inquiry設計
- LINE Webhook → n8n
- LineUser照合
- InquiryMessage保存
- 画像R2保存
- InquiryFile紐付け
- Slack通知
- idempotency / エラー処理

## Phase 2: カタリ処理

- SlackからInquiry特定
- Supabase読取
- R2一時URL
- 会話要約
- 時計本数判定
- ブランド / モデル / 商品Ref / ケースRef / Cal候補
- 確度 / 根拠 / observedText保存
- ChatGPT上へ結果表示

## Phase 3: Repair作成・受付フォーム変更

- Inquiry → 複数Repair対応
- AI候補引継ぎ
- 案件画面AI候補UI
- 人間確定値保護
- 送付受付フォームから時計情報入力を原則削除
- 顧客・返送先情報中心へ変更

## Phase 4: LINE返信

- OutgoingMessage
- DRAFT / APPROVED / SENDING / SENT / FAILED
- ヨシダ明示承認
- n8n送信
- 送信履歴保存
- 二重送信防止

# 32. 現行実装との関係

現行にはすでに以下が存在する。

- `LineUser（LINEユーザー）`
- `linkedCustomer（紐付け顧客）`
- `RepairIntakeInvite（送付受付招待）`
- `/customer/intake/[token]`
- 送付受付フォームで顧客情報・時計情報を受け取りRepairを作成する処理

これらを一度に削除しない。

実装開始時に現行schema / API / UI / migrationを調査し、既存の受付・共有ページ・帳票・LINE送信へ影響を出さない最小差分で段階移行する。

特に新仕様では、

**「送付受付フォームが時計情報を作る」から「LINE Inquiry + カタリが時計情報候補を作り、フォームは顧客・返送情報を補完する」へ責務が変わる。**

# 33. 完了条件

最終的に次の一連の操作が成立すること。

```text
お客様がLINEで問い合わせ・画像送信
↓
自動保存
↓
Slack通知
↓
ヨシダ「カタリ、処理して」
↓
カタリが会話・画像を解析
↓
時計情報候補と要約を保存
↓
このチャットへ結果表示
↓
必要事項を相談
↓
返信文作成
↓
ヨシダ「それで送って」
↓
n8nがLINE送信
↓
送受信履歴保存
↓
依頼確定
↓
時計単位でRepair作成
↓
AI候補を案件画面へ仮表示
↓
ヨシダが違う部分だけ修正して確定
↓
お客様は時計情報を再入力せず送付受付を完了
```

この状態を本受付フローの目標とする。
