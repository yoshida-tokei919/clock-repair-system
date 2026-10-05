# 第37章 エラー時の切り分け

## 37.1 最初に固定する情報

障害の最初の操作は復旧の再実行ではなく、**症状と影響範囲を固定すること**である。発生時刻、対象機能、画面またはAPIの応答、対象が一件か複数件か、直前の変更、既に行った操作を記録する。HTTP結果を受け取れなかった場合は「失敗」と断定せず**結果不明**と記録する。同じ送信・作成・解放・決済操作を何度も押さない。

![障害の層と確認の順序](../assets/diagrams/troubleshooting-boundary.svg)

調査は「症状の層を固定 → その業務事実の正本を確認 → 上流と下流を分離」の順に進める。browserの表示、Railwayの応答、DBへの保存、objectの保存、Windows local workerの実行、外部サービスの受付は別の事実である。UIの成功・失敗表示だけでDB事実や外部送信結果を推測しない。正本の選び方は[第35章](35_status-source-of-truth.md)、結果不明時の再試行条件は[第36章](36_duplicate-safety.md)を参照する。

## 37.2 症状別の最初の確認先

| 症状 | 最初に見る場所 | 次に見る場所 | やってはいけない近道 |
| --- | --- | --- | --- |
| 管理画面が開けない、未認証で`307`、APIで`401` | browserの対象URL・認証状態、画面routeかAPIか | NextAuth境界、Railway runtimeの該当応答。未認証時は保護画面のredirectとAPIの`401`が期待される場合がある | `307`／`401`だけでDB障害と決める。cookieやsession値を調査記録へ貼る |
| 画面操作で`5xx`、runtime error | Railwayの対象deployment、runtime / HTTP logの失敗段階 | Next.jsの該当route、依存先のDB・Storage・R2・外部API。build成功と起動後の正常動作を分ける | buildの`SUCCESS`だけでruntime正常とする。原因不明の連続再実行 |
| DB接続不可・schema mismatch | Railway runtimeのDBエラー種別、Supabase PostgreSQLの稼働・接続状態 | repo内migration SQLとproduction適用状況、対象table・列・権限のread-back | `prisma generate`やdeployをmigrationとみなす。確認前にDB手動修正・migration再適用 |
| 見積・請求PDFがない／開けない | 文書レコードとSupabase Storage `documents`の保存・読取段階 | server側Storage経路、認証、対象objectの有無 | R2障害と一括判断する。保存先keyやsigned URLをログへ貼る |
| Inquiry画像がない／開けない | `InquiryMessage`、`InquiryFile.uploadStatus`と認証済みfile route | 用途別R2の保存結果・object有無。`STORED`でも読取経路を別に調べる | DBのkeyだけでbody保存済みと断定する。`PENDING`／`FAILED`を表示成功扱いにする |
| RepairPhotoがない／開けない | `RepairPhoto`行とupload/read routeの結果 | 写真用R2 object、DB metadata作成失敗時のrollback結果 | Inquiry画像の`uploadStatus`があるものとして判断する |
| LINE問い合わせのSlack通知が来ない | `LineWebhookInbox`、保存済み`Inquiry`／`InquiryMessage`、`SlackNotificationOutbox`を別々に確認 | n8nの起動・通知処理、Slack側の投稿結果 | Slack未着をInquiry未保存と扱う。Webhook受信だけでInquiry処理完了とする |
| LINE返信が届いたか不明・`POST_UNCONFIRMED` | `LineManagerSendOutbox`の状態と固定された送信intent | Windows local senderの停止段階、Manager履歴の厳密な照合と`CONFIRMED`／`OUTBOUND InquiryMessage` | `APPROVED`を送信済みとする。`POST_UNCONFIRMED`を未送信と決めて再送する |
| Stripe Checkout後も未入金 | `PaymentAttempt`／`Payment`、登録Sessionと署名付きpaid Webhookの照合状態 | Stripe側の該当Session・Webhook結果と、アプリ側の不一致理由 | success画面やSession `complete`だけで入金登録する。結果不明で追加Checkoutを急ぐ |
| ゆうプリR履歴の未知code・照合不能 | 元CSVの形式、`SHP-`管理番号、raw code、重複・追跡番号競合 | Shipmentのsnapshotと外部の実引受証拠 | 未知codeを推測で発送済みにする。`10/0A`（引受予定）を実引受とする |

`307`と`401`は認証された利用者に障害が出ているか、未認証アクセスに対する正常な境界かを分けて読む。記録に残すのはHTTP status、発生段階、影響件数など必要最小限とする。browserのcookie、認証header、secret、顧客PIIを貼り付けない。

## 37.3 層ごとに責任を分ける

1. **browser / UI:** 入力、認証状態、表示、操作後の応答を確認する。表示された候補や「送信待ち」を確定事実へ読み替えない。
2. **Next.js / Railway:** deploymentの対象commitとstatus、build log、runtime log、該当routeの応答を分けて確認する。build成功はruntime正常やDB migration適用の証拠ではない。[第33章](33_railway.md)参照。
3. **Supabase PostgreSQL:** 業務レコード、migration履歴、実際のtable・列、RLS／GRANTを確認する。Next.js serverのPrisma経路とbrowser Data APIを混同しない。[第31章](31_supabase-prisma.md)参照。
4. **Supabase Storage / R2:** PDF bodyはStorage `documents`、Inquiry画像とRepairPhoto bodyは用途別R2経路。DB metadataとobjectの存在をそれぞれ確認する。[第32章](32_cloudflare-r2.md)参照。
5. **Windows local services:** n8nは定期起動・通知処理のorchestration、LINE Manager senderは別のlocal worker。Railwayのruntime正常だけで両方の稼働を保証しない。[第28章](28_line-manager-sender.md)・[第29章](29_n8n.md)参照。
6. **外部サービス:** LINE Manager履歴、Stripeの決済・Webhook、ゆうプリRの実ファイル、Slack投稿結果を、それぞれアプリ側の記録と照合する。Slackは通知先であり問い合わせの正本ではない。[第30章](30_slack.md)・[第34章](34_external-integrations.md)参照。

## 37.4 結果不明なら止めて照合する

LINE Managerの`POST_UNCONFIRMED`、Shipment作成応答不明、PhysicalTag release応答不明、Stripe Session `complete`だがWebhook未確定、ゆうプリRの未知codeは、各々の保存済み状態と外部証拠を先に確認する。許可された条件付きretryと、再送禁止・要確認を一括りにしない。破壊的な復旧操作、DB手動修正、再送、migration再適用は原因不明の第一手にしない。

調査メモやログにsecret、token、cookie、認証header、接続文字列、signed URL、raw object key、顧客PIIを載せない。必要な識別情報も安全な内部手段で照合し、共有する記録には状態・時刻・失敗段階・確認した正本と未確定事項を残す。
