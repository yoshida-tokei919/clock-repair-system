# Task201D — ゆうプリクラウド公開デモ Playwright PoC

Status: local PoC validated

Production: pending / demo-only PoCには適用なし

## 対象と再実行

- 公開デモ入口: https://static.btoolboxprintservice.jp/yu-pri-cloud/demo/index.html
- 公式操作説明書 Ver4.0（2026-08-25）: https://www.post.japanpost.jp/yu-pri-cloud/member/VariousContents/%E3%82%86%E3%81%86%E3%83%97%E3%83%AA%E3%82%AF%E3%83%A9%E3%82%A6%E3%83%89%E6%93%8D%E4%BD%9C%E8%AA%AC%E6%98%8E%E6%9B%B8.pdf
- 実行: `npx playwright test tests/yupuri-cloud-demo.spec.ts --browser=chromium --workers=1`
- Playwright Chromium のみ使用。認証情報、production login、実顧客データ、production 側の外部 mutation は使わない。
- テストは入口 URL と全リクエストを公開デモの `https://static.btoolboxprintservice.jp/yu-pri-cloud/demo/` に制限する。デモ HTML が参照する Font Awesome の外部 CSS は取得せず遮断し、それ以外のデモ外リクエストが現れたら失敗する。

## 実際に通った画面と境界

1. `/yu-pri-cloud/demo/index.html` を開くと `/yu-pri-cloud/demo/invoices/invoices.html` へ転送され、「ゆうプリクラウド【デモサイト】」の送り状データ一覧が表示された。
2. 「新規登録」→「一括アップロードへ」で `/yu-pri-cloud/demo/invoices/invoices-upload.html` に遷移した。「取込サンプルフィルタ」を選ぶと入力欄に名前が表示された。別の選択肢は「webゆうプリ用テンプレート」。Task201C の17列用カスタム取込フィルタはデモに存在しない。
3. アップロード画面には `accept=".csv"` の実際の file input がある。合成した不完全なテスト CSV を Playwright の `setInputFiles` で選ぶとファイル名が表示された。「アップロード」を押すと一覧へ戻ったが、CSV データは一覧に追加されず、POST 等の非 GET リクエストもなかった。**ファイル選択は本物の DOM 操作、取込処理はデモ上の画面遷移のみ**。
4. 一覧の「送り状種別」select に「シート式ラベル(ユ00783)」があり、Playwright で選択できた。この select は一覧の絞り込み表示用であり、実際の送り状設定や Task201C CSV の種別 `0` の受理を証明しない。
5. デモの既存行をチェックして「送り状を発行」を押せた。公開デモ内で新たな発行リクエストや生成 PDF は確認できなかった。
6. 「送り状のダウンロード」で `/yu-pri-cloud/demo/invoices/invoices-export.html` に遷移した。発行済み「シート式ラベル(ユ00783)」行のリンク先は `/yu-pri-cloud/demo/assets/invoice_sample.pdf`。Playwright の download event で `invoice_sample.pdf` を取得し、先頭 `%PDF-` を確認した。**PDF は実際にダウンロードできる静的サンプルであり、今回の CSV や発行操作から生成されたファイルではない**。

## セレクタと安定性

- 主に role / 表示テキストでボタン、リンク、行、checkbox を指定し、各画面の URL を完全一致で確認する。file input は `input[type="file"][accept=".csv"]` で確認する。
- デモの「一括アップロードへ」は button/link でなく clickable span、取込フィルタはラベルに紐付かない readonly input、ラベル種別 select も label の `for/id` 紐付けがない。そのため該当箇所だけ表示テキスト、`#filterSelectInput`、可視 select と option 文言で指定する。
- 既存デモ行には同じ管理番号の重複があり、発行済みユ00783行も複数ある。該当文言で絞った後の `.first()` はそのために必要。固定の日時、座標、全体の `nth()` に依存しない。
- 公開デモの HTML、文言、静的アセット URL が変わればテストの更新が必要。これは実サービス DOM の安定性を示すものではない。

## この PoC では証明できないこと

- Task201C の17列 CSV、UTF-8 BOM、列見出し、コード、住所等が実サービスのカスタム取込フィルタで受理されるか。
- 送り状発行処理と新規 PDF の生成、発行枚数・有効期限・ダウンロード回数の実動作。
- `SHP-{Shipment.id}` が実際の送り状へ保持され、発行結果と機械照合できるか。デモの既存行は別の管理番号を表示する。
- 追跡番号を発行後の DOM または公式出力データから `SHP-{Shipment.id}` と対応付けて取得できるか。デモの発行後一覧にサンプル追跡番号へのリンクはあるが、今回の CSV・PDF に対応した証拠ではない。
- production の login、session、MFA、利用条件、実契約でのユ00783利用可否、A4固定印刷、実アカウントでの画面・ネットワーク動作は未確認。

Task201C adapter、Shipment、trackingNumber、printer、LINE、DB、production route の変更はない。production へ push / deploy していない。

## Local validation

- Public demo Chromium Playwright PoC: 1/1 PASS。PDF download event と PDF signature を確認。
- Task201C focused adapter / route regression: 8/8 PASS。
- TypeScript `npx tsc --noEmit --incremental false`: PASS。`npm ci --ignore-scripts` 後に Prisma Client 未生成で初回は失敗し、`npx prisma generate` 後に PASS。
- `git diff --check`: PASS。
- アプリ本体・build 対象コードに変更がないため、full Next.js build は実施していない。
