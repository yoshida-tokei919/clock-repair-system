# Task213A — Document issued date controls

## Scope

EstimateDocument, DeliveryNote, Invoice, Warrantyの発行日と、それぞれの管理画面・PDF表示のみ。schema / migration / env変更なし。送料・料金マスタは対象外。

## Behavior

- 発行前に発行日確認ダイアログを表示する。初期値は確定操作時のAsia/Tokyo暦日。手入力は厳格な`YYYY-MM-DD`でサーバー検証し、JSTの0時に対応する時刻を`issuedDate`へ保存する。
- 4種とも発行後の管理画面で発行日を編集できる。日付選択やダイアログを開くだけでは保存しない。同じ日付の再保存は行わない。
- 納品書・保証書の動的PDF、見積書・請求書の保存済みPDF生成時、発行日はJST暦日で表示する。保証開始日・終了日は発行日変更で変更しない。
- 見積書・請求書に現行PDFがある場合は、既存のPDF生成経路で新バージョンを作る。新しい`issuedDate`と現行PDF参照は公開トランザクション内で同時に更新する。失敗時は既存のPDFと日付を維持する。

## Guards

- 発行・変更は既存Admin認証を要求。入力文字列はサーバー側で検証する。
- 納品書は請求書への紐付け、または過去の`InvoiceRepairSnapshot`が一件でもあれば日付変更を拒否する。請求書発行時には納品書行をロックして、発行日が読込時から変わっていないことを確認してからスナップショットを作成する。対象月・請求明細の履歴を後から移動しない。
- 保存済みPDFがある見積書・請求書は単純な日付PATCHを拒否する。請求書PDF再生成は既存の取消状態・LINE送信中・未解決Outboxガードを維持し、並行する日付変更も拒否する。
- 採番、請求対象月、支払期日、金額・前受金・請求スナップショットの計算は変更しない。

## Verification

- JST日付境界（`2026-10-14T15:30:00Z`→`2026-10-15`）、うるう年と不正日付、指定日による作成日付、各種変更ガードのfocused tests。
- Invoice PDF公開の原子的な日付・版切替と競合拒否テスト。
- TypeScript型チェック、`git diff --check`。

Production: pending. Local commit only; deploy / pushなし。
